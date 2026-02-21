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

type Kind = "feed" | "ai";

const DIGEST_TTL_MS = 60 * 60 * 1000; // 1 hour

function singleFlightMap(): Map<string, Promise<any>> {
  const g = globalThis as any;
  if (!g.__atlasSingleFlight) g.__atlasSingleFlight = new Map();
  return g.__atlasSingleFlight as Map<string, Promise<any>>;
}

function enabled() {
  return (
    String(process.env.AI_SUMMARY_ENABLED || "false").toLowerCase() === "true" &&
    Boolean(process.env.AI_SUMMARY_API_KEY)
  );
}

function normalizeKind(raw: unknown): Kind {
  const v = String(raw || "feed").toLowerCase();
  return v === "ai" ? "ai" : "feed";
}

function normalizeDays(daysRaw: number): number {
  // Product rule: only 1 or 7 days everywhere (default 1).
  return daysRaw === 1 || daysRaw === 7 ? daysRaw : 1;
}

function aiProviderName(url: string): string | null {
  const u = String(url || "").toLowerCase();
  if (!u) return null;
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
  if (u.includes("github.com") || u.includes("github.blog")) return "GitHub";
  if (u.includes("x.com") || u.includes("twitter.com")) return "X";
  return null;
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
  const days = normalizeDays(Number(body?.days || 1));
  const country = body?.country ? String(body.country).toUpperCase() : null;
  const topic = body?.topic ? String(body.topic).toLowerCase().trim().replace(/\s+/g, "-") : null;
  const lang = body?.lang ? String(body.lang).toLowerCase() : "en";

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: any = { section, createdAt: { gte: since } };

  if (kind === "ai") {
    // AI = items collected by the AI search pipeline.
    where.source = { is: { type: "ai" } };
  } else {
    // Feed = exclude AI + any legacy discovery items.
    where.NOT = [{ source: { is: { type: "ai" } } }, { source: { is: { type: "discovery" } } }];
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

  // Single-flight: if multiple users click at the same time for the same cache key,
  // only one request generates and writes to DB; others await the same result.
  const lockKey = `digest:${key}`;
  const locks = singleFlightMap();
  const existing = locks.get(lockKey);
  if (existing) {
    const payload = await existing;
    const status = typeof payload?._status === "number" ? payload._status : 200;
    if (payload && typeof payload === "object" && "_status" in payload) delete (payload as any)._status;
    return Response.json(payload, { status });
  }

  const p = (async () => {
    // Re-check cache inside the lock to avoid a race.
    const again = await prisma.digest.findUnique({ where: { cacheKey: key } }).catch(() => null);
    if (again && again.createdAt >= cutoff) {
      try {
        const parsed = JSON.parse(again.summary);
        return { ok: true, digest: parsed, cached: true };
      } catch {
        return {
          ok: true,
          digest: { overview: again.summary, themes: [], highlights: [], whyItMatters: [], watchlist: [] },
          cached: true,
        };
      }
    }

    const quota = await enforceAndIncrementAiUsage({ userId, kind: "digest" });
    if (!quota.ok) {
      return { ok: false, error: "Daily AI limit reached", remaining: quota.remaining, _status: 429 };
    }

    let digestJson = "";
    try {
      digestJson = await aiDigest({
        section,
        days,
        country,
        topic,
        lang,
        items: items.map((it) => ({
          title: it.title,
          sourceName: kind === "ai" ? aiProviderName(it.url) || it.source.name : it.source.name,
          url: it.url,
        })),
      });
    } catch (e: any) {
      return { ok: false, error: e?.message || "Digest generation failed", remaining: quota.remaining, _status: 500 };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(digestJson);
    } catch {
      parsed = { overview: digestJson, themes: [], highlights: [], whyItMatters: [], watchlist: [] };
    }

    // Cache only successful generations.
    await prisma.digest
      .upsert({
        where: { cacheKey: key },
        create: { cacheKey: key, section, days, country, topic, summary: digestJson },
        update: { summary: digestJson, section, days, country, topic, createdAt: new Date() },
      })
      .catch(() => null);

    return { ok: true, digest: parsed, cached: false, remaining: quota.remaining };
  })();

  locks.set(lockKey, p);
  try {
    const payload = await p;
    const status = typeof payload?._status === "number" ? payload._status : 200;
    if (payload && typeof payload === "object" && "_status" in payload) delete (payload as any)._status;
    return Response.json(payload, { status });
  } finally {
    locks.delete(lockKey);
  }
}
