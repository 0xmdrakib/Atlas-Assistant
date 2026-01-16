/**
 * LibreTranslate-backed translation helpers.
 *
 * Goal: translate feed content WITHOUT using an LLM, to avoid per-request token costs.
 *
 * Configure via env:
 * - TRANSLATE_API_URL   (e.g. https://translate.example.com)
 * - TRANSLATE_API_KEY   (optional; only if your LibreTranslate instance requires it)
 */

type TranslateResponse = {
  translatedText?: string | string[];
  detectedLanguage?: { language?: string; confidence?: number };
};

function normalizeBaseUrl(u: string) {
  return u.replace(/\/+$/, "");
}

export function isTranslateEnabled(): boolean {
  return Boolean(process.env.TRANSLATE_API_URL);
}

async function translateTextsOnce(args: {
  target: string;
  texts: string[];
  source?: string;
  timeoutMs?: number;
}): Promise<string[]> {
  const base = process.env.TRANSLATE_API_URL;
  if (!base) return args.texts;

  const target = String(args.target || "en").toLowerCase();
  const source = String(args.source || "auto").toLowerCase();
  const texts = (args.texts || []).map((t) => String(t ?? ""));

  if (!texts.length) return [];

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(2000, args.timeoutMs ?? 15_000));
  try {
    const url = `${normalizeBaseUrl(base)}/translate`;
    const body: any = {
      q: texts.length === 1 ? texts[0] : texts,
      source,
      target,
      format: "text",
    };
    if (process.env.TRANSLATE_API_KEY) body.api_key = process.env.TRANSLATE_API_KEY;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      // Fail open: return original text so the feed still works.
      return texts;
    }

    const json = (await res.json().catch(() => ({}))) as TranslateResponse;
    const out = json?.translatedText;

    if (Array.isArray(out)) return out.map((x) => String(x ?? ""));
    if (typeof out === "string") return [out];

    return texts;
  } catch {
    return texts;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Translate many short strings safely.
 * LibreTranslate instances may enforce character limits; chunk to reduce failures.
 */
export async function translateTexts(args: {
  target: string;
  texts: string[];
  source?: string;
}): Promise<string[]> {
  const texts = (args.texts || []).map((t) => String(t ?? ""));
  if (!texts.length) return [];

  // Conservative chunking: 20 strings or ~3500 chars per request.
  const chunks: string[][] = [];
  let cur: string[] = [];
  let curChars = 0;
  for (const s of texts) {
    const nextChars = curChars + s.length;
    if (cur.length >= 20 || nextChars >= 3500) {
      if (cur.length) chunks.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(s);
    curChars += s.length;
  }
  if (cur.length) chunks.push(cur);

  const out: string[] = [];
  for (const c of chunks) {
    const translated = await translateTextsOnce({
      target: args.target,
      source: args.source || "auto",
      texts: c,
    });
    out.push(...translated);
  }
  return out;
}

export async function translateItemBatch(args: {
  lang: string;
  items: Array<{ title: string; summary: string }>;
}): Promise<Array<{ title: string; summary: string }>> {
  const items = args.items || [];
  if (!items.length) return [];

  const flat = items.flatMap((it) => [it.title || "", it.summary || ""]);
  const translated = await translateTexts({ target: args.lang, texts: flat, source: "auto" });

  const out: Array<{ title: string; summary: string }> = [];
  for (let i = 0; i < items.length; i++) {
    out.push({
      title: translated[i * 2] ?? items[i].title,
      summary: translated[i * 2 + 1] ?? items[i].summary,
    });
  }
  return out;
}
