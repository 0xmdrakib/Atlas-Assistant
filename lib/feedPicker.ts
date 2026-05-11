import type { Section } from "@/lib/types";
import { OPENAI_MODELS, isOpenAiEnabled, openaiGenerateText } from "@/lib/openaiHttp";
import { getSectionDescription, SECTION_KEYWORDS } from "@/lib/section-keywords";

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

  const sectionInfo = SECTION_KEYWORDS[section];
  const sectionDesc = sectionInfo?.description || "General news.";
  const includeKeywords = (sectionInfo?.include || []).slice(0, 20).join(", ");
  const excludeKeywords = (sectionInfo?.exclude || []).slice(0, 10).join(", ");

  const list = candidates.map((c, i) => ({
    i,
    title: c.title,
    snippet: c.snippet?.slice(0, 300) || "",
    source: c.sourceName || "",
    score: Number.isFinite(c.score) ? Number(c.score) : 0,
    publishedAt: c.publishedAt || "",
    country: c.country || "",
    topics: Array.isArray(c.topics) ? c.topics.slice(0, 6) : [],
    url: c.url,
  }));

  const prompt = `You are selecting the single best news item for the "${section}" section of a curated feed.

Section: "${section}"
This section covers: ${sectionDesc}

Relevant topics for this section: ${includeKeywords}
Topics that do NOT belong in this section: ${excludeKeywords}

Candidates:
${JSON.stringify({ section, candidates: list }, null, 2)}

Rules:
- Pick the candidate that is MOST relevant to the "${section}" section definition above.
- If a candidate is clearly off-topic for this section, do NOT pick it.
- Prefer candidates with higher relevance and impact for this specific section.
- Consider the snippet/description to judge actual content, not just the title.
- If none of the candidates are genuinely relevant to this section, return null.
- Return the index (0-based) of the best candidate.

Return JSON: { "pickIndex": <number or null> }`;

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
    instructions: `You are a content curator for section "${section}". Your job is to pick the single most relevant and important item for this specific section from the candidates. Use the section description and keyword lists to judge relevance. Return only JSON.`,
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
