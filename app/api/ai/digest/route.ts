import { prisma } from "@/lib/prisma";
import type { Section } from "@/lib/types";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { aiDigest } from "@/lib/aiProviders";
import { enforceAndIncrementAiUsage } from "@/lib/aiQuota";

const ALLOWED_SECTIONS = new Set<Section>([
  "global",
  "tech",
  "innovators",
  "early",
  "creators",
  "universe",
  "history",
  "faith",
]);

type Kind = "feed" | "discovery";

const DIGEST_TTL_MS = 60 * 60 * 1000; // 1 hour

function enabled() {
  return (
    String(process.env.AI_SUMMARY_ENABLED || "false").toLowerCase() === "true" &&
    Boolean(process.env.AI_SUMMARY_API_KEY)
  );
}

function normalizeKind(raw: unknown): Kind {
  const v = String(raw || "feed").toLowerCase();
  return v === "discovery" ? "discovery" : "feed";
}

function normalizeDays(section: Section, daysRaw: number): number {
  // Product rule:
  // - All sections except History: only 1 or 7 days (default 1)
  // - History: only 7 or 30 days (default 7)
  if (section === "history") {
    return daysRaw === 30 || daysRaw === 7 ? daysRaw : 7;
  }
  return daysRaw === 1 || daysRaw === 7 ? daysRaw : 1;
}

function digestCacheKey(
  section: string,
  kind: Kind,
  days: number,
  country: string | null,
  topic: string | null,
  lang: string
) {
  // Stable key; TTL is enforced in DB by createdAt + a scheduled cleanup.
  return `digest:${section}:${kind}:${days}:${country || "*"}:${topic || "*"}:${lang || "en"}`;
}

async function resolveUserIdFromSession(session: any): Promise<string | null> {
  const id = session?.user ? (session.user as any).id : null;
  if (id) return String(id);
  const email = session?.user?.email ? String(session.user.email) : null;
  if (!email) return null;
  const u = await prisma.user.findUnique({ where: { email } }).catch(() => null);
  return u?.id || null;
}

// AI implementation lives in lib/aiProviders.ts (Gemini default)

export async function POST(req: Request) {
  if (!enabled()) return Response.json({ ok: false, error: "AI summary disabled" }, { status: 403 });

  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return Response.json({ ok: false, error: "User id missing" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const secRaw = String(body?.section || "global").toLowerCase();
  const section = (ALLOWED_SECTIONS.has(secRaw as Section) ? secRaw : "global") as Section;
  const kind = normalizeKind(body?.kind);
  const days = normalizeDays(section, Number(body?.days || (section === "history" ? 7 : 1)));
  const country = body?.country ? String(body.country).toUpperCase() : null;
  const topic = body?.topic ? String(body.topic).toLowerCase().trim().replace(/\s+/g, "-") : null;
  const lang = body?.lang ? String(body.lang).toLowerCase() : "en";

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: any = { section, createdAt: { gte: since } };

  if (kind === "discovery") {
    where.source = { is: { type: "discovery" } };
  } else {
    where.NOT = [{ source: { is: { type: "discovery" } } }];
  }

  if (country) where.country = country;
  if (topic) where.topics = { has: topic };

  const items = await prisma.item.findMany({
    where,
    include: { source: true },
    orderBy: [{ createdAt: "desc" }, { score: "desc" }],
    take: 50,
  });

  const key = digestCacheKey(section, kind, days, country, topic, lang);
  const cutoff = new Date(Date.now() - DIGEST_TTL_MS);
  const cached = await prisma.digest.findUnique({ where: { cacheKey: key } }).catch(() => null);
  if (cached && cached.createdAt >= cutoff) {
    try {
      const parsed = JSON.parse(cached.summary);
      return Response.json({ ok: true, digest: parsed, cached: true });
    } catch {
      return Response.json({
        ok: true,
        digest: { overview: cached.summary, themes: [], highlights: [], whyItMatters: [], watchlist: [] },
        cached: true,
      });
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

  let parsed: any;
  try {
    parsed = JSON.parse(digestJson);
  } catch {
    parsed = { overview: digestJson, themes: [], highlights: [], whyItMatters: [], watchlist: [] };
  }

  // Upsert and refresh the TTL by setting createdAt to now.
  await prisma.digest
    .upsert({
      where: { cacheKey: key },
      create: { cacheKey: key, section, days, country, topic, summary: digestJson },
      update: { summary: digestJson, section, days, country, topic, createdAt: new Date() },
    })
    .catch(() => null);

  return Response.json({ ok: true, digest: parsed, cached: false, remaining: quota.remaining });
}
