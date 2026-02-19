export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Section } from "@/lib/types";
import { isTranslateEnabled, translateItemBatch } from "@/lib/translateProvider";

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

  const afterDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: any = {
    createdAt: { gte: afterDate },
    // AI discovery is disabled: never return AI/discovery sources via the feed API.
    source: { type: { notIn: ["ai", "discovery"] } },
  };
  if (section) where.section = section;

  const raw = await prisma.item.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
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
      const translated = await translateItemBatch(
        missing.map((m) => ({ id: m.id, title: m.title, summary: m.summary })),
        lang
      );

      // Upsert translations (shared cache across users).
      await prisma.$transaction(
        translated.map((t) =>
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

    const withTranslations = items.map((it) => {
      const tr = byItemId.get(it.id);
      if (!tr) return it;
      return { ...it, title: tr.title, summary: tr.summary ?? it.summary };
    });

    return Response.json({
      items: withTranslations,
      meta: {
        updatedAt: new Date().toISOString(),
        translateEnabled: true,
      },
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return Response.json({
    items,
    meta: {
      updatedAt: new Date().toISOString(),
      translateEnabled,
    }
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
