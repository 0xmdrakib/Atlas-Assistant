import Parser from "rss-parser";
import { prisma } from "@/lib/prisma";
import { SECTION_POLICIES } from "@/lib/section-policy";
import seedSources from "../sources/seed-sources.json";

type FeedItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  content?: string;
  categories?: string[];
};

// Many RSS endpoints return 403/429 with a missing or uncommon User-Agent.
// Default to a mainstream browser UA to maximize compatibility; allow override.
const DEFAULT_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const RSS_UA = (process.env.RSS_USER_AGENT || DEFAULT_BROWSER_UA).trim();

const parser: Parser<unknown, FeedItem> = new Parser({
  timeout: 20_000,
  headers: {
    "user-agent": RSS_UA,
    accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*",
  },
});

// Backward compatibility + normalization for section keys stored in DB.
// NOTE: Postgres string comparisons are case-sensitive; old rows may contain
// titles like "Early Signals" or paths like "/global".
const LEGACY_SECTION_MAP: Record<string, CanonicalSection> = {
  // earlier builds
  news: "global",
  "global-news": "global",
  cosmos: "universe",
  // Previously a combined section; in the 8-section architecture this maps to Faith.
  "universe-faith": "faith",
  "universe + faith": "faith",
  "universe and faith": "faith",
  signals: "early",
  "early-signals": "early",
  "great-creators": "creators",
  creators: "creators",
};

type CanonicalSection = keyof typeof SECTION_POLICIES;

function normalizeSectionKey(raw: string): string {
  // Lowercase + strip leading slash + normalize separators.
  // Examples: "Universe + Faith" -> "universe-faith", "/Global" -> "global".
  return String(raw || "")
    .trim()
    .replace(/^\/+/, "")
    .toLowerCase()
    .replace(/\+/g, " ")
    .replace(/_/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toCanonicalSection(section: string): CanonicalSection {
  const s = normalizeSectionKey(section);

  // Direct map for known legacy labels
  const mapped = LEGACY_SECTION_MAP[s] || (s as any);
  if (mapped in SECTION_POLICIES) return mapped as CanonicalSection;

  // Heuristics for human-readable labels
  if (/(global|world|news)/.test(s)) return "global";
  if (/(tech|technology|software|security|cyber)/.test(s)) return "tech";
  if (/(innovator|innovation|startup|builder)/.test(s)) return "innovators";
  if (/(early|signal|trend)/.test(s)) return "early";
  if (/(creator|design|maker)/.test(s)) return "creators";
  if (/(universe|space|cosmo|astronomy|physics)/.test(s)) return "universe";
  if (/(history|heritage|ancient)/.test(s)) return "history";
  if (/(faith|islam|quran|hadith|religion)/.test(s)) return "faith";

  return "global";
}

function sectionAliases(canonical: CanonicalSection): string[] {
  // Kept for callers that still want alias lists.
  const aliases = Object.entries(LEGACY_SECTION_MAP)
    .filter(([, v]) => v === canonical)
    .map(([k]) => k);
  return [canonical, ...aliases];
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hoursBetween(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60);
}

function recencyScore(publishedAt: Date, halfLifeHours: number) {
  const ageH = hoursBetween(new Date(), publishedAt);
  const s = Math.pow(0.5, ageH / halfLifeHours);
  return clamp(s, 0, 1);
}

function asText(v: any): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    // Common shapes from RSS parsers
    const o: any = v as any;
    if (typeof o.href === "string") return o.href;
    if (typeof o.url === "string") return o.url;
    if (typeof o._ === "string") return o._;
    if (typeof o.value === "string") return o.value;
    if (typeof o.text === "string") return o.text;
  }
  return "";
}

function normalizeTopic(t: string) {
  return t.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
}

