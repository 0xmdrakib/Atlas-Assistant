export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { UI_EN, languageByCode } from "@/lib/i18n";
import { isTranslateEnabled } from "@/lib/translateProvider";

function languageForPrompt(lang: string): { label: string; nativeLabel?: string } {
  const L = languageByCode(lang);
  if (!L) return { label: lang };
  return { label: L.label, nativeLabel: L.nativeLabel };
}

async function geminiTranslateUiDict(targetLang: string): Promise<Record<string, string>> {
  const apiKey = process.env.AI_TRANSLATE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing required env var: AI_TRANSLATE_API_KEY (or GEMINI_API_KEY)");

  const model = process.env.AI_TRANSLATE_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  const target = languageForPrompt(targetLang);
  const targetLabel = target.nativeLabel ? `${target.label} (${target.nativeLabel})` : target.label;

  const prompt = [
    `Translate the following UI strings into ${targetLabel}.`,
    `- Keep keys EXACTLY the same. Translate ONLY the values.`,
    `- Preserve punctuation, emoji, and formatting (including ellipses “…”) as natural in the target language.`,
    `- Keep product names / proper nouns (e.g., "Atlas") as-is.`,
    `- Return ONLY valid JSON matching the provided schema.`,
    ``,
    JSON.stringify(UI_EN),
  ].join("\n");

  const schema = {
    type: "object",
    additionalProperties: { type: "string" },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
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
    throw new Error(`Gemini UI translate failed: ${r.status} ${t}`);
  }

  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini UI translate returned no text");

  const parsed = JSON.parse(String(text).trim());
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gemini UI translate returned non-object JSON");
  }

  // Only keep known keys (defense-in-depth).
  const out: Record<string, string> = {};
  for (const k of Object.keys(UI_EN)) {
    const v = (parsed as any)[k];
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return out;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const lang = String(body?.lang || "").trim().toLowerCase();
  if (!lang) return Response.json({ ok: false, error: "Missing lang" }, { status: 400 });

  // Bundled languages (or no key) do not need dynamic translation.
  if (lang === "en" || lang === "bn") return Response.json({ ok: true, lang, strings: {} });
  if (!isTranslateEnabled()) return Response.json({ ok: false, error: "Translation disabled" }, { status: 403 });

  try {
    const strings = await geminiTranslateUiDict(lang);
    return Response.json({ ok: true, lang, strings }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    console.error("ui translate failed", err);
    return Response.json({ ok: false, error: "Translate failed" }, { status: 500 });
  }
}
