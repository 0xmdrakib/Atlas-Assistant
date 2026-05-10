import type { Section } from "@/lib/types";
import { OPENAI_MODELS, isOpenAiEnabled, openaiGenerateText } from "@/lib/openaiHttp";

export type FeedPickCandidate = {
  title: string;
  snippet: string;
  url: string;
  sourceName?: string | null;
  score: number;
  publishedAt?: string;
  country?: string | null;
  topics?: string[];
};

export function isFeedPickerEnabled(): boolean {
  return isOpenAiEnabled();
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

async function openaiPickIndex(args: {
  section: Section;
  candidates: FeedPickCandidate[];
  timeoutMs?: number;
}): Promise<number | null> {
  const { section, candidates, timeoutMs = 12_000 } = args;

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
    `Select one item to feature in the "${section}" section of a news feed.`,
    `Pick the single best candidate index based on quality, credibility, relevance, novelty, and impact.`,
    `Avoid clickbait. Prefer higher score if quality is similar. If none are good enough, return null.`,
    ``,
    JSON.stringify({ section, candidates: list }),
  ].join("\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      pickIndex: { type: ["integer", "null"] },
    },
    required: ["pickIndex"],
  };

  const raw = await openaiGenerateText({
    model: OPENAI_MODELS.feedPicker,
    prompt,
    instructions: "Return only JSON.",
    temperature: 0.1,
    maxOutputTokens: 64,
    jsonSchema: { name: "atlas_feed_pick", schema },
    timeoutMs,
    retries: 1,
  });

  if (!raw) return null;
  const parsed: any = JSON.parse(String(raw).trim());
  const idx = parsed?.pickIndex;

  if (idx === null || typeof idx === "undefined") return null;
  const n = Number(idx);
  if (!Number.isFinite(n)) return null;

  return clamp(Math.trunc(n), 0, candidates.length - 1);
}

export async function aiPickFeedCandidateIndex(section: Section, candidates: FeedPickCandidate[]): Promise<number | null> {
  if (!isFeedPickerEnabled()) return null;
  if (!candidates || candidates.length === 0) return null;

  try {
    return await openaiPickIndex({ section, candidates });
  } catch (e) {
    console.warn("aiPickFeedCandidateIndex failed", e);
    return null;
  }
}
