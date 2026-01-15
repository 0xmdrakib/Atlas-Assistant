import Parser from "rss-parser";
import { prisma } from "@/lib/prisma";
import { SECTION_POLICIES } from "@/lib/section-policy";
import { aiSelectImportant } from "@/lib/aiProviders";

type FeedItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  content?: string;
  categories?: string[];
};

const parser: Parser<unknown, FeedItem> = new Parser({
  timeout: 20_000,
  headers: { "user-agent": "AtlasAssistant/1.1 (+rss)" },
});

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
function normalizeTopic(t: string) {
  return t.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
}
function extractTopics(item: FeedItem): string[] {
  const out = new Set<string>();
  for (const c of item.categories || []) {
    const n = normalizeTopic(c);
    if (n) out.add(n);
  }
  const text = `${item.title || ""} ${item.contentSnippet || ""}`.toLowerCase();
  const keywords = ["robot", "robotics", "aerospace", "satellite", "telescope", "quran", "islam", "history", "patent", "arxiv", "preprint", "open-source", "ethics", "space", "ai"];
  for (const k of keywords) if (text.includes(k)) out.add(normalizeTopic(k));
  return Array.from(out).slice(0, 10);
}
function safeDate(item: FeedItem) {
  const d = item.isoDate || item.pubDate;
  const parsed = d ? new Date(d) : null;
  if (parsed && !isNaN(parsed.getTime())) return parsed;
  return null;
}

function isAiSummaryEnabled() {
  return String(process.env.AI_SUMMARY_ENABLED || "false").toLowerCase() === "true" && Boolean(process.env.AI_SUMMARY_API_KEY);
}
function isAiDiscoveryEnabled() {
  return String(process.env.AI_DISCOVERY_ENABLED || "false").toLowerCase() === "true" && Boolean(process.env.AI_DISCOVERY_API_KEY);
}

// NOTE: AI is applied at two places:
// - discovery/ranking during ingest (this file)
// - summaries/digests via /api/ai/* routes
// Provider logic lives in lib/aiProviders.ts (Gemini default).

async function gdeltCandidates(section: string): Promise<Array<{ title: string; snippet: string; url: string; publishedAt: Date }>> {
  const queryMap: Record<string, string> = {
    news: "global OR conflict OR election OR economy",
    cosmos: "NASA OR telescope OR exoplanet OR galaxy",
    innovators: "robotics OR aerospace OR hardware prototype",
    signals: "patent OR preprint OR arXiv OR filing",
    creators: "open-source OR tutorial OR course OR community",
    history: "islamic history OR ottoman OR andalus OR caliphate",
  };
  const q = queryMap[section] || "world";
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", q);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "50");
  url.searchParams.set("sort", "datedesc");

  // Keep it fresh: last 24h window.
  const end = new Date();
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  };
  url.searchParams.set("startdatetime", fmt(start));
  url.searchParams.set("enddatetime", fmt(end));

  const res = await fetch(url.toString(), { headers: { "user-agent": "AtlasAssistant/1.0" } });
  if (!res.ok) return [];
  const json: any = await res.json();
  const arts: any[] = json?.articles || [];
  return arts
    .map((a) => ({
      title: String(a?.title || "").slice(0, 180),
      snippet: String(a?.snippet || "").slice(0, 300),
      url: String(a?.url || ""),
      publishedAt: a?.seendate ? new Date(a.seendate) : new Date(),
    }))
    .filter((a) => a.title && a.url);
}

