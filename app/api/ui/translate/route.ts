export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ensureTranslationEntitlement } from "@/lib/billing";
import { UI_EN, languageByCode } from "@/lib/i18n";
import { OPENAI_MODELS, openaiGenerateText } from "@/lib/openaiHttp";
import { resolveUserIdFromSession } from "@/lib/sessionUser";
import { isTranslateEnabled } from "@/lib/translateProvider";

function languageForPrompt(lang: string): { label: string; nativeLabel?: string } {
  const L = languageByCode(lang);
  if (!L) return { label: lang };
  return { label: L.label, nativeLabel: L.nativeLabel };
}

async function openaiTranslateUiDict(targetLang: string): Promise<Record<string, string>> {
  const target = languageForPrompt(targetLang);
  const targetLabel = target.nativeLabel ? `${target.label} (${target.nativeLabel})` : target.label;

  const prompt = [
    `Translate the following UI strings into ${targetLabel}.`,
    `Keep keys exactly the same. Translate only values.`,
    `Preserve punctuation and formatting naturally in the target language.`,
    `Keep product names and proper nouns, such as "Atlas", as-is.`,
    ``,
    JSON.stringify({ strings: UI_EN }),
  ].join("\n");

  const uiKeys = Object.keys(UI_EN);
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      strings: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(uiKeys.map((k) => [k, { type: "string" }])),
        required: uiKeys,
      },
    },
    required: ["strings"],
  };

  const text = await openaiGenerateText({
    model: OPENAI_MODELS.translate,
    prompt,
    instructions: "Return only JSON.",
    temperature: 0.2,
    maxOutputTokens: 4096,
    jsonSchema: { name: "atlas_ui_translation", schema },
    timeoutMs: 25_000,
    retries: 1,
  });

  const parsed = JSON.parse(String(text).trim());
  const dict = parsed?.strings;
  if (!dict || typeof dict !== "object" || Array.isArray(dict)) {
    throw new Error("UI translate returned non-object JSON");
  }

  const out: Record<string, string> = {};
  for (const k of Object.keys(UI_EN)) {
    const v = (dict as any)[k];
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return out;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const lang = String(body?.lang || "").trim().toLowerCase();
  if (!lang) return Response.json({ ok: false, error: "Missing lang" }, { status: 400 });

  if (lang === "en" || lang === "bn") return Response.json({ ok: true, lang, strings: {} });
  if (!isTranslateEnabled()) return Response.json({ ok: false, error: "Translation disabled" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const userId = await resolveUserIdFromSession(session);
  if (!userId) return Response.json({ ok: false, error: "User id missing" }, { status: 401 });

  const entitlement = await ensureTranslationEntitlement({ userId, lang });
  if (!entitlement.ok) {
    const { ok, ...blocked } = entitlement;
    return Response.json(
      { ok: false, ...blocked },
      { status: entitlement.upgradeRequired ? 402 : 429 }
    );
  }

  try {
    const strings = await openaiTranslateUiDict(lang);
    return Response.json({ ok: true, lang, strings }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    console.error("ui translate failed", err);
    return Response.json({ ok: false, error: "Translate failed" }, { status: 500 });
  }
}
