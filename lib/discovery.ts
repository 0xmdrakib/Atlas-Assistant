import Parser from "rss-parser";
import { prisma } from "@/lib/prisma";
import { SECTION_POLICIES } from "@/lib/section-policy";
import { aiSelectImportant } from "@/lib/aiProviders";

type CanonicalSection = keyof typeof SECTION_POLICIES;

type Candidate = {
  title: string;
  url: string;
  snippet: string;
  publishedAt: Date;
  sourceName: string;
  baseTrust: number; // 0..1
};

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
  headers: { "user-agent": "AtlasAssistant/1.1 (+ai)" },
});

function normalizeBaseUrl(u: string): string {
  return u.replace(/\/+$/, "");
}

function resolveReferer(): string {
  const explicit = String(process.env.YOUTUBE_REFERER || "").trim();
  if (explicit) return normalizeBaseUrl(explicit);

  const vercel = String(process.env.VERCEL_URL || "").trim();
  if (vercel) return `https://${normalizeBaseUrl(vercel)}`;

  const next = String(process.env.NEXTAUTH_URL || "").trim();
  return next ? normalizeBaseUrl(next) : "";
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

function normalizeUrl(raw: string) {
  const u = String(raw || "").trim();
  if (!u) return "";
  // Remove very common tracking fragments.
  return u.replace(/([?&](utm_[^=]+|mc_cid|mc_eid)=[^&]+)/gi, "").replace(/[?&]$/, "");
}

function envList(name: string): string[] {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
}


function rsshubBaseUrl() {
  // Intentionally empty by default to avoid hammering public instances unless enabled.
  // You can set it to a public instance (e.g. https://rsshub.app) or your own deployment.
  const raw = String(process.env.RSSHUB_BASE_URL || process.env.X_RSSHUB_BASE_URL || "").trim();
  if (!raw) return "";
  const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  return normalizeBaseUrl(withScheme);
}

function rsshubTwitterKeywordUrls(section: CanonicalSection): string[] {
  const base = rsshubBaseUrl();
  if (!base) return [];

  const upper = section.toUpperCase();
  const explicit = [...envList(`X_KEYWORDS_${upper}`), ...envList("X_KEYWORDS")].filter(Boolean);
  const fallbacks = (AI_SECTION_KEYWORDS[section] || []).slice(0, 3);
  const keywords = (explicit.length ? explicit : fallbacks).slice(0, 4);

  return keywords.map((k) => `${base}/twitter/keyword/${encodeURIComponent(k)}`);
}

function githubReleaseAtomUrls(section: CanonicalSection): string[] {
  const upper = section.toUpperCase();
  const repos = [...envList(`GITHUB_REPOS_${upper}`), ...envList("GITHUB_REPOS")].filter(Boolean).slice(0, 8);

  return repos
    .map((r) => String(r || "").trim())
    .filter(Boolean)
    .map((r) => {
      // Accept either "owner/repo" or a full github url.
      const m = r.match(/github\.com\/([^/]+)\/([^/\s#?]+)/i);
      const repo = m ? `${m[1]}/${m[2]}` : r;
      if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) return "";
      return `https://github.com/${repo}/releases.atom`;
    })
    .filter(Boolean);
}

function rssUrlsForProvider(provider: "X" | "GITHUB", section: CanonicalSection): string[] {
  const upper = section.toUpperCase();
  return [
    ...envList(`${provider}_RSS_URLS_${upper}`),
    ...envList(`${provider}_RSS_URL_${upper}`),
    ...envList(`${provider}_RSS_URLS`),
    ...envList(`${provider}_RSS_URL`),
  ];
}

function normalizeTitleKey(t: string) {
  return String(t || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeTopic(t: string) {
  const n = t.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
  if (!n) return "";
  // Canonicalize a few common aliases so category search stays predictable.
  const ALIASES: Record<string, string> = {
    opensource: "open-source",
    "open-source": "open-source",
    cyber: "cybersecurity",
    security: "cybersecurity",
    climate: "climate",
  };
  return ALIASES[n] || n;
}

const CATEGORY_RULES: Record<CanonicalSection, Array<{ code: string; keywords: string[] }>> = {
  global: [
    { code: "geopolitics", keywords: ["election", "minister", "parliament", "diplom", "sanction", "nato", "united nations", "un "] },
    { code: "conflict", keywords: ["war", "conflict", "strike", "missile", "attack", "ceasefire"] },
    { code: "economy", keywords: ["economy", "inflation", "gdp", "rates", "trade", "imf", "world bank"] },
    { code: "climate", keywords: ["climate", "carbon", "emissions", "heatwave", "flood", "wildfire"] },
    { code: "energy", keywords: ["oil", "gas", "lng", "solar", "wind", "nuclear"] },
    { code: "health", keywords: ["health", "disease", "vaccine", "who ", "outbreak"] },
  ],
  tech: [
    { code: "ai", keywords: ["ai ", "artificial intelligence", "llm", "model", "inference"] },
    { code: "cyber", keywords: ["cyber", "breach", "ransom", "malware", "phishing", "zero-day"] },
    { code: "cloud", keywords: ["cloud", "kubernetes", "serverless", "aws", "azure", "gcp"] },
    { code: "hardware", keywords: ["chip", "semiconductor", "gpu", "silicon", "hardware"] },
    { code: "opensource", keywords: ["open source", "github", "license", "repo"] },
  ],
  innovators: [
    { code: "startups", keywords: ["startup", "seed", "series", "funding", "venture"] },
    { code: "robotics", keywords: ["robot", "robotics", "autonomous", "drone"] },
    { code: "aerospace", keywords: ["rocket", "spacecraft", "aerospace", "satellite"] },
    { code: "biotech", keywords: ["biotech", "genome", "clinical", "drug"] },
    { code: "manufacturing", keywords: ["factory", "manufacturing", "supply chain", "materials"] },
  ],
  early: [
    { code: "patents", keywords: ["patent", "filing", "uspto", "epo"] },
    { code: "preprints", keywords: ["arxiv", "preprint", "biorxiv", "medrxiv"] },
    { code: "research", keywords: ["paper", "study", "dataset", "benchmark"] },
    { code: "standards", keywords: ["standard", "ietf", "w3c", "iso "] },
  ],
  creators: [
    { code: "opensource", keywords: ["open source", "github", "repo"] },
    { code: "tutorials", keywords: ["tutorial", "guide", "how to", "course", "lesson"] },
    { code: "design", keywords: ["design", "ux", "ui", "typography"] },
    { code: "video", keywords: ["youtube", "video", "podcast"] },
  ],
  universe: [
    { code: "space", keywords: ["space", "nasa", "esa", "telescope", "launch"] },
    { code: "astronomy", keywords: ["exoplanet", "galaxy", "nebula", "black hole", "star"] },
    { code: "physics", keywords: ["physics", "quantum", "relativity", "particle"] },
    { code: "earth", keywords: ["earth", "ocean", "atmosphere", "geology"] },
  ],
  history: [
    { code: "islamic-history", keywords: ["caliph", "ottoman", "andalus", "abbasid", "umayyad"] },
    { code: "medieval", keywords: ["medieval", "middle ages"] },
    { code: "ancient", keywords: ["ancient", "rome", "greek", "pharaoh"] },
    { code: "archaeology", keywords: ["archaeology", "excavation", "artifact"] },
  ],
  faith: [
    { code: "quran", keywords: ["quran", "qur'an"] },
    { code: "hadith", keywords: ["hadith", "bukhari", "muslim"] },
    { code: "fiqh", keywords: ["fiqh", "fatwa", "madhhab"] },
    { code: "spirituality", keywords: ["tazkiyah", "dhikr", "dua", "prayer"] },
    { code: "ethics", keywords: ["ethics", "akhlaq", "adab"] },
  ],
};

const ALLOWED_TOPIC_CODES = new Set<string>(
  Object.values(CATEGORY_RULES)
    .flat()
    .map((r) => r.code)
    .concat(["climate", "culture", "science", "education"]) // small global set
);

const AI_SECTION_KEYWORDS: Record<CanonicalSection, string[]> = {
  global: [
    "global news",
    "world news",
    "geopolitics",
    "diplomacy",
    "election",
    "conflict",
    "sanctions",
    "summit",
    "economy",
    "inflation",
    "trade",
    "markets",
    "climate",
    "energy",
    "public health",
    "policy",
  ],
  tech: [
    "ai",
    "machine learning",
    "llm",
    "openai",
    "gemini",
    "programming",
    "software",
    "developer",
    "cybersecurity",
    "breach",
    "ransomware",
    "cloud",
    "kubernetes",
    "open source",
    "devtools",
    "semiconductor",
  ],
  innovators: [
    "innovation",
    "startup",
    "funding",
    "prototype",
    "robotics",
    "autonomous",
    "aerospace",
    "biotech",
    "hardware",
    "manufacturing",
    "climate tech",
    "battery",
    "hydrogen",
    "drone",
    "supply chain",
  ],
  early: [
    "early signal",
    "preprint",
    "arxiv",
    "patent",
    "filing",
    "benchmark",
    "dataset",
    "standard",
    "rfc",
    "emerging",
    "under the radar",
    "low hype",
    "research note",
    "prototype",
  ],
  creators: [
    "creator",
    "open source",
    "release",
    "library",
    "tool",
    "tutorial",
    "guide",
    "course",
    "design",
    "ux",
    "writing",
    "newsletter",
    "podcast",
    "video",
    "community",
  ],
  universe: [
    "space",
    "nasa",
    "esa",
    "telescope",
    "jwst",
    "exoplanet",
    "galaxy",
    "astronomy",
    "cosmology",
    "rocket",
    "launch",
    "mars",
    "physics",
    "planetary",
  ],
  history: [
    "history",
    "islamic history",
    "caliphate",
    "ottoman",
    "andalus",
    "abbasid",
    "umayyad",
    "archaeology",
    "ancient",
    "heritage",
    "museum",
    "manuscript",
    "civilization",
  ],
  faith: [
    "islam",
    "quran",
    "hadith",
    "fiqh",
    "sunnah",
    "tafsir",
    "sirah",
    "seerah",
    "aqidah",
    "spirituality",
    "ethics",
    "interfaith",
    "dua",
    "dhikr",
    "faith",
    "religion",
  ],
};

const YOUTUBE_QUERY_HINTS: Record<CanonicalSection, string[]> = {
  global: ["analysis", "documentary", "explained", "interview"],
  tech: ["deep dive", "engineering", "benchmark", "research"],
  innovators: ["prototype", "demo", "case study", "engineering"],
  early: ["paper", "preprint", "research", "conference"],
  creators: ["tutorial", "course", "workshop", "build"],
  universe: ["documentary", "lecture", "mission", "science"],
  history: ["documentary", "lecture", "archaeology", "manuscript"],
  faith: ["lecture", "tafsir", "sirah", "hadith"],
};

const YOUTUBE_NEGATIVE_QUERY =
  "-shorts -short -reel -reels -tiktok -clip -clips -compilation -reaction -trailer -gameplay -meme -edit -status";

const YOUTUBE_CATEGORY_ID: Record<CanonicalSection, string> = {
  global: "25", // News & Politics
  tech: "28", // Science & Technology
  innovators: "28",
  early: "28",
  creators: "27", // Education
  universe: "28",
  history: "27",
  faith: "27",
};

const YOUTUBE_MIN_DURATION_SEC: Record<CanonicalSection, number> = {
  global: 180,
  tech: 240,
  innovators: 240,
  early: 180,
  creators: 240,
  universe: 300,
  history: 300,
  faith: 300,
};

const YOUTUBE_DURATION_FILTER: Record<CanonicalSection, "medium" | "long"> = {
  global: "medium",
  tech: "medium",
  innovators: "medium",
  early: "medium",
  creators: "medium",
  universe: "long",
  history: "long",
  faith: "long",
};

const YOUTUBE_LOW_QUALITY_MARKERS = [
  "shorts",
  "short",
  "reel",
  "reels",
  "clip",
  "clips",
  "reaction",
  "prank",
  "tiktok",
  "meme",
  "compilation",
  "trailer",
  "gameplay",
  "highlights",
  "edit",
  "status",
];

function parseNumber(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function matchesKeywords(section: CanonicalSection, text: string): boolean {
  const keywords = AI_SECTION_KEYWORDS[section] || [];
  if (!keywords.length) return true;
  const t = text.toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

function parseIsoDuration(iso: string): number {
  const m = String(iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return h * 3600 + min * 60 + s;
}

function extractTopics(section: CanonicalSection, title: string, snippet: string, categories?: string[]) {
  const out = new Set<string>();
  const text = `${title} ${snippet}`.toLowerCase();
  const add = (t: string) => {
    const n = normalizeTopic(t);
    if (n && ALLOWED_TOPIC_CODES.has(n)) out.add(n);
  };

  for (const rule of CATEGORY_RULES[section] || []) {
    if (rule.keywords.some((k) => text.includes(k))) add(rule.code);
  }

  for (const c of categories || []) {
    const n = normalizeTopic(c);
    if (ALLOWED_TOPIC_CODES.has(n)) add(n);
  }

  if (text.includes("climate")) add("climate");
  if (text.includes("education")) add("education");
  if (text.includes("culture") || text.includes("art")) add("culture");
  if (text.includes("science") || text.includes("research")) add("science");

  // Product rule: keep 1–2 searchable categories per item.
  return Array.from(out).slice(0, 2);
}

function sectionQuery(section: CanonicalSection) {
  const keywords = AI_SECTION_KEYWORDS[section] || [];
  const unique = Array.from(new Set(keywords.map((k) => k.trim()).filter(Boolean)));
  if (!unique.length) return "news";
  return unique.slice(0, 14).join(" OR ");
}

function youtubeQuery(section: CanonicalSection) {
  const base = AI_SECTION_KEYWORDS[section] || [];
  const hints = YOUTUBE_QUERY_HINTS[section] || [];
  const parts = Array.from(new Set([...base.slice(0, 6), ...hints].map((k) => k.trim()).filter(Boolean)));
  return parts.length ? parts.join(" ") : "news";
}

async function fetchText(url: string, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "AtlasAssistant/1.1 (+ai)",
        accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchRssCandidates(
  section: CanonicalSection,
  url: string,
  baseTrust: number,
  sourceName: string
): Promise<Candidate[]> {
  const feed = await parser.parseURL(url);
  const items = Array.isArray(feed.items) ? feed.items : [];

  const matched: Candidate[] = [];
  const all: Candidate[] = [];

  for (const item of items) {
    const title = String(item.title || "").trim();
    const link = String(item.link || "").trim();
    if (!title || !link) continue;

    const snippet = String(item.contentSnippet || item.content || "").replace(/\s+/g, " ").trim().slice(0, 360);
    const dt = item.isoDate || item.pubDate || "";
    const publishedAt = dt ? new Date(dt) : new Date();

    const text = `${title} ${snippet}`.toLowerCase();
    const c: Candidate = { title, url: link, snippet, publishedAt, sourceName, baseTrust };

    all.push(c);
    if (matchesKeywords(section, text)) matched.push(c);
  }

  // Keyword-first, but don't go silent: if keyword filtering yields nothing,
  // return a small fallback set with reduced trust so the AI can still pick.
  if (matched.length > 0) return matched;
  return all.slice(0, 10).map((c) => ({ ...c, baseTrust: clamp(c.baseTrust * 0.85, 0, 1) }));
}

async function fetchRssCandidatesFromUrls(args: {
  urls: string[];
  sourceName: string;
  baseTrust: number;
  section: CanonicalSection;
}): Promise<Candidate[]> {
  const all: Candidate[] = [];
  for (const url of args.urls) {
	  const rows = await fetchRssCandidates(args.section, url, args.baseTrust, args.sourceName);
    all.push(...rows);
  }

  const seen = new Set<string>();
  return all.filter((c) => {
    if (!c.url || !c.title) return false;
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

async function fetchGoogleNewsRss(q: string): Promise<Candidate[]> {
  const query = encodeURIComponent(q);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await fetchText(url, 12_000);
  const feed: any = await parser.parseString(xml);
  const items = (feed?.items || []) as FeedItem[];

  return items
    .map((it) => {
      const publishedAt = new Date(it.isoDate || it.pubDate || Date.now());
      return {
        title: (it.title || "").trim(),
        url: normalizeUrl(String(it.link || "")),
        snippet: String(it.contentSnippet || it.content || "").replace(/\s+/g, " ").trim().slice(0, 400),
        publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
        sourceName: "Google News",
        baseTrust: 0.6,
      };
    })
    .filter((c) => c.title && c.url)
    .slice(0, 12);
}

async function fetchGdelt(section: CanonicalSection): Promise<Candidate[]> {
  const q = sectionQuery(section);
  const query = encodeURIComponent(q);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&format=json&maxrecords=30&format=json&sort=datedesc`;

  const res = await fetch(url, { headers: { "user-agent": "AtlasAssistant/1.1 (+ai)" } }).catch(() => null);
  if (!res || !res.ok) return [];
  const data: any = await res.json().catch(() => null);
  const articles: any[] = data?.articles || [];

  return articles
    .map((a) => {
      const d = a?.seendate ? new Date(a.seendate) : new Date();
      return {
        title: String(a?.title || "").trim(),
        url: normalizeUrl(String(a?.url || "")),
        snippet: String(a?.summary || a?.sourceCollection || "").replace(/\s+/g, " ").trim().slice(0, 400),
        publishedAt: isNaN(d.getTime()) ? new Date() : d,
        sourceName: "GDELT",
        baseTrust: 0.65,
      };
    })
    .filter((c) => c.title && c.url)
    .slice(0, 12);
}

async function fetchGithub(section: CanonicalSection, _q: string): Promise<Candidate[]> {
  // Prefer explicit RSS URLs; otherwise fall back to repo release Atom feeds
  // (no GitHub API key needed), and finally to GitHub Blog as a general source.
  const urls = [
    ...rssUrlsForProvider("GITHUB", section),
    ...githubReleaseAtomUrls(section),
  ].filter(Boolean);

  if (urls.length === 0) urls.push("https://github.blog/feed/");

  const out = await fetchRssCandidatesFromUrls({
    urls,
    sourceName: "GitHub",
    baseTrust: 0.68,
    section,
  });

  return out.slice(0, 6);
}

async function fetchYouTube(section: CanonicalSection, _q: string): Promise<Candidate[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const query = `${youtubeQuery(section)} ${YOUTUBE_NEGATIVE_QUERY}`.trim();
  const orderRaw = String(process.env.YOUTUBE_ORDER || "viewCount").trim();
  const allowedOrder = new Set(["date", "rating", "relevance", "title", "videoCount", "viewCount"]);
  const order = allowedOrder.has(orderRaw) ? orderRaw : "viewCount";
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "12",
    order,
    q: query,
    key,
    videoEmbeddable: "true",
    videoSyndicated: "true",
    safeSearch: "moderate",
  });

  const category = YOUTUBE_CATEGORY_ID[section];
  if (category) params.set("videoCategoryId", category);
  params.set("videoDuration", YOUTUBE_DURATION_FILTER[section] || "medium");
  params.set("videoDefinition", "high");

  const publishedDays = clamp(Number(process.env.YOUTUBE_PUBLISHED_DAYS || 60), 7, 180);
  const publishedAfter = new Date(Date.now() - publishedDays * 24 * 60 * 60 * 1000).toISOString();
  params.set("publishedAfter", publishedAfter);

  const relevanceLanguage = String(process.env.YOUTUBE_RELEVANCE_LANGUAGE || "en").trim();
  if (relevanceLanguage) params.set("relevanceLanguage", relevanceLanguage);
  const regionCode = String(process.env.YOUTUBE_REGION_CODE || "US").trim();
  if (regionCode) params.set("regionCode", regionCode);

  const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
  const referer = resolveReferer();
  const headers: Record<string, string> = { "user-agent": "AtlasAssistant/1.1 (+ai)" };
  if (referer) {
    headers.referer = referer;
    headers.origin = referer;
  }

  const res = await fetch(url, { headers }).catch(() => null);
  if (!res || !res.ok) return [];

  const data: any = await res.json().catch(() => null);
  const items: any[] = data?.items || [];

  const ids = items.map((it) => String(it?.id?.videoId || "")).filter(Boolean);
  if (ids.length === 0) return [];

  const detailsParams = new URLSearchParams({
    part: "contentDetails,statistics,snippet",
    id: ids.join(","),
    key,
  });
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?${detailsParams.toString()}`;
  const detailsRes = await fetch(detailsUrl, { headers }).catch(() => null);
  const detailsJson: any = detailsRes && detailsRes.ok ? await detailsRes.json().catch(() => null) : null;
  const detailItems: any[] = detailsJson?.items || [];
  const detailMap = new Map<string, any>();
  for (const it of detailItems) {
    if (it?.id) detailMap.set(String(it.id), it);
  }
  if (detailMap.size === 0) return [];

  const minDuration = YOUTUBE_MIN_DURATION_SEC[section] ?? 180;
  const minViews = clamp(Number(process.env.YOUTUBE_MIN_VIEWS || 5000), 0, 1_000_000_000);
  const minLikes = clamp(Number(process.env.YOUTUBE_MIN_LIKES || 50), 0, 100_000_000);
  const minViewsPerDay = clamp(Number(process.env.YOUTUBE_MIN_VIEWS_PER_DAY || 200), 0, 1_000_000);
  const minLikeRatio = clamp(Number(process.env.YOUTUBE_MIN_LIKE_RATIO || 0.005), 0, 1);

  return items
    .map((it) => {
      const id = String(it?.id?.videoId || "");
      if (!id) return null;
      const detail = detailMap.get(id);
      if (!detail?.contentDetails) return null;
      const sn = detail?.snippet || it?.snippet || {};
      const title = String(sn?.title || "").trim();
      const snippet = String(sn?.description || "").replace(/\s+/g, " ").trim().slice(0, 400);
      const channel = String(sn?.channelTitle || "").trim();
      const d = sn?.publishedAt ? new Date(sn.publishedAt) : new Date();
      const durationSec = parseIsoDuration(detail?.contentDetails?.duration || "");
      const viewCount = parseNumber(detail?.statistics?.viewCount);
      const likeCount = parseNumber(detail?.statistics?.likeCount);
      const text = `${title} ${snippet} ${channel}`.toLowerCase();
      const ageDays = Math.max(1, hoursBetween(new Date(), d) / 24);
      const viewsPerDay = viewCount / ageDays;
      const likeRatio = viewCount > 0 ? likeCount / viewCount : 0;

      if (!durationSec || durationSec < minDuration) return null;
      if (sn?.liveBroadcastContent && sn.liveBroadcastContent !== "none") return null;
      if (text.includes("#shorts") || text.includes("shorts")) return null;
      if (YOUTUBE_LOW_QUALITY_MARKERS.some((m) => text.includes(m))) return null;
      if (viewCount < minViews && viewsPerDay < minViewsPerDay) return null;
      if (likeCount && likeCount < minLikes) return null;
      if (likeCount && viewCount && likeRatio < minLikeRatio) return null;
      if (!matchesKeywords(section, text)) return null;

      return {
        title,
        url: normalizeUrl(`https://www.youtube.com/watch?v=${id}`),
        snippet,
        publishedAt: isNaN(d.getTime()) ? new Date() : d,
        sourceName: "YouTube",
        baseTrust: durationSec >= minDuration + 300 ? 0.68 : 0.62,
      };
    })
    .filter((c): c is Candidate => Boolean(c && c.title && c.url))
    .slice(0, 6);
}

async function fetchX(section: CanonicalSection): Promise<Candidate[]> {
  // Either provide explicit RSS URLs, or enable keyword-based RSSHub feeds via RSSHUB_BASE_URL.
  const urls = [
    ...rssUrlsForProvider("X", section),
    ...rsshubTwitterKeywordUrls(section),
  ].filter(Boolean);

  if (urls.length === 0) return [];

  const out = await fetchRssCandidatesFromUrls({
    urls,
    sourceName: "X",
    baseTrust: 0.55,
    section,
  });

  return out
    .filter((c) => !/^rt\\b/i.test(c.title || ""))
    .slice(0, 6);
}

function scoreCandidate(section: CanonicalSection, c: Candidate) {
  const policy = SECTION_POLICIES[section];
  const rs = recencyScore(c.publishedAt, policy.recencyHalfLifeHours);
  const trust = clamp(c.baseTrust, 0, 1);

  const text = `${c.title} ${c.snippet}`.toLowerCase();
  let kw = 0;
  for (const k of policy.keywordBoosts) if (text.includes(k.keyword)) kw += k.boost;

  return clamp(0.55 * trust + 0.35 * rs + 0.10 * clamp(kw, 0, 0.25), 0, 1);
}

function hasProviderRss(provider: "X" | "GITHUB") {
  if (envList(`${provider}_RSS_URLS`).length || envList(`${provider}_RSS_URL`).length) return true;
  const sections = Object.keys(SECTION_POLICIES) as CanonicalSection[];
  const bySection = sections.some((section) => {
    const upper = section.toUpperCase();
    return (
      envList(`${provider}_RSS_URLS_${upper}`).length > 0 ||
      envList(`${provider}_RSS_URL_${upper}`).length > 0
    );
  });
  if (bySection) return true;

  // Provider-specific fallbacks (no private API keys):
  if (provider === "X") {
    // Requires RSSHUB_BASE_URL to be set.
    return Boolean(rsshubBaseUrl());
  }
  if (provider === "GITHUB") {
    return sections.some((s) => githubReleaseAtomUrls(s).length > 0) || envList("GITHUB_REPOS").length > 0;
  }
  return false;
}

function isDiscoveryEnabled() {
  // The AI tab must be empty unless at least one of these provider keys is set.
  // (No other sources are allowed in the AI tab.)
  const hasYouTube = Boolean(process.env.YOUTUBE_API_KEY);
  const hasGithub = hasProviderRss("GITHUB");
  const hasX = hasProviderRss("X");
  return hasYouTube || hasGithub || hasX;
}

export async function discoverOnce() {
  if (!isDiscoveryEnabled()) {
    return { ok: true, added: 0, skipped: true, reason: "No AI provider keys configured" };
  }

  // Product rules for AI tab (per section):
  // - Run at most every 12 hours
  // - Add at most 1 item per provider (GitHub/YouTube/X) per run => max 3/run
  // - Hard caps: 6/day, 42/week, and keep only the most recent 7 days
  const AI_RUN_INTERVAL_MS =
    clamp(Number(process.env.AI_DISCOVERY_INTERVAL_HOURS || 12), 1, 168) * 60 * 60 * 1000;
  const AI_PER_RUN_CAP = clamp(Number(process.env.AI_DISCOVERY_PER_RUN_CAP || 3), 1, 10);
  const AI_DAILY_CAP = clamp(Number(process.env.AI_DISCOVERY_DAILY_CAP || 6), AI_PER_RUN_CAP, 250);
  const AI_WEEKLY_CAP = clamp(Number(process.env.AI_DISCOVERY_WEEKLY_CAP || 42), AI_DAILY_CAP, 2000);

  const sections = Object.keys(SECTION_POLICIES) as CanonicalSection[];
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  let added = 0;
  let skipped = 0;
  const skippedReasons = {
    notDue: 0,
    dailyCap: 0,
    noCandidates: 0,
    upsertError: 0,
  };

  for (const section of sections) {
    const policy = SECTION_POLICIES[section];

    const sourceUrl = `ai:${section}`;
    const src = await prisma.source.upsert({
      where: { url: sourceUrl },
      update: { section, name: "AI", type: "ai", trustScore: 65, enabled: true },
      create: { section, name: "AI", type: "ai", url: sourceUrl, trustScore: 65, enabled: true },
    });

    // Run at most every 12h per section.
    if (src.lastFetchedAt && now - new Date(src.lastFetchedAt).getTime() < AI_RUN_INTERVAL_MS) {
      skipped += 1;
      skippedReasons.notDue += 1;
      continue;
    }

    // Max 6 discovered items per day per section.
    const dailyCount = await prisma.item.count({ where: { sourceId: src.id, createdAt: { gte: dayAgo } } });
    if (dailyCount >= AI_DAILY_CAP) {
      skipped += 1;
      skippedReasons.dailyCap += 1;
      continue;
    }

    const q = sectionQuery(section);

    const providerLists = await Promise.allSettled([
      // AI tab allows only these three providers.
      fetchGithub(section, q),
      fetchYouTube(section, q),
      fetchX(section),
    ]);

    const raw: Candidate[] = [];
    for (const r of providerLists) {
      if (r.status === "fulfilled") raw.push(...r.value);
    }

    // Dedupe by URL and title key.
    const seenUrl = new Set<string>();
    const seenTitle = new Set<string>();
    const dedup: Candidate[] = [];
    for (const c of raw) {
      const url = normalizeUrl(c.url);
      const tkey = normalizeTitleKey(c.title);
      if (!url || !tkey) continue;
      if (seenUrl.has(url) || seenTitle.has(tkey)) continue;
      seenUrl.add(url);
      seenTitle.add(tkey);
      dedup.push({ ...c, url });
    }

    // Filter out items already in DB.
    const urls = dedup.map((c) => c.url).slice(0, 60);
    const existing = await prisma.item.findMany({ where: { url: { in: urls } }, select: { url: true } }).catch(() => []);
    const existingSet = new Set(existing.map((e) => e.url));

    const candidates = dedup
      .filter((c) => !existingSet.has(c.url))
      .map((c) => ({ c, score: scoreCandidate(section, c) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);

    // Optional LLM re-ranking for better "best content" selection.
    // We keep a deterministic fallback if the model call fails.
    const llmEnabled =
      Boolean(process.env.AI_DISCOVERY_API_KEY) &&
      String(process.env.AI_DISCOVERY_USE_LLM || "1") !== "0" &&
      candidates.length > 0;

    let ranked = candidates;
    if (llmEnabled) {
      try {
        const idx = await aiSelectImportant({
          candidates: candidates.map((x) => ({
            title: x.c.title,
            sourceName: x.c.sourceName,
            country: null,
            url: x.c.url,
            baseScore: x.score,
          })),
        });

        const picked = idx
          .map((i) => ranked[i])
          .filter((x): x is (typeof ranked)[number] => Boolean(x));

        const used = new Set(picked.map((x) => x.c.url));
        ranked = [...picked, ...ranked.filter((x) => !used.has(x.c.url))];
      } catch {
        // ignore; keep heuristic ranking
      }
    }

    if (!ranked.length) {
      await prisma.source.update({ where: { id: src.id }, data: { lastFetchedAt: new Date() } }).catch(() => null);
      skipped += 1;
      skippedReasons.noCandidates += 1;
      continue;
    }

    // Pick the highest-scoring candidate per provider, up to 3 total.
    const remainingToday = Math.max(0, AI_DAILY_CAP - dailyCount);
    const remainingThisRun = Math.min(AI_PER_RUN_CAP, remainingToday);
    const providerKey = (name: string) => {
      const n = String(name || "").trim();
      if (!n) return "";
      if (n.toLowerCase().startsWith("x ") || n.toLowerCase().startsWith("x@")) return "X";
      if (n.toLowerCase().startsWith("github")) return "GitHub";
      if (n.toLowerCase().startsWith("youtube")) return "YouTube";
      return n;
    };

    const picked: Candidate[] = [];
    const usedProviders = new Set<string>();
    for (const x of ranked) {
      const p = providerKey(x.c.sourceName || "");
      if (!p) continue;
      if (usedProviders.has(p)) continue;
      usedProviders.add(p);
      picked.push(x.c);
      if (picked.length >= remainingThisRun) break;
    }

    const chosen = picked;

    for (const c of chosen) {
      const topics = extractTopics(section, c.title, c.snippet);
      try {
        const s = scoreCandidate(section, c);
        await prisma.item.upsert({
          where: { url: c.url },
          create: {
            sourceId: src.id,
            section,
            title: c.title,
            summary: c.snippet || c.title,
            aiSummary: null,
            url: c.url,
            country: null,
            topics,
            score: s,
            publishedAt: c.publishedAt,
          },
          update: {
            sourceId: src.id,
            section,
            title: c.title,
            summary: c.snippet || c.title,
            topics,
            score: s,
            publishedAt: c.publishedAt,
            // Keep AI items visible in time-windowed feeds by treating
            // `createdAt` as "collectedAt".
            createdAt: new Date(),
          },
        });
        added += 1;
      } catch {
        skipped += 1;
        skippedReasons.upsertError += 1;
      }
    }

    // Mark section AI run time.
    await prisma.source.update({ where: { id: src.id }, data: { lastFetchedAt: new Date() } }).catch(() => null);

    // Enforce caps for AI items so they don't grow indefinitely.
    const keepDaily = await prisma.item.findMany({
      where: { section, createdAt: { gte: dayAgo }, source: { is: { type: "ai" } } },
      select: { id: true },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: AI_DAILY_CAP,
    });

    const dailyKeep = keepDaily.map((x) => x.id);

    const keepWeekly = await prisma.item.findMany({
      where: { section, createdAt: { gte: weekAgo }, source: { is: { type: "ai" } } },
      select: { id: true },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: AI_WEEKLY_CAP,
    });

    const keepWeek: string[] = [...dailyKeep];
    const keepWeekSet = new Set(keepWeek);
    for (const w of keepWeekly) {
      if (keepWeek.length >= AI_WEEKLY_CAP) break;
      if (!keepWeekSet.has(w.id)) {
        keepWeek.push(w.id);
        keepWeekSet.add(w.id);
      }
    }

    if (keepWeek.length) {
      await prisma.item.deleteMany({
        where: { section, createdAt: { gte: weekAgo }, source: { is: { type: "ai" } }, id: { notIn: keepWeek } },
      });
    }

    // Retention: drop anything older than 7 days for AI items.
    await prisma.item.deleteMany({ where: { section, createdAt: { lt: weekAgo }, source: { is: { type: "ai" } } } });
  }

  return { ok: true, added, skipped, stats: skippedReasons };
}
