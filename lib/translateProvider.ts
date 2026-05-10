import { languageByCode } from "@/lib/i18n";
import { OPENAI_MODELS, isOpenAiEnabled, openaiGenerateText } from "@/lib/openaiHttp";

export type TranslatableItem = {
  id: string;
  title: string;
  summary: string;
};

export type TranslatedItem = {
  id: string;
  title: string;
  summary: string;
  ok: boolean;
};

export function isTranslateEnabled(): boolean {
  return isOpenAiEnabled();
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

async function openaiTranslateChunk(items: TranslatableItem[], targetLang: string): Promise<TranslatedItem[]> {
  const target = languageForPrompt(targetLang);
  const targetLabel = target.nativeLabel ? `${target.label} (${target.nativeLabel})` : target.label;

  const payloadItems = items.map((it) => ({
    id: it.id,
    title: it.title,
    summary: it.summary ?? "",
  }));

  const prompt = [
    `Translate the following items into ${targetLabel}.`,
    `Preserve URLs, @handles, #hashtags, numbers, punctuation, and Markdown formatting.`,
    `Keep proper nouns as-is unless there is a standard translation.`,
    `Return only JSON matching the schema.`,
    ``,
    JSON.stringify({ items: payloadItems }),
  ].join("\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            summary: { type: "string" },
          },
          required: ["id", "title", "summary"],
        },
      },
    },
    required: ["items"],
  };

  const text = await openaiGenerateText({
    model: OPENAI_MODELS.translate,
    prompt,
    instructions: "Return only JSON.",
    temperature: 0.2,
    maxOutputTokens: 4096,
    jsonSchema: { name: "atlas_translated_items", schema },
    timeoutMs: 30_000,
    retries: 1,
  });

  const parsed = JSON.parse(String(text).trim());
  const arr = Array.isArray(parsed?.items) ? parsed.items : [];

  const out: Omit<TranslatedItem, "ok">[] = arr.map((x: any) => ({
    id: String(x.id),
    title: String(x.title ?? ""),
    summary: String(x.summary ?? ""),
  }));

  const byId = new Map(out.map((o) => [o.id, o]));
  return items.map((it) => {
    const got = byId.get(it.id);
    if (!got) return { id: it.id, title: it.title, summary: it.summary ?? "", ok: false };
    return { id: it.id, title: got.title, summary: got.summary ?? "", ok: true };
  });
}

export async function translateItemBatch(items: TranslatableItem[], targetLang: string): Promise<TranslatedItem[]> {
  if (!isTranslateEnabled()) return items.map((it) => ({ ...it, summary: it.summary ?? "", ok: false }));
  if (targetLang === "en") return items.map((it) => ({ ...it, summary: it.summary ?? "", ok: false }));

  const maxItems = Number(process.env.AI_TRANSLATE_BATCH_SIZE || 16);
  const maxChars = Number(process.env.AI_TRANSLATE_MAX_CHARS || 12000);
  const chunks = chunkByBudget(items, maxItems, maxChars);

  const translated: TranslatedItem[] = [];
  for (const chunk of chunks) {
    try {
      const out = await openaiTranslateChunk(chunk, targetLang);
      translated.push(...out);
    } catch (err) {
      console.error("translateItemBatch chunk failed", err);
      translated.push(...chunk.map((it) => ({ id: it.id, title: it.title, summary: it.summary ?? "", ok: false })));
    }
  }
  return translated;
}
