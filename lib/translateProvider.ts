import { languageByCode } from "@/lib/i18n";

export type TranslatableItem = {
  id: string;
  title: string;
  summary: string;
};

export type TranslatedItem = {
  id: string;
  title: string;
  summary: string;
  // Whether the translation came from the model (vs fallback).
  ok: boolean;
};

export function isTranslateEnabled(): boolean {
  // Support both the dedicated key and the common GEMINI_API_KEY name.
  return Boolean(process.env.AI_TRANSLATE_API_KEY || process.env.GEMINI_API_KEY);
}

function languageForPrompt(lang: string): { label: string; nativeLabel?: string } {
  const L = languageByCode(lang);
  if (!L) return { label: lang };
  return { label: L.label, nativeLabel: L.nativeLabel };
}

function chunkByBudget(items: TranslatableItem[], maxItems: number, maxChars: number): TranslatableItem[][] {
  const chunks: TranslatableItem[][] = [];
  let cur: TranslatableItem[] = [];
  let curChars = 0;

  const approx = (it: TranslatableItem) => (it.title?.length ?? 0) + (it.summary?.length ?? 0) + 24;

  for (const it of items) {
    const c = approx(it);
    if (cur.length >= maxItems || (cur.length > 0 && curChars + c > maxChars)) {
      chunks.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(it);
    curChars += c;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

async function geminiTranslateChunk(items: TranslatableItem[], targetLang: string): Promise<TranslatedItem[]> {
  const apiKey = process.env.AI_TRANSLATE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing required env var: AI_TRANSLATE_API_KEY (or GEMINI_API_KEY)");

  const model = process.env.AI_TRANSLATE_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  const target = languageForPrompt(targetLang);
  const targetLabel = target.nativeLabel ? `${target.label} (${target.nativeLabel})` : target.label;

  const payloadItems = items
    .map((it) => ({
      id: it.id,
      title: it.title,
      summary: it.summary ?? "",
    }))
    .filter(Boolean);

  const prompt = [
    `Translate the following items into ${targetLabel}.`,
    `- Preserve URLs, @handles, #hashtags, numbers, punctuation, and Markdown formatting.`,
    `- Keep proper nouns (people/org/product names) as-is unless there's a standard translation.`,
    `- Return ONLY valid JSON matching the provided schema.`,
    ``,
    JSON.stringify(payloadItems),
  ].join("\n");

  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        summary: { type: "string" },
      },
      required: ["id", "title", "summary"],
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      // Use JSON mode + JSON Schema to force parseable output.
      // The Gemini API accepts `responseMimeType` + `responseJsonSchema`.
      // Docs: https://ai.google.dev/api/generate-content
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Gemini translate failed: ${r.status} ${t}`);
  }

  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini translate returned no text");

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Some responses may already be JSON-ish but wrapped in whitespace; try a strict trim.
    parsed = JSON.parse(String(text).trim());
  }

  if (!Array.isArray(parsed)) throw new Error("Gemini translate returned non-array JSON");

  const out: Omit<TranslatedItem, "ok">[] = parsed.map((x: any) => ({
    id: String(x.id),
    title: String(x.title ?? ""),
    summary: String(x.summary ?? ""),
  }));

  // Return in the same order as input.
  const byId = new Map(out.map((o) => [o.id, o]));
  return items.map((it) => {
    const got = byId.get(it.id);
    if (!got) return { id: it.id, title: it.title, summary: it.summary ?? "", ok: false };
    return { id: it.id, title: got.title, summary: got.summary ?? "", ok: true };
  });
}

export async function translateItemBatch(items: TranslatableItem[], targetLang: string): Promise<TranslatedItem[]> {
  if (!isTranslateEnabled()) return items.map((it) => ({ ...it, summary: it.summary ?? "", ok: false }));

  // If the target is English, no work needed.
  if (targetLang === "en") return items.map((it) => ({ ...it, summary: it.summary ?? "", ok: false }));

  const maxItems = Number(process.env.AI_TRANSLATE_BATCH_SIZE || 16);
  const maxChars = Number(process.env.AI_TRANSLATE_MAX_CHARS || 12000);

  const chunks = chunkByBudget(items, maxItems, maxChars);

  const translated: TranslatedItem[] = [];
  for (const chunk of chunks) {
    try {
      const out = await geminiTranslateChunk(chunk, targetLang);
      translated.push(...out);
    } catch (err) {
      console.error("translateItemBatch chunk failed", err);
      translated.push(...chunk.map((it) => ({ id: it.id, title: it.title, summary: it.summary ?? "", ok: false })));
    }
  }
  return translated;
}
