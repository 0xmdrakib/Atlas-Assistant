import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Section } from "@/lib/types";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { isTranslateEnabled, translateItemBatch } from "@/lib/translateProvider";
const ALLOWED_SECTIONS = new Set<Section>(["global","tech","innovators","early","creators","universe","history","faith"]);

function normalizeDays(section: Section, daysRaw: number): number {
  // Product rule:
  // - All sections except History: only 1 or 7 days (default 1)
  // - History: only 7 or 30 days (default 7)
  if (section === "history") {
    return daysRaw === 30 || daysRaw === 7 ? daysRaw : 7;
  }
  return daysRaw === 1 || daysRaw === 7 ? daysRaw : 1;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secRaw = String(searchParams.get("section") || "global").toLowerCase();
  const section = (ALLOWED_SECTIONS.has(secRaw as Section) ? secRaw : "global") as Section;
  const country = (searchParams.get("country") || "").trim().toUpperCase();
  const topic = (searchParams.get("topic") || "").trim().toLowerCase();
  const daysRaw = Number(searchParams.get("days") || (section === "history" ? "7" : "1"));
  const days = normalizeDays(section, daysRaw);
  const lang = String(searchParams.get("lang") || "en").toLowerCase();

  // Window logic (important):
  // - For most sections, "1/7/30 days" means publish time.
  // - For History, we allow old events but the window means "added recently" (createdAt),
  //   otherwise History would go empty because its publishedAt can be years old.
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where: any = { section };

  if (section === "history") {
    // History = curated old knowledge, window is "recently added".
    where.createdAt = { gte: since };
  } else {
    // Everything else = window by publishedAt.
    where.publishedAt = { gte: since };
  }

  if (country) where.country = country;
  if (topic) where.topics = { has: topic.replace(/\s+/g, "-") };

  const items = await prisma.item.findMany({
    where,
    include: {
      source: true,
      // Pull the translation row for the requested language so we can surface cached AI summaries.
      translations: {
        where: { lang },
        select: { title: true, summary: true, aiSummary: true },
      },
    },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: 50,
  });

  // Translation is optional and only runs when:
  // - lang != en
  // - user is signed in (to prevent abuse)
  // - a LibreTranslate endpoint is configured
  let requiresLogin = false;
  let translateEnabled = false;
  let translated: Record<string, { title: string; summary: string }> = {};

  if (lang !== "en") {
    const session = await getServerSession(authOptions);
    if (!session) {
      requiresLogin = true;
    } else if (isTranslateEnabled()) {
      translateEnabled = true;
      const ids = items.map((it) => it.id);
      const existing = await prisma.itemTranslation.findMany({
        where: { lang, itemId: { in: ids } },
      });
      for (const e of existing) {
        translated[e.itemId] = { title: e.title, summary: e.summary };
      }

      const missing = items
        .filter((it) => !translated[it.id])
        .slice(0, 12);

      if (missing.length) {
        const out = await translateItemBatch({
          lang,
          items: missing.map((m) => ({ title: m.title, summary: m.summary })),
        });

        await Promise.all(
          missing.map((m, idx) => {
            const t = out?.[idx] || { title: m.title, summary: m.summary };
            translated[m.id] = { title: t.title, summary: t.summary };
            return prisma.itemTranslation.upsert({
              where: { itemId_lang: { itemId: m.id, lang } },
              create: { itemId: m.id, lang, title: t.title, summary: t.summary },
              update: { title: t.title, summary: t.summary },
            });
          })
        ).catch(() => null);
      }
    }
  }

  return Response.json({
    items: items.map((it) => {
      const tr = it.translations?.[0] as { title: string; summary: string; aiSummary: string | null } | undefined;
      return {
      id: it.id,
      section: it.section,
      title: translated[it.id]?.title || it.title,
      summary: translated[it.id]?.summary || it.summary,
      // AI summaries are cached per-language in ItemTranslation.
      aiSummary: tr?.aiSummary ?? undefined,
      sourceName: it.source.name,
      url: it.url,
      country: it.country ?? undefined,
      topics: it.topics,
      score: it.score,
      publishedAt: it.publishedAt.toISOString(),
      };
    }),
    meta: { section, days, count: items.length, lang, requiresLogin, translateEnabled },
  });
}
