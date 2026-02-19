import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { aiSummarizeItem } from "@/lib/aiProviders";
import { enforceAndIncrementAiUsage } from "@/lib/aiQuota";
import { isTranslateEnabled, translateItemBatch } from "@/lib/translateProvider";

const SUMMARY_TTL_MS = 60 * 60 * 1000; // 1 hour

function enabled() {
  return String(process.env.AI_SUMMARY_ENABLED || "false").toLowerCase() === "true" && Boolean(process.env.AI_SUMMARY_API_KEY);
}

async function resolveUserIdFromSession(session: any): Promise<string | null> {
  const id = session?.user ? (session.user as any).id : null;
  if (id) return String(id);
  const email = session?.user?.email ? String(session.user.email) : null;
  if (!email) return null;
  const u = await prisma.user.findUnique({ where: { email } }).catch(() => null);
  return u?.id || null;
}

// AI implementation lives in lib/aiProviders.ts (Gemini default, OpenAI optional)

export async function POST(req: Request) {
  if (!enabled()) return Response.json({ ok: false, error: "AI summary disabled" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = body?.id ? String(body.id) : "";
  const lang = body?.lang ? String(body.lang).toLowerCase() : "en";
  if (!id) return Response.json({ ok: false, error: "Missing id" }, { status: 400 });

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  const userId = await resolveUserIdFromSession(session);
  if (!userId) return Response.json({ ok: false, error: "User id missing" }, { status: 401 });

  const cutoff = new Date(Date.now() - SUMMARY_TTL_MS);

  // Cache (per language) lives in ItemTranslation so we can enforce a 1h TTL uniformly.
  let tr = await prisma.itemTranslation
    .findUnique({ where: { itemId_lang: { itemId: id, lang } } })
    .catch(() => null);

  if (!tr) {
    if (lang === "en") {
      // Create a minimal row so English summaries also use the 1h TTL cache.
      // If legacy Item.aiSummary exists, migrate it into the translation row once.
      tr = await prisma.itemTranslation
        .create({
          data: {
            itemId: id,
            lang: "en",
            title: item.title,
            summary: item.summary,
            aiSummary: item.aiSummary ?? null,
          },
        })
        .catch(() => null);
    } else if (isTranslateEnabled()) {
      // translateItemBatch signature is (items, targetLang)
      const translated = await translateItemBatch([{ id: item.id, title: item.title, summary: item.summary }], lang);
      const t0 = translated?.[0] || { id: item.id, title: item.title, summary: item.summary };
      tr = await prisma.itemTranslation
        .create({ data: { itemId: id, lang, title: t0.title, summary: t0.summary } })
        .catch(() => null);
    } else {
      // Translation server not configured; still allow summaries in the requested language.
      tr = await prisma.itemTranslation
        .create({ data: { itemId: id, lang, title: item.title, summary: item.summary } })
        .catch(() => null);
    }
  }

  if (tr?.aiSummary && tr.updatedAt >= cutoff) {
    return Response.json({ ok: true, aiSummary: tr.aiSummary, cached: true });
  }

  const quota = await enforceAndIncrementAiUsage({ userId, kind: "summary" });
  if (!quota.ok) {
    return Response.json({ ok: false, error: "Daily AI limit reached", remaining: quota.remaining }, { status: 429 });
  }

  const ai = await aiSummarizeItem({ title: tr?.title || item.title, snippet: tr?.summary || item.summary, url: item.url, lang });
  await prisma.itemTranslation
    .upsert({
      where: { itemId_lang: { itemId: id, lang } },
      create: {
        itemId: id,
        lang,
        title: tr?.title || item.title,
        summary: tr?.summary || item.summary,
        aiSummary: ai,
      },
      update: { aiSummary: ai },
    })
    .catch(() => null);

  return Response.json({ ok: true, aiSummary: ai, cached: false, remaining: quota.remaining });
}
