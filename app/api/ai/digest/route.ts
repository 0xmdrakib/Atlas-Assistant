import { prisma } from "@/lib/prisma";
import type { Section } from "@/lib/types";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { aiDigest } from "@/lib/aiProviders";
import { enforceAndIncrementAiUsage } from "@/lib/aiQuota";

function enabled() {
  return (
    String(process.env.AI_SUMMARY_ENABLED || "false").toLowerCase() === "true" &&
    Boolean(process.env.AI_SUMMARY_API_KEY)
  );
}

function digestCacheKey(section: string, days: number, country: string | null, topic: string | null, lang: string) {
  // 30 min buckets so repeated clicks don’t repeatedly spend tokens.
  const bucket = Math.floor(Date.now() / (30 * 60 * 1000));
  return `digest:${section}:${days}:${country || "*"}:${topic || "*"}:${lang || "en"}:${bucket}`;
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

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return Response.json({ ok: false, error: "User id missing" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const section = String(body?.section || "news") as Section;
  const days = Number(body?.days || 7);
  const country = body?.country ? String(body.country).toUpperCase() : null;
  const topic = body?.topic ? String(body.topic).toLowerCase().trim().replace(/\s+/g, "-") : null;
  const lang = body?.lang ? String(body.lang).toLowerCase() : "en";

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where: any = { section };
  if (section === "history") {
    // History is old content; the window means "recently added".
    where.createdAt = { gte: since };
  } else {
    where.publishedAt = { gte: since };
  }
  if (country) where.country = country;
  if (topic) where.topics = { has: topic };

  const items = await prisma.item.findMany({
    where,
    include: { source: true },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: 50,
  });

  const key = digestCacheKey(section, days, country, topic, lang);
  const cached = await prisma.digest.findUnique({ where: { cacheKey: key } }).catch(() => null);
  if (cached) {
    try {
      const parsed = JSON.parse(cached.summary);
      return Response.json({ ok: true, digest: parsed, cached: true });
    } catch {
      return Response.json({ ok: true, digest: { overview: cached.summary, themes: [], highlights: [], whyItMatters: [], watchlist: [] }, cached: true });
    }
  }

  const quota = await enforceAndIncrementAiUsage({ userId, kind: "digest" });
  if (!quota.ok) {
    return Response.json({ ok: false, error: "Daily AI limit reached", remaining: quota.remaining }, { status: 429 });
  }

  const digestJson = await aiDigest({
    section,
    days,
    country,
    topic,
    lang,
    items: items.map((it) => ({ title: it.title, sourceName: it.source.name, url: it.url })),
  });

  const parsed = JSON.parse(digestJson);

  await prisma.digest
    .create({
      data: {
        cacheKey: key,
        section,
        days,
        country,
        topic,
        summary: digestJson,
      },
    })
    .catch(() => null);

  return Response.json({ ok: true, digest: parsed, cached: false, remaining: quota.remaining });
}
