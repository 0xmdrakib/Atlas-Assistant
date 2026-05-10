import { languageLabel as uiLanguageLabel } from "@/lib/i18n";
import { OPENAI_MODELS, openaiGenerateText } from "@/lib/openaiHttp";

function langLabel(lang?: string): string {
  const key = String(lang || "en").toLowerCase();
  return uiLanguageLabel(key) || "English";
}

function stripAsterisksAndMarkdown(input: string): string {
  let s = String(input || "");
  s = s.replace(/`+/g, "");
  s = s.replace(/\*\*(.*?)\*\*/g, "$1");
  s = s.replace(/\*(.*?)\*/g, "$1");
  s = s
    .split("\n")
    .map((line) => line.replace(/^\s*[*\-]\s+/, ""))
    .join("\n");
  s = s.replace(/\*/g, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function sanitizeSingleLine(input: string): string {
  return stripAsterisksAndMarkdown(input).replace(/\s+/g, " ").trim();
}

function safeParseJson<T = any>(raw: string): T | null {
  const attempt = (s: string): T | null => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };

  if (!raw) return null;
  const direct = attempt(raw);
  if (direct) return direct;

  let s = String(raw).trim();
  s = s.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

  const o0 = s.indexOf("{");
  const o1 = s.lastIndexOf("}");
  if (o0 >= 0 && o1 > o0) {
    const sub = attempt(s.slice(o0, o1 + 1));
    if (sub) return sub;
  }

  return null;
}

export async function aiSummarizeItem(args: {
  title: string;
  snippet?: string;
  url: string;
  lang?: string;
}): Promise<string> {
  const targetLang = langLabel(args.lang);
  const prompt = `Write a professional, easy-to-skim summary for a high-signal feed.

Output language: ${targetLang}

Strict rules:
1) Plain text only. No markdown.
2) Do not use bullet characters or asterisks for emphasis.
3) Do not invent facts. If something is missing or unclear, write "unclear".
4) Preserve key entities, locations, numbers, and timelines when they appear in the input.
5) Keep these section labels in English exactly: "TLDR:", "Key points:", "Context:", "Why it matters:".
6) Minimum content: TLDR + 4 key points + Context + Why it matters.

Use this exact format:
TLDR: <one sentence>
Key points:
1) <fact, 1 sentence>
2) <fact, 1 sentence>
3) <fact, 1 sentence>
4) <fact, 1 sentence>
Context: <1-2 sentences>
Why it matters: <1-2 sentences>

TITLE: ${args.title}
SNIPPET: ${args.snippet || ""}
URL: ${args.url}`;

  const out = await openaiGenerateText({
    model: OPENAI_MODELS.summary,
    prompt,
    instructions: "You write compact, factual summaries.",
    temperature: 0.2,
    maxOutputTokens: 1000,
    timeoutMs: 25_000,
    retries: 1,
  });

  return stripAsterisksAndMarkdown(out);
}

export type DigestOutput = {
  overview: string;
  themes: string[];
  highlights: string[];
  whyItMatters: string[];
  watchlist: string[];
};

export async function aiDigest(args: {
  section: string;
  days: number;
  country: string | null;
  topic: string | null;
  items: Array<{ title: string; sourceName: string; url: string }>;
  lang?: string;
}): Promise<string> {
  const targetLang = langLabel(args.lang);
  const itemCount = args.items.length;

  const prompt = `Create a professional, readable digest for a curated feed.

Section: ${args.section}
Window: last ${args.days} day(s)
Filters: country=${args.country || "any"}, category=${args.topic || "any"}
Items on page: ${itemCount}

Output language: ${targetLang}

Rules:
- Digest must reflect the selected time window.
- Use only the provided items; do not invent stories.
- Plain text in JSON values. No markdown, no asterisks, no bullet prefixes.
- Each array entry must be a single sentence or short phrase.

Dynamic sizing:
- If itemCount < 8, keep highlights <= 6 and themes <= 4.
- If itemCount is between 8 and 18, use normal ranges.
- If itemCount > 18, cap highlights at 12.

Normal ranges:
- overview: 4-7 short sentences
- themes: 4-7 entries
- highlights: 8-14 entries
- whyItMatters: 3-6 entries
- watchlist: 3-6 entries

Items:
${args.items
  .slice(0, 25)
  .map((i, idx) => `${idx + 1}. [${i.sourceName}] ${i.title} (${i.url})`)
  .join("\n")}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      overview: { type: "string" },
      themes: { type: "array", items: { type: "string" } },
      highlights: { type: "array", items: { type: "string" } },
      whyItMatters: { type: "array", items: { type: "string" } },
      watchlist: { type: "array", items: { type: "string" } },
    },
    required: ["overview", "themes", "highlights", "whyItMatters", "watchlist"],
  };

  const normalizeDigest = (parsed: any): DigestOutput => ({
    overview: stripAsterisksAndMarkdown(parsed?.overview || ""),
    themes: (parsed?.themes || []).map(sanitizeSingleLine).filter(Boolean),
    highlights: (parsed?.highlights || []).map(sanitizeSingleLine).filter(Boolean),
    whyItMatters: (parsed?.whyItMatters || []).map(sanitizeSingleLine).filter(Boolean),
    watchlist: (parsed?.watchlist || []).map(sanitizeSingleLine).filter(Boolean),
  });

  const out = await openaiGenerateText({
    model: OPENAI_MODELS.digest,
    prompt,
    instructions: "Return only JSON that matches the requested schema.",
    temperature: 0,
    maxOutputTokens: 1800,
    jsonSchema: { name: "atlas_digest", schema },
    timeoutMs: 35_000,
    retries: 1,
  });

  const parsed = safeParseJson<any>(out);
  return JSON.stringify(normalizeDigest(parsed || { overview: out }));
}
