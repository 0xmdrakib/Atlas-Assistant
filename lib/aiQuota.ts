import { prisma } from "@/lib/prisma";

export type AiCountKind = "digest" | "summary";

function todayUtcKey(d = new Date()): string {
  // YYYY-MM-DD in UTC
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dailyLimitTotal(): number {
  const raw = Number(process.env.AI_DAILY_LIMIT_TOTAL || "100");
  return Number.isFinite(raw) && raw > 0 ? raw : 100;
}

/**
 * Enforce + increment the caller's daily AI limit.
 * NOTE: Translation is intentionally NOT counted here.
 */
export async function enforceAndIncrementAiUsage(args: {
  userId: string;
  kind: AiCountKind;
}): Promise<{ ok: true; remaining: number } | { ok: false; remaining: number }>
{
  const day = todayUtcKey();
  const limit = dailyLimitTotal();

  return prisma.$transaction(async (tx) => {
    const row = await tx.aiUsage.upsert({
      where: { userId_day: { userId: args.userId, day } },
      create: { userId: args.userId, day, digestCount: 0, summaryCount: 0 },
      update: {},
    });

    const total = (row.digestCount || 0) + (row.summaryCount || 0);
    const remaining = Math.max(0, limit - total);

    if (remaining <= 0) {
      return { ok: false as const, remaining: 0 };
    }

    await tx.aiUsage.update({
      where: { userId_day: { userId: args.userId, day } },
      data: args.kind === "digest" ? { digestCount: { increment: 1 } } : { summaryCount: { increment: 1 } },
    });

    return { ok: true as const, remaining: remaining - 1 };
  });
}