const CATEGORY_RULES: Record<CanonicalSection, Array<{ code: string; keywords: string[] }>> = {
  global: [
    { code: "geopolitics", keywords: ["election", "diplom", "sanction", "summit", "treaty"] },
    { code: "conflict", keywords: ["war", "strike", "missile", "ceasefire", "hostage", "invasion"] },
    { code: "economy", keywords: ["inflation", "rates", "gdp", "recession", "debt", "budget"] },
    { code: "markets", keywords: ["stocks", "bond", "oil", "gold", "bitcoin", "currency"] },
    { code: "climate", keywords: ["climate", "flood", "storm", "hurricane", "wildfire", "heatwave"] },
    { code: "health", keywords: ["health", "outbreak", "vaccine", "hospital", "disease"] },
    { code: "law", keywords: ["court", "trial", "ruling", "law", "supreme"] },
  ],
  tech: [
    { code: "ai", keywords: ["ai", "llm", "model", "agent", "openai", "gemini", "anthropic"] },
    { code: "cybersecurity", keywords: ["security", "breach", "ransomware", "vulnerability", "cve", "phishing"] },
    { code: "cloud", keywords: ["cloud", "kubernetes", "docker", "aws", "azure", "gcp"] },
    { code: "hardware", keywords: ["chip", "semiconductor", "gpu", "nvidia", "amd", "arm"] },
    { code: "devtools", keywords: ["github", "git", "compiler", "sdk", "api", "framework"] },
    { code: "startups", keywords: ["startup", "funding", "seed", "series", "venture", "yc"] },
  ],
  innovators: [
    { code: "robotics", keywords: ["robot", "robotics", "autonomous", "drone"] },
    { code: "aerospace", keywords: ["rocket", "spacecraft", "satellite", "launch"] },
    { code: "biotech", keywords: ["biotech", "gene", "crispr", "clinical", "drug"] },
    { code: "manufacturing", keywords: ["manufacturing", "factory", "supply chain", "automation"] },
    { code: "climate-tech", keywords: ["carbon", "battery", "solar", "wind", "hydrogen"] },
  ],
  early: [
    { code: "patents", keywords: ["patent", "filing", "application"] },
    { code: "preprints", keywords: ["arxiv", "preprint", "bioRxiv", "medRxiv"] },
    { code: "research", keywords: ["paper", "study", "dataset", "benchmark"] },
    { code: "standards", keywords: ["standard", "draft", "rfc", "spec"] },
  ],
  creators: [
    { code: "open-source", keywords: ["open source", "oss", "repository", "license"] },
    { code: "tutorials", keywords: ["tutorial", "guide", "how to", "course", "workshop"] },
    { code: "design", keywords: ["design", "ux", "ui", "typography"] },
    { code: "writing", keywords: ["essay", "newsletter", "blog", "writing"] },
    { code: "video", keywords: ["youtube", "video", "podcast", "channel"] },
  ],
  universe: [
    { code: "space", keywords: ["nasa", "esa", "launch", "orbit", "rocket", "mars"] },
    { code: "astronomy", keywords: ["telescope", "exoplanet", "galaxy", "nebula", "jwst"] },
    { code: "physics", keywords: ["physics", "quantum", "relativity", "particle"] },
    { code: "earth-science", keywords: ["earth", "ocean", "atmosphere", "geology"] },
  ],
  history: [
    { code: "islamic-history", keywords: ["caliphate", "andalus", "abbasid", "umayyad", "ottoman"] },
    { code: "empires", keywords: ["empire", "dynasty", "sultan", "kingdom"] },
    { code: "archaeology", keywords: ["archaeology", "excavation", "artifact", "ruins"] },
    { code: "trade", keywords: ["trade", "silk road", "caravan", "maritime"] },
  ],
  faith: [
    { code: "quran", keywords: ["quran", "surah", "ayat"] },
    { code: "hadith", keywords: ["hadith", "sahih", "bukhari", "muslim"] },
    { code: "fiqh", keywords: ["fiqh", "fatwa", "madhhab", "sharia"] },
    { code: "spirituality", keywords: ["spiritual", "tazkiyah", "dua", "dhikr"] },
    { code: "ethics", keywords: ["ethic", "akhlaq", "character"] },
  ],
};

