import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { aiSummarizeItem, aiTranslateBatch } from "@/lib/aiProviders";
import { enforceAndIncrementAiUsage } from "@/lib/aiQuota";

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

  // English uses Item.aiSummary (single cache)
  if (lang === "en") {
    if (item.aiSummary) return Response.json({ ok: true, aiSummary: item.aiSummary, cached: true });
    const quota = await enforceAndIncrementAiUsage({ userId, kind: "summary" });
    if (!quota.ok) {
      return Response.json({ ok: false, error: "Daily AI limit reached", remaining: quota.remaining }, { status: 429 });
    }
    const ai = await aiSummarizeItem({ title: item.title, snippet: item.summary, url: item.url, lang: "en" });
    await prisma.item.update({ where: { id }, data: { aiSummary: ai } });
    return Response.json({ ok: true, aiSummary: ai, cached: false, remaining: quota.remaining });
  }

  // Non-English caches in ItemTranslation (login-gated)
  let tr = await prisma.itemTranslation.findUnique({ where: { itemId_lang: { itemId: id, lang } } }).catch(() => null);
  if (!tr) {
    const translated = await aiTranslateBatch({ lang, items: [{ title: item.title, summary: item.summary }] });
    const t0 = translated?.[0] || { title: item.title, summary: item.summary };
    tr = await prisma.itemTranslation.create({
      data: { itemId: id, lang, title: t0.title, summary: t0.summary },
    });
  }

  if (tr.aiSummary) return Response.json({ ok: true, aiSummary: tr.aiSummary, cached: true });

  const quota = await enforceAndIncrementAiUsage({ userId, kind: "summary" });
  if (!quota.ok) {
    return Response.json({ ok: false, error: "Daily AI limit reached", remaining: quota.remaining }, { status: 429 });
  }

  const ai = await aiSummarizeItem({ title: tr.title, snippet: tr.summary, url: item.url, lang });
  await prisma.itemTranslation.update({ where: { itemId_lang: { itemId: id, lang } }, data: { aiSummary: ai } });

  return Response.json({ ok: true, aiSummary: ai, cached: false, remaining: quota.remaining });
}
