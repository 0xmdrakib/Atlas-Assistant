import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Admin-only DB reset.
 *
 * Default: deletes content tables (items, digests, translations, ingest runs, AI usage)
 * while keeping Sources + auth tables.
 *
 * Usage:
 *   POST /api/admin/reset?token=ADMIN_TOKEN
 * Optional:
 *   mode=all  -> also deletes Sources (you must re-run source sync afterwards)
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const token =
    url.searchParams.get("token") ||
    req.headers.get("x-admin-token") ||
    req.headers.get("x-admin-key") ||
    "";

  const adminToken = process.env.ADMIN_TOKEN || "";
  if (!token || !adminToken || token !== adminToken) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });
  }

  const mode = String(url.searchParams.get("mode") || "content").toLowerCase();
  const startedAt = new Date();

  // Important delete order:
  // - ItemTranslation -> Item (FK cascade exists, but this keeps clear counts)
  // - Item -> Source (only if mode=all)
  const result = await prisma.$transaction(async (tx) => {
    const digests = await tx.digest.deleteMany({});
    const translations = await tx.itemTranslation.deleteMany({});
    const aiUsage = await tx.aiUsage.deleteMany({});
    const ingestRuns = await tx.ingestRun.deleteMany({});
    const items = await tx.item.deleteMany({});

    let sources = { count: 0 } as { count: number };

    if (mode === "all") {
      sources = await tx.source.deleteMany({});
    } else {
      // Keep sources but reset fetch status so the UI starts "fresh".
      await tx.source.updateMany({
        data: {
          lastFetchedAt: null,
          lastOkAt: null,
          consecutiveFails: 0,
        },
      });
    }

    return {
      digests: digests.count,
      translations: translations.count,
      aiUsage: aiUsage.count,
      ingestRuns: ingestRuns.count,
      items: items.count,
      sources: sources.count,
    };
  });

  return Response.json({
    ok: true,
    mode,
    startedAt: startedAt.toISOString(),
    ...result,
  });
}