const ALLOWED_TOPIC_CODES = new Set<string>(
  Object.values(CATEGORY_RULES)
    .flat()
    .map((r) => r.code)
    .concat(["science", "culture", "policy", "education"])
    .map(normalizeTopic)
);

function extractTopics(section: CanonicalSection, item: FeedItem): string[] {
  const out = new Set<string>();
  const text = `${asText((item as any).title)} ${asText((item as any).contentSnippet || (item as any).content)}`.toLowerCase();

  const add = (t: string) => {
    const n = normalizeTopic(t);
    if (n) out.add(n);
  };

  // Section taxonomy first (stable searchable codes).
  for (const rule of CATEGORY_RULES[section] || []) {
    if (rule.keywords.some((k) => text.includes(k))) add(rule.code);
  }

  // Then RSS-provided categories, but only if they map to known topic codes.
  for (const c of (item as any).categories || []) {
    const n = normalizeTopic(asText(c));
    if (n && ALLOWED_TOPIC_CODES.has(n)) add(n);
  }

  // Lightweight global enrich.
  if (text.includes("climate")) add("climate");
  if (text.includes("education")) add("education");
  if (text.includes("culture") || text.includes("art")) add("culture");
  if (text.includes("science") || text.includes("research")) add("science");

  return Array.from(out).slice(0, 10);
}

function safeDate(item: FeedItem) {
  const d = item.isoDate || item.pubDate;
  const parsed = d ? new Date(d) : null;
  if (parsed && !isNaN(parsed.getTime())) return parsed;
  return null;
}

async function gdeltCandidates(section: string): Promise<
  Array<{ title: string; snippet: string; url: string; publishedAt: Date }>
