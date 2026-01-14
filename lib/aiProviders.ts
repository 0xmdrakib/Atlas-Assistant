/**
 * Provider-agnostic AI helpers.
 *
 * Supported providers:
 * - Gemini API (default)
 * - OpenAI (legacy / optional)
 */

export type Provider = "gemini" | "openai";

// Map UI language codes to human-friendly labels for prompts.
// Keep this list aligned with the language picker.
export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  bn: "Bangla",
  ar: "Arabic",
  hi: "Hindi",
  ur: "Urdu",
  tr: "Turkish",
  id: "Indonesian",
  fr: "French",
  es: "Spanish",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
};

function langLabel(lang?: string): string {
  const key = String(lang || "en").toLowerCase();
  return LANGUAGE_LABELS[key] || "English";
}

function getProvider(kind: "summary" | "discovery"): Provider {
  const v = (process.env[`AI_${kind.toUpperCase()}_PROVIDER`] || "").toLowerCase();
  if (v === "openai") return "openai";
  // default
  return "gemini";
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function geminiGenerateText(args: {
  apiKey: string;
  model: string;
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  // Structured output (optional)
  responseMimeType?: string;
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

  if (responseMimeType) body.generationConfig.responseMimeType = responseMimeType;
  if (responseJsonSchema) body.generationConfig.responseJsonSchema = responseJsonSchema;

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

async function openaiChatCompletion(args: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  max_tokens?: number;
}): Promise<string> {
  const { apiKey, model, messages, temperature = 0.2, max_tokens = 500 } = args;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI chat completion failed: ${res.status} ${t}`);
  }
  const data: any = await res.json();
  return String(data?.choices?.[0]?.message?.content || "").trim();
}

export async function aiSummarizeItem(args: {
  title: string;
  snippet?: string;
  url: string;
  lang?: string;
}): Promise<string> {
  const provider = getProvider("summary");
  const key = requiredEnv("AI_SUMMARY_API_KEY");
  const model = process.env.AI_SUMMARY_MODEL || (provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini");

  const targetLang = langLabel(args.lang);
  const prompt = `Summarize this item for a high-signal feed.

Output language: ${targetLang}

Rules:
- 7–12 bullet points (more detailed than a headline)
- each bullet is 1–2 sentences (keep it readable)
- include concrete entities/places/numbers WHEN present in the input
- include a final bullet starting with "Why it matters:" (1–2 sentences)
- stay factual, neutral, no hype, no emojis
- do NOT invent facts; if unsure, write "unclear" and move on

TITLE: ${args.title}
SNIPPET: ${args.snippet || ""}
URL: ${args.url}`;

  if (provider === "openai") {
    return openaiChatCompletion({
      apiKey: key,
      model,
      messages: [
        { role: "system", content: "You write compact, factual summaries." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 560,
    });
  }

  return geminiGenerateText({
    apiKey: key,
    model,
    prompt,
    systemInstruction: "You write compact, factual summaries.",
    temperature: 0.2,
    maxOutputTokens: 720,
  });
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
  const provider = getProvider("summary");
  const key = requiredEnv("AI_SUMMARY_API_KEY");
  const model = process.env.AI_SUMMARY_MODEL || (provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini");

  const targetLang = langLabel(args.lang);

  const prompt = `Create a professional, readable digest for a curated feed.

Section: ${args.section}
Window: last ${args.days} day(s)
Filters: country=${args.country || "any"}, category=${args.topic || "any"}

Output language: ${targetLang}

Rules:

Return ONLY JSON using this schema:
{
  "overview": string,
  "themes": string[],
  "highlights": string[],
  "whyItMatters": string[],
  "watchlist": string[]
}

Guidelines:
- overview: 4-7 short sentences (still skimmable)
- themes: 4-7 bullets
- highlights: 8-14 bullets (1 sentence each)
- whyItMatters: 3-6 bullets
- watchlist: 3-6 bullets

Items:
${args.items
  .slice(0, 25)
  .map((i, idx) => `${idx + 1}. [${i.sourceName}] ${i.title} (${i.url})`)
  .join("\n")}`;

  if (provider === "openai") {
    const out = await openaiChatCompletion({
      apiKey: key,
      model,
      messages: [
        { role: "system", content: "Return only JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1100,
    });

    // validate JSON (will throw if invalid)
    JSON.parse(out);
    return out;
  }

  const out = await geminiGenerateText({
    apiKey: key,
    model,
    prompt,
    systemInstruction: "Return only JSON.",
    temperature: 0.2,
    maxOutputTokens: 1200,
    responseMimeType: "application/json",
    responseJsonSchema: {
      type: "object",
      properties: {
        overview: { type: "string" },
        themes: { type: "array", items: { type: "string" } },
        highlights: { type: "array", items: { type: "string" } },
        whyItMatters: { type: "array", items: { type: "string" } },
        watchlist: { type: "array", items: { type: "string" } },
      },
      required: ["overview", "themes", "highlights", "whyItMatters", "watchlist"],
    },
  });

  // Ensure valid JSON
  JSON.parse(out);
  return out;
}

export async function aiTranslateBatch(args: {
  lang: string;
  items: Array<{ title: string; summary: string }>;
}): Promise<Array<{ title: string; summary: string }>> {
  const provider = getProvider("summary");
  const key = requiredEnv("AI_SUMMARY_API_KEY");
  const model = process.env.AI_SUMMARY_MODEL || (provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini");
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

  if (provider === "openai") {
    const out = await openaiChatCompletion({
      apiKey: key,
      model,
      messages: [
        { role: "system", content: "Return only JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 900,
    });
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [];
  }

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

export async function aiSelectImportant(args: {
  candidates: Array<{ title: string; sourceName: string; country: string | null; url: string; baseScore: number }>;
}): Promise<number[]> {
  const provider = getProvider("discovery");
  const key = requiredEnv("AI_DISCOVERY_API_KEY");
  const model =
    process.env.AI_DISCOVERY_MODEL || (provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini");

  // Keep the prompt small; we only need index selection.
  const list = args.candidates
    .slice(0, 30)
    .map((c, i) => `${i}. ${c.title} | source=${c.sourceName} | country=${c.country || "?"} | score=${c.baseScore.toFixed(2)} | url=${c.url}`)
    .join("\n");

  const prompt = `You are ranking items for a high-signal feed.

Pick the BEST 6 items (or fewer if low quality). Prefer:
- reputable sources
- novelty + impact
- avoids clickbait
- diverse topics

Return ONLY a JSON array of integer indexes (e.g. [0,3,7]).

Candidates:
${list}`;

  if (provider === "openai") {
    const out = await openaiChatCompletion({
      apiKey: key,
      model,
      messages: [
        { role: "system", content: "Return only JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 120,
    });
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [];
  }

  const out = await geminiGenerateText({
    apiKey: key,
    model,
    prompt,
    systemInstruction: "Return only JSON.",
    temperature: 0.1,
    maxOutputTokens: 160,
    responseMimeType: "application/json",
    responseJsonSchema: {
      type: "array",
      items: { type: "integer" },
    },
  });

  // Gemini may return JSON with whitespace/newlines — still valid JSON.
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [];
}
