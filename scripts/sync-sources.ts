import { prisma } from "@/lib/prisma";
import type { Section } from "@/lib/types";

import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

type PackConfig = {
  enabled: boolean;
  providers: Array<{
    id: string;
    enabled: boolean;
    type: "github_opml_directory";
    repo: string; // "owner/repo"
    branch?: string;
    directories: Array<{ path: string; defaultSection: Section }>;
  }>;
  extraOpml: Array<{ name: string; url: string; section: Section; country?: string }>
};

type FeedCandidate = {
  section: Section;
  name: string;
  url: string;
  type: "rss";
  country?: string;
  trustScore: number;
};

const ROOT = process.cwd();
const SEED_PATH = path.join(ROOT, "sources", "seed-sources.json");
const PACKS_PATH = path.join(ROOT, "sources", "packs.json");

function envBool(name: string, fallback: boolean) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function guessTrustScore(url: string): number {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    if (h.endsWith(".gov") || h.endsWith(".edu")) return 92;
    if (h.endsWith(".int")) return 88;
    if (/(nasa\.gov|esa\.int|jpl\.nasa\.gov)/.test(h)) return 95;
    if (/(reuters\.com|apnews\.com|bbc\.co\.uk|aljazeera\.com|ft\.com|wsj\.com|nytimes\.com|economist\.com)/.test(h)) return 90;
    if (/(nature\.com|sciencemag\.org|science\.org|phys\.org|arxiv\.org|ieee\.org|acm\.org)/.test(h)) return 88;
    if (/(medium\.com|substack\.com|blogspot\.com)/.test(h)) return 62;
    if (/(reddit\.com)/.test(h)) return 55;
    return 70;
  } catch {
    return 65;
  }
}

function looksLowQuality(url: string): boolean {
  const bad = [
    "dailymail.",
    "the-sun.",
    "tmz.",
    "clickhole.",
    "viral",
    "casino",
    "lottery",
  ];
  const l = url.toLowerCase();
  return bad.some((b) => l.includes(b));
}

function mapSectionFromFileName(fileBase: string, fallback: Section): Section {
  const n = fileBase.toLowerCase();
  if (/(space|astronomy|cosmo|planet|nasa|esa|physics|science)/.test(n)) return "universe";
  if (/(quran|hadith|sunnah|fiqh|islam|religion|faith)/.test(n)) return "faith";
  if (/(history|heritage|museum|ancient)/.test(n)) return "history";
  if (/(signals|patent|filing|preprint|arxiv)/.test(n)) return "early";
  if (/(security|cyber|privacy|vulnerability|infosec|programming|developer|software|tech)/.test(n)) return "tech";
  if (/(startup|robot|aerospace|aviation|ai|artificial|engineering|hardware|innovation)/.test(n)) return "innovators";
  if (/(education|design|maker|craft|community|ethics)/.test(n)) return "creators";
  if (/(news|world|global|politics|economy)/.test(n)) return "global";
  return fallback;
}

// Common subset only; unknown countries keep null (still works via topic filtering).
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  bangladesh: "BD",
  india: "IN",
  pakistan: "PK",
  "united states": "US",
  "united kingdom": "GB",
  canada: "CA",
  australia: "AU",
  japan: "JP",
  germany: "DE",
  france: "FR",
  spain: "ES",
  italy: "IT",
  china: "CN",
  russia: "RU",
  ukraine: "UA",
  turkey: "TR",
  indonesia: "ID",
  malaysia: "MY",
  singapore: "SG",
  saudi: "SA",
  qatar: "QA",
  uae: "AE",
};

function inferCountryFromFileName(fileBase: string): string | undefined {
  const k = fileBase.toLowerCase().trim();
  return COUNTRY_NAME_TO_CODE[k];
}

function parseOpml(opmlXml: string): Array<{ title: string; url: string }> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    allowBooleanAttributes: true,
  });
  const doc: any = parser.parse(opmlXml);

  const outlines = doc?.opml?.body?.outline;
  const out: Array<{ title: string; url: string }> = [];

  function walk(node: any) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    const xmlUrl = node.xmlUrl || node.url;
    const text = node.title || node.text || node.name;
    if (xmlUrl && typeof xmlUrl === "string" && /^https?:\/\//.test(xmlUrl)) {
      out.push({ title: String(text || "Untitled"), url: xmlUrl });
    }
    if (node.outline) walk(node.outline);
  }

  walk(outlines);
  return out;
}