> {
  const queryMap: Record<string, string> = {
    global: "global OR conflict OR election OR economy",
    tech: "technology OR cybersecurity OR AI OR semiconductor",
    innovators: "robotics OR aerospace OR hardware prototype",
    early: "patent OR preprint OR arXiv OR filing",
    creators: "open-source OR tutorial OR course OR community",
    universe: "NASA OR telescope OR exoplanet OR galaxy",
    history: "islamic history OR ottoman OR andalus OR caliphate",
    faith: "Quran OR Hadith OR sunnah OR fiqh",
  };
  const q = encodeURIComponent(queryMap[section] || queryMap.global);
  // Keep in sync with discovery: mode=artlist + sort=datedesc.
  // Some upstreams are case-sensitive and may return empty results otherwise.
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&format=json&maxrecords=25&sort=datedesc`;

  const res = await fetch(url, { headers: { "user-agent": "AtlasAssistant/1.1 (+gdelt)" } });
  if (!res.ok) return [];
  const json: any = await res.json().catch(() => null);
  const articles = Array.isArray(json?.articles) ? json.articles : [];

  return articles
    .map((a: any) => ({
      title: String(a?.title || "").trim(),
      snippet: String(a?.seendate || "").trim() ? String(a?.title || "").trim() : String(a?.title || "").trim(),
      url: String(a?.url || "").trim(),
      publishedAt: a?.seendate ? new Date(a.seendate) : new Date(),
    }))
    .filter((a: any) => a.title && a.url);
}

type SeedSource = {
  section: string;
  name: string;
  url: string;
  country?: string;
  trustScore?: number;
  enabled?: boolean;
};

async function ensureSeedSourcesInDb(): Promise<{ seeded: boolean; inserted: number }> {
  const rssCount = await prisma.source.count({
    where: { type: { equals: "rss", mode: "insensitive" } },
  });
  if (rssCount > 0) return { seeded: false, inserted: 0 };

  const rows = (seedSources as unknown as SeedSource[])
    .filter((s) => s && typeof s.url === "string" && s.url.startsWith("http"))
    .map((s) => ({
      section: toCanonicalSection(s.section || ""),
      name: String(s.name || s.url),
      url: String(s.url),
      country: s.country ? String(s.country).toUpperCase() : null,
      trustScore: typeof s.trustScore === "number" ? s.trustScore : 70,
      enabled: s.enabled !== false,
      type: "rss",
    }));

  if (rows.length === 0) return { seeded: false, inserted: 0 };

  const res = await prisma.source.createMany({ data: rows, skipDuplicates: true });
  return { seeded: true, inserted: res.count ?? 0 };
}

export async function ingestOnce() {
  const startedAtMs = Date.now();
  const run = await prisma.ingestRun.create({ data: { ok: false } });
  let added = 0;
  let skipped = 0;
  let fallbackAdded = 0;
  // Diagnostic counter: how often we skip work because caps are (apparently) reached.
  // If this is > 0 while the UI feed is empty, your cap counters are being inflated
  // by discovery items (or by a bad filter), and ingest will do no work.
  let skippedByCaps = 0;

  // Extra diagnostics for the API response (useful when you only have access
  // to the JSON response in production).
  let processedSources = 0;
  let feedsParsed = 0;
  let itemsSeen = 0;
  let candidatesSeen = 0;
  let stoppedEarly = false;

  const hardDeadlineMs = clamp(Number(process.env.INGEST_TIMEOUT_MS || 25000), 8000, 120000);
  const hardDeadlineAt = Date.now() + hardDeadlineMs;

  // If the budget is small (common on free serverless plans), we need to do less work
  // or we'll hit our own deadline guard before fetching any RSS.
  const fastMode = hardDeadlineMs <= 12000;

  const maxSourcesTotal = clamp(
    Number(process.env.INGEST_MAX_SOURCES_PER_RUN || (fastMode ? 16 : 120)),
    8,
    600
  );
  const concurrency = clamp(Number(process.env.FEED_FETCH_CONCURRENCY || (fastMode ? 4 : 8)), 2, 20);

  const sections = Object.keys(SECTION_POLICIES) as Array<keyof typeof SECTION_POLICIES>;
  // IMPORTANT: serverless functions have hard execution limits.
  // If we try to fetch too many RSS sources, the function can time out before
  // it reaches the fallback seeding step, leaving the feed empty.
  // Keep per-section sampling small and cap total work by maxSourcesTotal.
  const perSection = clamp(Math.floor(maxSourcesTotal / Math.max(1, sections.length)), 2, 10);

  // Guardrail: If feed sources were auto-disabled after repeated fetch failures,
  // re-enable them so ingestion can recover without manual DB edits.
  // We only revive sources that hit the auto-disable threshold (consecutiveFails >= 25).
  await prisma.source.updateMany({
    where: { enabled: false, type: { not: "discovery" }, consecutiveFails: { gte: 25 } },
    data: { enabled: true, consecutiveFails: 0 },
  });

  // Window + retention are based on createdAt (collection time).
  // NOTE: Counting 1d/7d/30d across all sections can be expensive on serverless
  // (and can consume most of a small INGEST_TIMEOUT_MS budget). For ingestion we
  // only need to know whether a section is completely empty (for fallbacks).
  // We defer expensive pruning/counting work until later, and only if we have time.
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const state: Record<string, { dayCount: number; weekCount: number; monthCount: number }> = {};
  for (const sec of sections) {
    const secs = sectionAliases(sec as CanonicalSection);
    const exists = await prisma.item.findFirst({
      where: {
        section: { in: secs },
        createdAt: { gte: monthAgo },
        NOT: [{ source: { is: { type: "discovery" } } }],
      },
      select: { id: true },
    });
    // We start day/week counts at 0; enforceSectionCaps (if it runs) will compute
    // exact keeps. These counters are only used as soft guardrails in this function.
    state[sec] = { dayCount: 0, weekCount: 0, monthCount: exists ? 1 : 0 };
  }

  function bumpWindowCounts(section: string, createdAt: Date) {
    if (createdAt >= dayAgo) state[section].dayCount += 1;
    if (createdAt >= weekAgo) state[section].weekCount += 1;
    if (createdAt >= monthAgo) state[section].monthCount += 1;
  }

  // Choose a rotating subset of sources so 1000+ sources stays fast.
  // IMPORTANT: We do *not* filter by section inside SQL because older rows may
  // have section values like "Early Signals" / "/global" etc. We normalize in JS.
  let allRssSources = await prisma.source.findMany({
    where: {
      enabled: true,
      type: { equals: "rss", mode: "insensitive" },
    },
    orderBy: [{ lastFetchedAt: "asc" }, { trustScore: "desc" }, { createdAt: "asc" }],
  });

  if (allRssSources.length === 0) {
    // Common footgun: sources exist but all are disabled (manual toggle, or a past
    // auto-disable experiment). If we have zero enabled RSS sources, we re-enable
    // them so ingest can proceed.
    const reenabled = await prisma.source.updateMany({
      where: { enabled: false, type: { equals: "rss", mode: "insensitive" } },
      data: { enabled: true },
    });

    if (reenabled.count > 0) {
      allRssSources = await prisma.source.findMany({
        where: { enabled: true, type: { equals: "rss", mode: "insensitive" } },
        orderBy: [{ lastFetchedAt: "asc" }, { trustScore: "desc" }, { createdAt: "asc" }],
      });
    }

    const seeded = await ensureSeedSourcesInDb();
    if (seeded.seeded) {
      allRssSources = await prisma.source.findMany({
        where: { enabled: true, type: { equals: "rss", mode: "insensitive" } },
        orderBy: [{ lastFetchedAt: "asc" }, { trustScore: "desc" }, { createdAt: "asc" }],
      });
    }
  }


  const sourcesBySection: Record<CanonicalSection, any[]> = {
    global: [],
    tech: [],
    innovators: [],
    early: [],
    creators: [],
    universe: [],
    history: [],
    faith: [],
  };

  for (const s of allRssSources) {
    const canonical = toCanonicalSection(s.section);
    (sourcesBySection[canonical] || sourcesBySection.global).push(s);
  }

  // Build a per-section pool (trust-filtered), then select in a round-robin
  // way so we keep diversity while still respecting maxSourcesTotal.
  const poolBySection: Record<CanonicalSection, any[]> = {
    global: [],
    tech: [],
    innovators: [],
    early: [],
    creators: [],
    universe: [],
    history: [],
    faith: [],
  };

  for (const sec of sections) {
    const policy = SECTION_POLICIES[sec];
    const base = sourcesBySection[sec] || [];
    let pool = base.filter((s) => (s.trustScore || 0) >= policy.minTrustScore);
    if (pool.length === 0 && base.length > 0) pool = base;
    poolBySection[sec] = pool;
  }

  const selected: Array<any> = [];
  for (let i = 0; selected.length < maxSourcesTotal && i < perSection; i++) {
    let pushed = false;
    for (const sec of sections) {
      const pool = poolBySection[sec] || [];
      const s = pool[i];
      if (!s) continue;
      selected.push(s);
      pushed = true;
      if (selected.length >= maxSourcesTotal) break;
    }
    if (!pushed) break;
  }

  const selectedCount = selected.length;


  async function fetchText(url: string, timeoutMs = 12000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const attempt = async (ua: string) =>
        await fetch(url, {
          signal: ctrl.signal,
          headers: {
            "user-agent": ua,
            accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*",
          },
        }).catch(() => null);

      let res = await attempt(RSS_UA);

      // If a custom UA was provided and the request is rejected, retry with
      // the known-good browser UA.
      if (
        (!res || !res.ok) &&
        RSS_UA !== DEFAULT_BROWSER_UA &&
        (res?.status === 403 || res?.status === 429)
      ) {
        res = await attempt(DEFAULT_BROWSER_UA);
      }

      if (!res || !res.ok) throw new Error(`HTTP ${res?.status || "fetch_failed"}`);
      return await res.text();
    } finally {
      clearTimeout(t);
    }
  }

  async function googleNewsCandidates(section: CanonicalSection) {
    // A pragmatic fallback: Google News RSS is resilient when publisher RSS endpoints
    // are blocked or unavailable from serverless environments.
    const queryMap: Record<CanonicalSection, string> = {
      global: "global news OR world news",
      tech: "technology news OR cybersecurity OR AI",
      innovators: "startup funding OR robotics OR aerospace",
      early: "arXiv OR preprint OR patent filing",
      creators: "open source release OR tutorial OR new library",
      universe: "NASA OR telescope OR exoplanet",
      history: "history archaeology empire",
      faith: "quran OR hadith OR fiqh",
    };

    const q = encodeURIComponent(queryMap[section] || "news");
    const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    const xml = await fetchText(url, 12_000);
    const feed: any = await parser.parseString(xml);
    const items = (feed?.items || []) as FeedItem[];
    return items
      .map((it) => ({
        title: String(it.title || "").trim(),
        url: String((it as any).link || "").trim(),
        publishedAt: safeDate(it) || new Date(),
        snippet: String(it.contentSnippet || it.content || "").replace(/\s+/g, " ").trim().slice(0, 240),
      }))
      .filter((x) => x.title && x.url)
      .slice(0, 20);
  }

  async function parseFeed(url: string) {
    const xml = await fetchText(url);
    return await parser.parseString(xml);
  }

  async function mapLimit<T, R>(arr: T[], limit: number, fn: (t: T) => Promise<R>) {
    const out: R[] = [];
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
      while (i < arr.length) {
        // Stop early if we're about to hit the serverless timeout.
        // Keep the buffer smaller in fastMode so we still do some work.
        if (Date.now() > hardDeadlineAt - (fastMode ? 900 : 2200)) {
          stoppedEarly = true;
          break;
        }
        const idx = i++;
        out[idx] = await fn(arr[idx]);
      }
    });
    await Promise.all(workers);
    return out;
  }

  const freshnessMaxDays: Record<string, number> = {
    global: 21,
    tech: 21,
    innovators: 60,
    early: 30,
    creators: 180,
    universe: 90,
    history: 3650,
    faith: 180,
  };

  const BUFFER_DAILY_EXTRA = 12; // allow replacement even when cap is reached
  const BUFFER_WEEKLY_EXTRA = 40;
  const BUFFER_MONTHLY_EXTRA = 120;

  await mapLimit(selected, concurrency, async (s) => {
    if (Date.now() > hardDeadlineAt) return;

    const sec = toCanonicalSection(s.section);
    const policy = SECTION_POLICIES[sec];

    processedSources += 1;

    // If we're already far above caps (rare), skip to keep runtime stable.
    if (
      state[sec].dayCount >= policy.dailyCap + BUFFER_DAILY_EXTRA &&
      state[sec].weekCount >= policy.weeklyCap + BUFFER_WEEKLY_EXTRA
    ) {
      skippedByCaps += 1;
      return;
    }

    // mark fetched
    await prisma.source
      .update({ where: { id: s.id }, data: { lastFetchedAt: new Date(), section: sec } })
      .catch(() => null);

    let feed: any;
    try {
      feed = await parseFeed(s.url);
      feedsParsed += 1;
      await prisma.source
        .update({ where: { id: s.id }, data: { lastOkAt: new Date(), consecutiveFails: 0 } })
        .catch(() => null);
    } catch {
      await prisma.source
        .update({ where: { id: s.id }, data: { consecutiveFails: { increment: 1 } } })
        .catch(() => null);
      // No auto-disable: keep consecutiveFails for observability, but do not flip enabled=false.
      skipped += 1;
      return;
    }

    const items = (feed?.items || []) as FeedItem[];
    itemsSeen += items.length;
    const maxAgeDays = freshnessMaxDays[sec] ?? 60;
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

    const candidates = items
      .map((it) => {
        const publishedAt = safeDate(it) || new Date();
        const title = asText((it as any).title).trim();
        const urlRaw = asText((it as any).link || (it as any).url || (it as any).guid).trim();
        const url = urlRaw.startsWith("http") ? urlRaw : "";
        const snippet = asText((it as any).contentSnippet || (it as any).content)
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 400);

        const topics = extractTopics(sec, it);
        const text = `${title} ${snippet}`.toLowerCase();

        let kw = 0;
        for (const k of policy.keywordBoosts) if (text.includes(k.keyword)) kw += k.boost;

        const rs = recencyScore(publishedAt, policy.recencyHalfLifeHours);
        const trust = clamp((s.trustScore || 60) / 100, 0, 1);
        const score = clamp(0.55 * trust + 0.35 * rs + 0.10 * clamp(kw, 0, 0.25), 0, 1);

        return { title, url, snippet, publishedAt, topics, score };
      })
      .filter((x) => x.title && x.url && x.publishedAt >= cutoff)
      .sort((a, b) => b.score - a.score)
      .slice(0, policy.perRunCap);

    candidatesSeen += candidates.length;

    for (const c of candidates) {
      if (Date.now() > hardDeadlineAt) break;

      if (state[sec].weekCount >= policy.weeklyCap + BUFFER_WEEKLY_EXTRA) break;
      if (sec === "history" && state[sec].monthCount >= policy.monthlyCap + BUFFER_MONTHLY_EXTRA) break;

      try {
        await prisma.item.upsert({
          where: { url: c.url },
          create: {
            sourceId: s.id,
            section: sec,
            title: c.title,
            summary: c.snippet || c.title,
            aiSummary: null,
            url: c.url,
            country: s.country || null,
            topics: c.topics,
            score: c.score,
            publishedAt: c.publishedAt,
          },
          update: {
            sourceId: s.id,
            section: sec,
            title: c.title,
            summary: c.snippet || c.title,
            country: s.country || null,
            topics: c.topics,
            score: c.score,
            publishedAt: c.publishedAt,
            // Treat `createdAt` as "collectedAt" so the 1-day/7-day windows
            // show items that are still surfacing in the feed even if the URL
            // already existed in the DB.
            createdAt: new Date(),
          },
        });
        added += 1;
        bumpWindowCounts(sec, new Date());
      } catch {
        skipped += 1;
      }
    }
  });

  // Safety net: if a section is totally empty, seed a few items from public GDELT.
  for (const sec of sections) {
    if (Date.now() > hardDeadlineAt - (fastMode ? 900 : 2200)) {
      stoppedEarly = true;
      break;
    }

    const policy = SECTION_POLICIES[sec];
    if (state[sec].monthCount > 0) continue;

    const fallbackUrl = `gdelt:fallback:${sec}`;
    const fallbackSource = await prisma.source.upsert({
      where: { url: fallbackUrl },
      update: { section: sec, name: "GDELT (fallback)", type: "ai", trustScore: 70, enabled: true },
      create: { section: sec, name: "GDELT (fallback)", type: "ai", url: fallbackUrl, trustScore: 70, enabled: true },
    });

    const gd = await gdeltCandidates(sec).catch(() => []);
    let chosen = gd.slice(0, 3);
    if (chosen.length === 0) {
      const gn = await googleNewsCandidates(sec as CanonicalSection).catch(() => []);
      chosen = gn.slice(0, 3);
    }
    for (const g of chosen) {
      if (state[sec].weekCount >= policy.weeklyCap + BUFFER_WEEKLY_EXTRA) break;
      try {
        await prisma.item.upsert({
          where: { url: g.url },
          create: {
            sourceId: fallbackSource.id,
            section: sec,
            title: g.title,
            summary: g.snippet || g.title,
            aiSummary: null,
            url: g.url,
            country: null,
            topics: extractTopics(sec as CanonicalSection, { title: g.title, contentSnippet: g.snippet }),
            score: 0.76,
            publishedAt: g.publishedAt,
          },
          update: {
            sourceId: fallbackSource.id,
            section: sec,
            title: g.title,
            summary: g.snippet || g.title,
            score: 0.76,
            publishedAt: g.publishedAt,
            // Same "collectedAt" semantics for fallback items.
            createdAt: new Date(),
          },
        });
        added += 1;
        fallbackAdded += 1;
        bumpWindowCounts(sec, new Date());
      } catch {
        skipped += 1;
      }
    }
  }

  // Enforce product caps by pruning lowest-score items.
  async function enforceSectionCaps(sec: CanonicalSection) {
    const policy = SECTION_POLICIES[sec];
    const secs = sectionAliases(sec);

    const daily = await prisma.item.findMany({
      where: {
        section: { in: secs },
        createdAt: { gte: dayAgo },
        NOT: [{ source: { is: { type: "discovery" } } }],
      },
      select: { id: true },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: policy.dailyCap,
    });
    const dailyKeep = new Set(daily.map((d) => d.id));

    const weekly = await prisma.item.findMany({
      where: {
        section: { in: secs },
        createdAt: { gte: weekAgo },
        NOT: [{ source: { is: { type: "discovery" } } }],
      },
      select: { id: true },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: policy.weeklyCap,
    });

    const keepWeek: string[] = [];
    for (const id of dailyKeep) keepWeek.push(id);
    for (const w of weekly) {
      if (keepWeek.length >= policy.weeklyCap) break;
      if (!dailyKeep.has(w.id)) keepWeek.push(w.id);
    }

    if (keepWeek.length) {
      await prisma.item.deleteMany({
        where: {
          section: { in: secs },
          createdAt: { gte: weekAgo },
          NOT: [{ source: { is: { type: "discovery" } } }],
          id: { notIn: keepWeek },
        },
      });
    }

    if (sec === "history") {
      const monthly = await prisma.item.findMany({
        where: {
          section: { in: secs },
          createdAt: { gte: monthAgo },
          NOT: [{ source: { is: { type: "discovery" } } }],
        },
        select: { id: true },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: policy.monthlyCap,
      });

      const keepMonth: string[] = [...keepWeek];
      const keepMonthSet = new Set(keepMonth);
      for (const m of monthly) {
        if (keepMonth.length >= policy.monthlyCap) break;
        if (!keepMonthSet.has(m.id)) {
          keepMonth.push(m.id);
          keepMonthSet.add(m.id);
        }
      }

      if (keepMonth.length) {
        await prisma.item.deleteMany({
          where: {
            section: { in: secs },
            createdAt: { gte: monthAgo },
            NOT: [{ source: { is: { type: "discovery" } } }],
            id: { notIn: keepMonth },
          },
        });
      }
    }
  }

  for (const sec of sections) {
    // Pruning can be expensive; only run it if we have budget left.
    if (Date.now() > hardDeadlineAt - 3500) {
      stoppedEarly = true;
      break;
    }
    await enforceSectionCaps(sec as CanonicalSection).catch(() => null);
  }

  const [rssTotal, rssEnabled] = await Promise.all([
    prisma.source.count({ where: { type: { equals: "rss", mode: "insensitive" } } }),
    prisma.source.count({ where: { type: { equals: "rss", mode: "insensitive" }, enabled: true } }),
  ]);

  const message = `ok rssEnabled=${rssEnabled} rssTotal=${rssTotal} selected=${selectedCount} fallbackAdded=${fallbackAdded}`;

  await prisma.ingestRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), ok: true, added, skipped, message },
  });

  return {
    ok: true,
    added,
    skipped,
    stats: {
      rssTotal,
      rssEnabled,
      selected: selectedCount,
      fallbackAdded,
      skippedByCaps,
      processedSources,
      feedsParsed,
      itemsSeen,
      candidatesSeen,
      stoppedEarly,
      timingMs: {
        budget: hardDeadlineMs,
        elapsed: Date.now() - startedAtMs,
      },
    },
  };
}
