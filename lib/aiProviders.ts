import { languageLabel as uiLanguageLabel } from "@/lib/i18n";

/**
 * Gemini-only AI helpers.
 */


function langLabel(lang?: string): string {
  const key = String(lang || "en").toLowerCase();
  return uiLanguageLabel(key) || "English";
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeGeminiSummaryModel(modelFromEnv: string | undefined): string {
  // Gemini 2.0 Flash is deprecated; auto-upgrade if still configured.
  // Model code reference: gemini-3-flash-preview
  const fallback = "gemini-3-flash-preview";
  const m = (modelFromEnv || "").trim();
  if (!m) return fallback;
  if (m.startsWith("gemini-2.0-")) return fallback;
  return m;
}

function stripAsterisksAndMarkdown(input: string): string {
  // Make summaries TTS-friendly by removing markdown artifacts that cause
  // "star/asterisk" to be spoken.
  let s = String(input || "");

  // Remove backticks.
  s = s.replace(/`+/g, "");

  // Remove markdown emphasis markers.
  s = s.replace(/\*\*(.*?)\*\*/g, "$1");
  s = s.replace(/\*(.*?)\*/g, "$1");

  // Remove leading list markers on each line.
  s = s
    .split("\n")
    .map((line) => line.replace(/^\s*[*•\-]\s+/, ""))
    .join("\n");

  // Remove any remaining asterisks.
  s = s.replace(/\*/g, "");

  // Collapse excessive blank lines.
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function sanitizeSingleLine(input: string): string {
  return stripAsterisksAndMarkdown(input).replace(/\s+/g, " ").trim();
}

async function geminiGenerateText(args: {
  apiKey: string;
  model: string;
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  // Structured output (optional)
  // Gemini REST supports TWO schema mechanisms:
  // - generationConfig.responseSchema (OpenAPI-ish Schema message)
  // - generationConfig._responseJsonSchema (JSON Schema subset)
  // We use _responseJsonSchema because our schemas are authored as JSON Schema.
  responseMimeType?: string;
  responseSchema?: unknown;
  responseJsonSchema?: unknown;
}): Promise<string> {
  const {
    apiKey,
    model,
    prompt,
    systemInstruction,
    temperature = 0.2,
    maxOutputTokens = 500,
    responseMimeType,
    responseSchema,
    responseJsonSchema,
  } = args;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  // Keep the request strict: avoid sending duplicate/legacy fields.
  if (responseMimeType) body.generationConfig.responseMimeType = responseMimeType;

  // IMPORTANT (Gemini API):
  // - For JSON Schema (supports `additionalProperties`), send via `_responseJsonSchema`.
  // - For the OpenAPI-ish Schema message, send via `responseSchema`.
  // Never set both.
  if (responseJsonSchema) body.generationConfig._responseJsonSchema = responseJsonSchema;
  else if (responseSchema) body.generationConfig.responseSchema = responseSchema;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini generateContent failed: ${res.status} ${t}`);
  }
  const data: any = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") ||
    data?.candidates?.[0]?.output ||
    "";
  return String(text || "").trim();
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

  // Remove common wrappers (code fences / leading text).
  let s = String(raw).trim();
  s = s.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

  // Try extracting the first JSON object.
  const o0 = s.indexOf("{");
  const o1 = s.lastIndexOf("}");
  if (o0 >= 0 && o1 > o0) {
    const sub = attempt(s.slice(o0, o1 + 1));
    if (sub) return sub;
  }

  // Try extracting the first JSON array.
  const a0 = s.indexOf("[");
  const a1 = s.lastIndexOf("]");
  if (a0 >= 0 && a1 > a0) {
    const sub = attempt(s.slice(a0, a1 + 1));
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
  const key = requiredEnv("AI_SUMMARY_API_KEY");
  const model = normalizeGeminiSummaryModel(process.env.AI_SUMMARY_MODEL);

  const targetLang = langLabel(args.lang);
  const prompt = `Write a professional, easy-to-skim summary for a high-signal feed.

Output language: ${targetLang}

Strict rules:
1) Plain text only. No markdown.
2) Do NOT use bullet characters (*, -, •) and do NOT use asterisks for emphasis.
3) Do not invent facts. If something is missing/unclear, write "unclear".
4) Preserve key entities, locations, numbers, and timelines WHEN they appear in the input.
5) KEEP THESE SECTION LABELS IN ENGLISH EXACTLY (do not translate):
   "TLDR:", "Key points:", "Context:", "Why it matters:".
6) Minimum content: TLDR + 4 key points + Context + Why it matters. Do not return only TLDR.

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

  const out = await geminiGenerateText({
    apiKey: key,
    model,
    prompt,
    systemInstruction: "You write compact, factual summaries.",
    temperature: 0.2,
    maxOutputTokens: 1000,
  });

  return stripAsterisksAndMarkdown(out);
}

export type DigestOutput = {
  overview: string; // 1-2 sentences
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
  const key = requiredEnv("AI_SUMMARY_API_KEY");
  const model = normalizeGeminiSummaryModel(process.env.AI_SUMMARY_MODEL);

  const targetLang = langLabel(args.lang);
  const itemCount = args.items.length;

  const prompt = `Create a professional, readable digest for a curated feed.

Section: ${args.section}
Window: last ${args.days} day(s)
Filters: country=${args.country || "any"}, category=${args.topic || "any"}
Items on page: ${itemCount}

Output language: ${targetLang}

Rules:

- Digest MUST reflect the selected time window (last ${args.days} day(s)).
- Use ONLY the provided items; do not invent stories.
- Plain text in JSON values (no markdown, no asterisks, no bullet prefixes).

Return ONLY JSON using this schema:
{
  "overview": string,
  "themes": string[],
  "highlights": string[],
  "whyItMatters": string[],
  "watchlist": string[]
}

Guidelines:

Dynamic sizing rules:
- If itemCount < 8, keep highlights <= 6 and themes <= 4.
- If itemCount is between 8 and 18, use the normal ranges.
- If itemCount > 18, cap highlights at 12 and keep everything skimmable.

Normal ranges (when itemCount is 8-18):

- overview: 4-7 short sentences (still skimmable)
- themes: 4-7 entries
- highlights: 8-14 entries (1 sentence each)
- whyItMatters: 3-6 entries
- watchlist: 3-6 entries

Tone + formatting requirements (important for voice mode):
- No markdown (no '*', no '**', no leading '-' or '•').
- Each array entry must be a single sentence or short phrase and MUST NOT start with punctuation.
- Keep it factual, neutral, and easy to understand.

Items:
${args.items
  .slice(0, 25)
  .map((i, idx) => `${idx + 1}. [${i.sourceName}] ${i.title} (${i.url})`)
  .join("\n")}`;

  const normalizeDigest = (parsed: any): DigestOutput => ({
    overview: stripAsterisksAndMarkdown(parsed?.overview || ""),
    themes: (parsed?.themes || []).map(sanitizeSingleLine).filter(Boolean),
    highlights: (parsed?.highlights || []).map(sanitizeSingleLine).filter(Boolean),
    whyItMatters: (parsed?.whyItMatters || []).map(sanitizeSingleLine).filter(Boolean),
    watchlist: (parsed?.watchlist || []).map(sanitizeSingleLine).filter(Boolean),
  });

  const schema = {
    type: "object",
    properties: {
      overview: { type: "string" },
      themes: { type: "array", items: { type: "string" } },
      highlights: { type: "array", items: { type: "string" } },
      whyItMatters: { type: "array", items: { type: "string" } },
      watchlist: { type: "array", items: { type: "string" } },
    },
    required: ["overview", "themes", "highlights", "whyItMatters", "watchlist"],
    additionalProperties: false,
  };

  const out1 = await geminiGenerateText({
    apiKey: key,
    model,
    prompt,
    systemInstruction: "Return only JSON.",
    temperature: 0,
    maxOutputTokens: 1600,
    responseMimeType: "application/json",
    responseJsonSchema: schema,
  });

  const parsed1 = safeParseJson<any>(out1);
  if (parsed1) return JSON.stringify(normalizeDigest(parsed1));

  // Retry once: Gemini occasionally ignores schema and returns truncated JSON.
  const out2 = await geminiGenerateText({
    apiKey: key,
    model,
    prompt: `${prompt}\n\nReturn ONLY valid JSON that matches the schema. Do not include markdown fences.`,
    systemInstruction: "Return only JSON.",
    temperature: 0,
    maxOutputTokens: 2200,
    responseMimeType: "application/json",
    responseJsonSchema: schema,
  });

  const parsed2 = safeParseJson<any>(out2);
  return JSON.stringify(normalizeDigest(parsed2 || { overview: out2 }));
}

export async function aiTranslateBatch(args: {
  lang: string;
  items: Array<{ title: string; summary: string }>;
}): Promise<Array<{ title: string; summary: string }>> {
  const key = requiredEnv("AI_SUMMARY_API_KEY");
  const model = normalizeGeminiSummaryModel(process.env.AI_SUMMARY_MODEL);
  const targetLang = langLabel(args.lang);

  const prompt = `Translate the following items into ${targetLang}.

Rules:
- Keep proper nouns and org names as-is unless there is a standard translation.
- Keep it neutral and factual.
- Return ONLY JSON array, same length, each element: {"title": string, "summary": string}

Items:
${args.items
  .slice(0, 12)
  .map((it, idx) => `${idx + 1}. TITLE: ${it.title}\n   SUMMARY: ${it.summary}`)
  .join("\n\n")}`;

  const out = await geminiGenerateText({
    apiKey: key,
    model,
    prompt,
    systemInstruction: "Return only JSON.",
    temperature: 0.2,
    maxOutputTokens: 1200,
    responseMimeType: "application/json",
    responseJsonSchema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
        },
        required: ["title", "summary"],
      },
    },
  });

  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [];
}