async function fetchText(url: string, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "AtlasAssistant/1.1 (+https://example.invalid)",
        accept: "application/xml,text/xml,application/opml+xml,*/*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function githubListOpmlFiles(repo: string, dir: string, branch: string) {
  const api = `https://api.github.com/repos/${repo}/contents/${dir}?ref=${branch}`;
  const json = await fetchText(api, 15000);
  const data: any = JSON.parse(json);
  if (!Array.isArray(data)) return [];
  return data
    .filter((it) => it && it.type === "file" && typeof it.name === "string" && it.name.toLowerCase().endsWith(".opml"))
    .map((it) => ({ name: String(it.name), downloadUrl: String(it.download_url) }));
}

async function main() {
  const syncEnabled = envBool("SOURCE_SYNC_ENABLED", true);
  if (!syncEnabled) {
    console.log("SOURCE_SYNC_ENABLED=false → skipping source sync.");
    process.exit(0);
  }

  const max = clamp(Number(process.env.SOURCE_SYNC_MAX || 1400), 50, 5000);
  const includePlenary = envBool("SOURCE_SYNC_PLENARY", true);

  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8")) as Array<any>;
  const seen = new Set<string>();

  const candidates: FeedCandidate[] = [];
  for (const s of seed) {
    if (!s?.url || typeof s.url !== "string") continue;
    if (looksLowQuality(s.url)) continue;
    const url = s.url.trim();
    if (seen.has(url)) continue;
    seen.add(url);
    candidates.push({
      section: s.section,
      name: String(s.name || url),
      url,
      type: "rss",
      country: s.country ? String(s.country) : undefined,
      trustScore: clamp(Number(s.trustScore || guessTrustScore(url)), 40, 98),
    });
  }

  let pack: PackConfig | null = null;
  try {
    pack = JSON.parse(fs.readFileSync(PACKS_PATH, "utf8"));
  } catch {
    pack = null;
  }

  // Extra OPML (manual)
  if (pack?.enabled && Array.isArray(pack.extraOpml)) {
    for (const p of pack.extraOpml) {
      if (!p?.url || !p?.section) continue;
      try {
        const xml = await fetchText(p.url);
        for (const f of parseOpml(xml)) {
          if (looksLowQuality(f.url)) continue;
          if (seen.has(f.url)) continue;
          seen.add(f.url);
          candidates.push({
            section: p.section,
            name: f.title,
            url: f.url,
            type: "rss",
            country: p.country,
            trustScore: clamp(guessTrustScore(f.url), 40, 98),
          });
          if (candidates.length >= max) break;
        }
      } catch (e) {
        console.warn(`extraOpml failed: ${p.url}`, e);
      }
    }
  }

  // Plenary pack provider (big, high quality-ish)
  if (includePlenary && pack?.enabled && Array.isArray(pack.providers)) {
    for (const prov of pack.providers) {
      if (!prov?.enabled || prov.type !== "github_opml_directory") continue;
      const branch = prov.branch || "master";
      for (const dir of prov.directories || []) {
        try {
          const files = await githubListOpmlFiles(prov.repo, dir.path, branch);
          for (const f of files) {
            if (candidates.length >= max) break;
            try {
              const xml = await fetchText(f.downloadUrl);
              const base = decodeURIComponent(f.name.replace(/\.opml$/i, "")).trim();
              const country = dir.path.includes("countries") ? inferCountryFromFileName(base) : undefined;
              const section = mapSectionFromFileName(base, dir.defaultSection);

              for (const feed of parseOpml(xml)) {
                if (candidates.length >= max) break;
                if (looksLowQuality(feed.url)) continue;
                if (seen.has(feed.url)) continue;
                seen.add(feed.url);
                candidates.push({
                  section,
                  name: feed.title,
                  url: feed.url,
                  type: "rss",
                  country,
                  trustScore: clamp(guessTrustScore(feed.url), 40, 98),
                });
              }
            } catch (e) {
              console.warn(`OPML parse failed: ${f.downloadUrl}`, e);
            }
          }
        } catch (e) {
          console.warn(`Provider directory failed: ${prov.repo}/${dir.path}`, e);
        }
      }
    }
  }

  console.log(`Sync candidates: ${candidates.length} (max=${max})`);

  let upserted = 0;
  for (const s of candidates) {
    // Cheap safety net
    if (!/^https?:\/\//.test(s.url)) continue;
    await prisma.source.upsert({
      where: { url: s.url },
      update: {
        section: s.section,
        name: s.name,
        type: s.type,
        country: s.country,
        trustScore: s.trustScore,
        enabled: true,
      },
      create: {
        section: s.section,
        name: s.name,
        type: s.type,
        url: s.url,
        country: s.country,
        trustScore: s.trustScore,
        enabled: true,
      },
    });
    upserted++;
  }

  console.log(`Sources upserted: ${upserted}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
