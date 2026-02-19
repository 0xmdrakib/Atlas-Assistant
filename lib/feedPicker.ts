import type { Section } from "@/lib/types";

export type FeedPickCandidate = {
  title: string;
  snippet: string;
  url: string;
  sourceName?: string | null;
  score: number;
  publishedAt?: string; // ISO
  country?: string | null;
  topics?: string[];
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function isFeedPickerEnabled(): boolean {
  return Boolean(process.env.AI_FEED_PICKER_API_KEY);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

async function geminiPickIndex(args: {
  apiKey: string;
  model: string;
  section: Section;
  candidates: FeedPickCandidate[];
  timeoutMs?: number;
}): Promise<number | null> {
  const { apiKey, model, section, candidates, timeoutMs = 12_000 } = args;

  const list = candidates.slice(0, 24).map((c, i) => ({
    i,
    title: c.title,
    snippet: c.snippet?.slice(0, 220) || "",
    source: c.sourceName || "",
    score: Number.isFinite(c.score) ? Number(c.score) : 0,
    publishedAt: c.publishedAt || "",
    country: c.country || "",
    topics: Array.isArray(c.topics) ? c.topics.slice(0, 6) : [],
    url: c.url,
  }));

  const prompt = [
    `You are selecting ONE item to feature in the "${section}" section of a news feed.`,
    `Pick the single BEST candidate index based on:`,
    `- quality + credibility (avoid clickbait)`,
    `- relevance to the section`,
    `- novelty / impact`,
    `- prefers higher score if quality is similar`,
    `If none are good enough, return null.`,
    `Return ONLY JSON matching the provided schema.`,
    ``,
    JSON.stringify({ section, candidates: list }),
  ].join("\n");

  const schema = {
    type: "object",
    properties: {
      pickIndex: { type: ["integer", "null"], description: "Index of the chosen candidate (field i), or null." },
    },
    required: ["pickIndex"],
    additionalProperties: false,
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: any = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 64,
        response_mime_type: "application/json",
        response_json_schema: schema,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Gemini feed picker failed: ${res.status} ${txt}`);
    }

    const data: any = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") ||
      data?.candidates?.[0]?.output ||
      "";

    const raw = String(text || "").trim();
    if (!raw) return null;

    const parsed: any = JSON.parse(raw);
    const idx = parsed?.pickIndex;

    if (idx === null || typeof idx === "undefined") return null;
    const n = Number(idx);
    if (!Number.isFinite(n)) return null;

    // Defensive clamp.
    const i = clamp(Math.trunc(n), 0, candidates.length - 1);
    return i;
  } finally {
    clearTimeout(t);
  }
}

export async function aiPickFeedCandidateIndex(section: Section, candidates: FeedPickCandidate[]): Promise<number | null> {
  if (!isFeedPickerEnabled()) return null;
  if (!candidates || candidates.length === 0) return null;

  const apiKey = requiredEnv("AI_FEED_PICKER_API_KEY");
  const model = process.env.AI_FEED_PICKER_MODEL || "gemini-3-flash-preview";

  try {
    return await geminiPickIndex({ apiKey, model, section, candidates });
  } catch (e) {
    console.warn("aiPickFeedCandidateIndex failed", e);
    return null;
  }
}
