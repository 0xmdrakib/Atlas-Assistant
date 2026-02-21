export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Section } from "@/lib/types";
import { isTranslateEnabled, translateItemBatch } from "@/lib/translateProvider";

const AI_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function maybeCleanupAiCaches() {
  // Run at most once per hour per server instance.
  const g = globalThis as any;
  const now = Date.now();
  if (typeof g.__atlasLastCleanupAt === "number" && now - g.__atlasLastCleanupAt < AI_CACHE_TTL_MS) return;
  g.__atlasLastCleanupAt = now;

  const cutoff = new Date(now - AI_CACHE_TTL_MS);

  // Clear stale shared caches so the next click regenerates fresh content.
  await prisma.digest.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => null);
  await prisma.itemTranslation
    .updateMany({ where: { aiSummary: { not: null }, updatedAt: { lt: cutoff } }, data: { aiSummary: null } })
    .catch(() => null);
}

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

function normalizeSection(input: string | null): Section | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (ALLOWED_SECTIONS.has(v as Section)) return v as Section;
  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const lang = (url.searchParams.get("lang") || "en").trim().toLowerCase();
  const section = normalizeSection(url.searchParams.get("section"));
  const days = Math.max(1, Math.min(30, Number(url.searchParams.get("days") || "7")));

  // Keep AI caches aligned with the feed refresh cadence.
  // If your ingest runs hourly, this will also clear AI summaries/digests hourly.
  await maybeCleanupAiCaches();

  const afterDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: any = {
    createdAt: { gte: afterDate },
    // AI discovery is disabled: never return AI/discovery sources via the feed API.
    source: { type: { notIn: ["ai", "discovery"] } },
  };
  if (section) where.section = section;

  const raw = await prisma.item.findMany({
    where,
    // UI label is "collected X ago" (createdAt). Sort by createdAt so newer
    // collected items always appear at the top.
    orderBy: [{ createdAt: "desc" }, { score: "desc" }],
    take: 250,
    select: {
      id: true,
      section: true,
      title: true,
      summary: true,
      aiSummary: true,
      url: true,
      country: true,
      topics: true,
      score: true,
      publishedAt: true,
      createdAt: true,
      source: {
        select: { id: true, name: true, type: true },
      },
    },
  });

  // Shape items for the client (avoid nested objects and always include arrays).
  const items = raw.map((it) => ({
    id: it.id,
    section: it.section as Section,
    title: it.title,
    summary: it.summary,
    aiSummary: it.aiSummary ?? undefined,
    sourceName: it.source?.name || "Unknown",
    url: it.url,
    country: it.country ?? undefined,
    topics: Array.isArray(it.topics) ? it.topics : [],
    publishedAt: it.publishedAt instanceof Date ? it.publishedAt.toISOString() : String(it.publishedAt),
    createdAt: it.createdAt instanceof Date ? it.createdAt.toISOString() : String(it.createdAt),
    score: typeof it.score === "number" ? it.score : Number(it.score || 0),
  }));

  async function attachAiSummaries(list: typeof items, lang: string) {
    const ids = list.map((i) => i.id);
    if (ids.length === 0) return list;

    const trs = await prisma.itemTranslation
      .findMany({
        where: { itemId: { in: ids }, lang },
        select: { itemId: true, aiSummary: true },
      })
      .catch(() => [] as { itemId: string; aiSummary: string | null }[]);

    const byId = new Map(trs.map((t) => [t.itemId, t.aiSummary ?? undefined]));
    return list.map((it) => ({ ...it, aiSummary: byId.get(it.id) ?? it.aiSummary }));
  }

  const translateEnabled = isTranslateEnabled();

  // Apply shared translation cache when requested.
  if (lang !== "en" && translateEnabled) {
    const ids = items.map((i) => i.id);

    const existing = await prisma.itemTranslation.findMany({
      where: { itemId: { in: ids }, lang },
      select: { itemId: true, title: true, summary: true },
    });

    const byItemId = new Map(existing.map((t) => [t.itemId, t]));
    const missing = items.filter((it) => !byItemId.has(it.id));

    if (missing.length > 0) {
      const input = missing.map((m) => ({ id: m.id, title: m.title, summary: m.summary }));
      const inputById = new Map(input.map((x) => [x.id, x]));

      const translated = await translateItemBatch(input, lang);

      // Only cache successful translations. If the model fails and we fall back to English,
      // we DO NOT write anything to the DB so a later request can retry.
      const toUpsert = translated.filter((t) => {
        if (!t.ok) return false;
        const src = inputById.get(t.id);
        if (!src) return false;
        const sameTitle = String(t.title ?? "").trim() === String(src.title ?? "").trim();
        const sameSummary = String(t.summary ?? "").trim() === String(src.summary ?? "").trim();
        return !(sameTitle && sameSummary);
      });

      if (toUpsert.length > 0) {
        // Upsert translations (shared cache across users).
        await prisma.$transaction(
          toUpsert.map((t) =>
            prisma.itemTranslation.upsert({
              where: { itemId_lang: { itemId: t.id, lang } },
              update: { title: t.title, summary: t.summary ?? "" },
              create: { itemId: t.id, lang, title: t.title, summary: t.summary ?? "" },
            })
          )
        );

        // Refresh cache map.
        const again = await prisma.itemTranslation.findMany({
          where: { itemId: { in: ids }, lang },
          select: { itemId: true, title: true, summary: true },
        });
        byItemId.clear();
        for (const t of again) byItemId.set(t.itemId, t);
      }
    }

    const withTranslations = items.map((it) => {
      const tr = byItemId.get(it.id);
      if (!tr) return it;
      return { ...it, title: tr.title, summary: tr.summary ?? it.summary };
    });

    const withAi = await attachAiSummaries(withTranslations, lang);

    return Response.json({
      items: withAi,
      meta: {
        updatedAt: new Date().toISOString(),
        translateEnabled: true,
      },
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const withAi = await attachAiSummaries(items, lang);

  return Response.json({
    items: withAi,
    meta: {
      updatedAt: new Date().toISOString(),
      translateEnabled,
    }
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