export async function ingestOnce() {
  const run = await prisma.ingestRun.create({ data: { ok: false } });
  let added = 0;
  let skipped = 0;

  const hardDeadlineMs = clamp(Number(process.env.INGEST_TIMEOUT_MS || 25000), 8000, 120000);
  const hardDeadlineAt = Date.now() + hardDeadlineMs;
  const maxSourcesTotal = clamp(Number(process.env.INGEST_MAX_SOURCES_PER_RUN || 120), 30, 600);
  const concurrency = clamp(Number(process.env.FEED_FETCH_CONCURRENCY || 8), 2, 20);

  const sections = Object.keys(SECTION_POLICIES) as Array<keyof typeof SECTION_POLICIES>;
  const perSection = Math.max(8, Math.floor(maxSourcesTotal / Math.max(1, sections.length)));

  // Retention + cap counts (section-level, once).
  // IMPORTANT WINDOW ALIGNMENT
  // The UI window filter (/api/items) uses:
  // - publishedAt for most sections
  // - createdAt for History (because publishedAt can be centuries old)
  //
  // If we cap/retain by createdAt everywhere, a single ingest run can quickly hit
  // daily/weekly caps (based on "insert time"), after which subsequent cron runs
  // add nothing and the feed appears "stuck". To keep ingest behavior consistent
  // with what the UI shows, we apply caps/retention by publishedAt for non-History.
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const state: Record<string, { dayCount: number; weekCount: number; monthCount: number }> = {};
  for (const sec of sections) {
    const policy = SECTION_POLICIES[sec];
    const retention = new Date(now - policy.retentionDays * 24 * 60 * 60 * 1000);

    // History: curated old knowledge, window/caps are based on "when we added it".
    // All other sections: window/caps are based on publishedAt.
    const timeField = sec === "history" ? "createdAt" : "publishedAt";

    await prisma.item.deleteMany({ where: { section: sec, [timeField]: { lt: retention } } as any });
    const [d, w, m] = await Promise.all([
      prisma.item.count({ where: { section: sec, [timeField]: { gte: dayAgo } } as any }),
      prisma.item.count({ where: { section: sec, [timeField]: { gte: weekAgo } } as any }),
      prisma.item.count({ where: { section: sec, [timeField]: { gte: monthAgo } } as any }),
    ]);
    state[sec] = { dayCount: d, weekCount: w, monthCount: m };
  }

  function bumpWindowCounts(section: string, effectiveTime: Date) {
    if (effectiveTime >= dayAgo) state[section].dayCount += 1;
    if (effectiveTime >= weekAgo) state[section].weekCount += 1;
    if (effectiveTime >= monthAgo) state[section].monthCount += 1;
  }

  // Choose a rotating subset of sources so 1000+ sources stays fast.
  const selected: Array<any> = [];
  for (const sec of sections) {
    const policy = SECTION_POLICIES[sec];
    if (state[sec].dayCount >= policy.dailyCap || state[sec].weekCount >= policy.weeklyCap || state[sec].monthCount >= policy.monthlyCap) {
      continue;
    }
    const sources = await prisma.source.findMany({
      where: {
        enabled: true,
        section: sec,
        trustScore: { gte: policy.minTrustScore },
      },
      orderBy: [{ lastFetchedAt: "asc" }, { trustScore: "desc" }, { createdAt: "asc" }],
      take: perSection,
    });
    selected.push(...sources);
  }

  async function fetchText(url: string, timeoutMs = 12000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "user-agent": "AtlasAssistant/1.1 (+rss)",
          accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(t);
    }
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
        const idx = i++;
        out[idx] = await fn(arr[idx]);
      }
    });
    await Promise.all(workers);
    return out;
  }

  const freshnessMaxDays: Record<string, number> = { news: 21, cosmos: 90, innovators: 60, signals: 30, creators: 180, history: 3650 };

  await mapLimit(selected, concurrency, async (s) => {
    if (Date.now() > hardDeadlineAt) return;

    const policy = SECTION_POLICIES[s.section as keyof typeof SECTION_POLICIES];
    if (!policy) return;
    if (state[s.section].dayCount >= policy.dailyCap || state[s.section].weekCount >= policy.weeklyCap || state[s.section].monthCount >= policy.monthlyCap) return;

    // mark fetched
    await prisma.source.update({ where: { id: s.id }, data: { lastFetchedAt: new Date() } }).catch(() => null);

    let feed: any;
    try {
      feed = await parseFeed(s.url);
      await prisma.source.update({ where: { id: s.id }, data: { lastOkAt: new Date(), consecutiveFails: 0 } }).catch(() => null);
    } catch {
      await prisma.source.update({
        where: { id: s.id },
        data: { consecutiveFails: { increment: 1 } },
      }).catch(() => null);
      const updated = await prisma.source.findUnique({ where: { id: s.id }, select: { consecutiveFails: true } }).catch(() => null);
      if (updated?.consecutiveFails && updated.consecutiveFails >= 25) {
        await prisma.source.update({ where: { id: s.id }, data: { enabled: false } }).catch(() => null);
      }
      skipped += 1;
      return;
    }

    const items = (feed?.items || []) as FeedItem[];
    const maxAgeDays = freshnessMaxDays[s.section] ?? 60;
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

    const candidates = items
      .map((it) => {
        const publishedAt = safeDate(it) || new Date();
        const title = (it.title || "").trim();
        const url = (it.link || "").trim();
        const snippet = (it.contentSnippet || it.content || "").replace(/\s+/g, " ").trim().slice(0, 400);
        const topics = extractTopics(it);
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

    for (const c of candidates) {
      if (Date.now() > hardDeadlineAt) break;
      if (state[s.section].dayCount >= policy.dailyCap || state[s.section].weekCount >= policy.weeklyCap || state[s.section].monthCount >= policy.monthlyCap) break;
      try {
        await prisma.item.upsert({
          where: { url: c.url },
          create: {
            sourceId: s.id,
            section: s.section,
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
            section: s.section,
            title: c.title,
            summary: c.snippet || c.title,
            country: s.country || null,
            topics: c.topics,
            score: c.score,
            publishedAt: c.publishedAt,
          },
        });
        added += 1;
        const effectiveTime = s.section === "history" ? new Date() : c.publishedAt;
        bumpWindowCounts(s.section, effectiveTime);
      } catch {
        skipped += 1;
      }
    }
  });

  // Safety net: if a section is totally empty (common when RSS sources are flaky),
  // seed a few items from the public GDELT feed even without AI discovery.
  // This prevents "Early Signals" / "History" from rendering blank pages.
  for (const sec of sections) {
    if (Date.now() > hardDeadlineAt - 2500) break;
    const policy = SECTION_POLICIES[sec];
    if (state[sec].monthCount > 0) continue;
    if (state[sec].dayCount >= policy.dailyCap) continue;

    const fallbackUrl = `gdelt:fallback:${sec}`;
    const fallbackSource = await prisma.source.upsert({
      where: { url: fallbackUrl },
      update: { section: sec, name: "GDELT (fallback)", type: "ai", trustScore: 70, enabled: true },
      create: { section: sec, name: "GDELT (fallback)", type: "ai", url: fallbackUrl, trustScore: 70, enabled: true },
    });

    const gd = await gdeltCandidates(sec).catch(() => []);
    const chosen = gd.slice(0, 3);
    for (const g of chosen) {
      if (state[sec].dayCount >= policy.dailyCap) break;
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
            topics: extractTopics({ title: g.title, contentSnippet: g.snippet }),
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
          },
        });
        added += 1;
        const effectiveTime = sec === "history" ? new Date() : g.publishedAt;
        bumpWindowCounts(sec, effectiveTime);
      } catch {
        skipped += 1;
      }
    }
  }

  // Optional: AI discovery (GDELT → OpenAI picks)
  if (isAiDiscoveryEnabled() && Date.now() < hardDeadlineAt - 5000) {
    for (const sec of sections) {
      if (Date.now() > hardDeadlineAt - 2000) break;
      const policy = SECTION_POLICIES[sec];
      if (state[sec].dayCount >= policy.dailyCap || state[sec].weekCount >= policy.weeklyCap || state[sec].monthCount >= policy.monthlyCap) continue;

      // one discovery source per section
      const aiSourceUrl = `ai:gdelt:${sec}`;
      const aiSource = await prisma.source.upsert({
        where: { url: aiSourceUrl },
        update: { section: sec, name: "AI Discovery (GDELT)", type: "ai", trustScore: 75, enabled: true },
        create: { section: sec, name: "AI Discovery (GDELT)", type: "ai", url: aiSourceUrl, trustScore: 75, enabled: true },
      });

      const gd = await gdeltCandidates(sec).catch(() => []);
      if (!gd.length) continue;

      let chosen: number[] = [];
      try {
        const picks = await aiSelectImportant({
          candidates: gd.map((g) => ({
            title: g.title,
            sourceName: "GDELT",
            country: null,
            url: g.url,
            baseScore: 0.7,
          })),
        });
        chosen = Array.from(new Set(picks)).slice(0, 3);
      } catch {
        // If AI fails, fall back to newest 3 items.
        chosen = [0, 1, 2].filter((i) => i < gd.length);
      }

      for (const idx of chosen) {
        const g = gd[idx];
        if (!g) continue;
        if (state[sec].dayCount >= policy.dailyCap) break;
        try {
          await prisma.item.upsert({
            where: { url: g.url },
            create: {
              sourceId: aiSource.id,
              section: sec,
              title: g.title,
              summary: g.snippet || g.title,
              aiSummary: null,
              url: g.url,
              country: null,
              topics: extractTopics({ title: g.title, contentSnippet: g.snippet }),
              score: 0.78,
              publishedAt: g.publishedAt,
            },
            update: {
              sourceId: aiSource.id,
              section: sec,
              title: g.title,
              summary: g.snippet || g.title,
              score: 0.78,
              publishedAt: g.publishedAt,
            },
          });
          added += 1;
          const effectiveTime = sec === "history" ? new Date() : g.publishedAt;
          bumpWindowCounts(sec, effectiveTime);
        } catch {
          skipped += 1;
        }
      }
    }
  }

  await prisma.ingestRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), ok: true, added, skipped, message: "ok" },
  });

  return { ok: true, added, skipped };
}
