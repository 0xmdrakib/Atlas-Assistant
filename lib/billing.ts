import { prisma } from "@/lib/prisma";

export type PlanName = "free" | "paid";
export type AiCountKind = "digest" | "summary";

const FREE_LIMITS = { summary: 5, digest: 3 } as const;
const PAID_LIMITS = { summary: 20, digest: 10 } as const;
const OWNER_LIMITS = { summary: 999999, digest: 999999 } as const;
const PAID_TRANSLATION_LIMIT = 2;

function normalizeEmail(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

function ownerEmailSet(): Set<string> {
  return new Set(
    String(process.env.OWNER_EMAILS || "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

function isOwnerEmail(email?: string | null): boolean {
  const owners = ownerEmailSet();
  return owners.size > 0 && owners.has(normalizeEmail(email));
}

export function todayUtcKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nextUtcResetIso(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

function addOneMonth(d: Date): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + 1);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

function periodKey(start: Date, end: Date): string {
  return `${start.toISOString()}__${end.toISOString()}`;
}

export async function getPlanForUser(userId: string, now = new Date()): Promise<{
  plan: PlanName;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  isOwner: boolean;
}> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodStart: true,
      subscriptionCurrentPeriodEnd: true,
    },
  });

  if (isOwnerEmail(u?.email)) {
    return {
      plan: "paid",
      status: "owner",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      isOwner: true,
    };
  }

  const active =
    u?.subscriptionPlan === "paid" &&
    u?.subscriptionStatus === "active" &&
    u?.subscriptionCurrentPeriodEnd instanceof Date &&
    u.subscriptionCurrentPeriodEnd.getTime() > now.getTime();

  return {
    plan: active ? "paid" : "free",
    status: u?.subscriptionStatus || "free",
    currentPeriodStart: active ? u?.subscriptionCurrentPeriodStart || null : null,
    currentPeriodEnd: active ? u?.subscriptionCurrentPeriodEnd || null : null,
    isOwner: false,
  };
}

export function limitsForPlan(plan: PlanName) {
  return plan === "paid" ? PAID_LIMITS : FREE_LIMITS;
}

export async function getBillingStatus(userId: string) {
  const now = new Date();
  const planInfo = await getPlanForUser(userId, now);
  const day = todayUtcKey(now);
  const usage = await prisma.aiUsage
    .findUnique({ where: { userId_day: { userId, day } } })
    .catch(() => null);

  const limits = planInfo.isOwner ? OWNER_LIMITS : limitsForPlan(planInfo.plan);
  const translationRows =
    !planInfo.isOwner && planInfo.plan === "paid" && planInfo.currentPeriodStart && planInfo.currentPeriodEnd
      ? await prisma.translationUnlock.findMany({
          where: {
            userId,
            periodKey: periodKey(planInfo.currentPeriodStart, planInfo.currentPeriodEnd),
          },
          select: { lang: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

  return {
    plan: planInfo.plan,
    status: planInfo.status,
    isOwner: planInfo.isOwner,
    currentPeriodStart: planInfo.currentPeriodStart?.toISOString() || null,
    currentPeriodEnd: planInfo.currentPeriodEnd?.toISOString() || null,
    resetAt: nextUtcResetIso(now),
    limits: {
      summary: limits.summary,
      digest: limits.digest,
      paidTranslationLanguages: PAID_TRANSLATION_LIMIT,
    },
    usage: {
      summary: usage?.summaryCount || 0,
      digest: usage?.digestCount || 0,
    },
    remaining: {
      summary: Math.max(0, limits.summary - (usage?.summaryCount || 0)),
      digest: Math.max(0, limits.digest - (usage?.digestCount || 0)),
    },
    translationLanguages: translationRows.map((r) => r.lang),
  };
}

export async function enforceAndIncrementAiUsage(args: {
  userId: string;
  kind: AiCountKind;
}): Promise<
  | { ok: true; remaining: number; limit: number; plan: PlanName; resetAt: string }
  | { ok: false; remaining: number; limit: number; plan: PlanName; resetAt: string; upgradeRequired: boolean }
> {
  const now = new Date();
  const day = todayUtcKey(now);
  const resetAt = nextUtcResetIso(now);
  const planInfo = await getPlanForUser(args.userId, now);
  const limits = limitsForPlan(planInfo.plan);
  const limit = limits[args.kind];

  if (planInfo.isOwner) {
    return {
      ok: true,
      remaining: OWNER_LIMITS[args.kind],
      limit: OWNER_LIMITS[args.kind],
      plan: "paid",
      resetAt,
    };
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.aiUsage.upsert({
      where: { userId_day: { userId: args.userId, day } },
      create: { userId: args.userId, day, digestCount: 0, summaryCount: 0 },
      update: {},
    });

    const current = args.kind === "digest" ? row.digestCount || 0 : row.summaryCount || 0;
    const remaining = Math.max(0, limit - current);

    if (remaining <= 0) {
      return {
        ok: false as const,
        remaining: 0,
        limit,
        plan: planInfo.plan,
        resetAt,
        upgradeRequired: planInfo.plan === "free",
      };
    }

    await tx.aiUsage.update({
      where: { userId_day: { userId: args.userId, day } },
      data: args.kind === "digest" ? { digestCount: { increment: 1 } } : { summaryCount: { increment: 1 } },
    });

    return { ok: true as const, remaining: remaining - 1, limit, plan: planInfo.plan, resetAt };
  });
}

export async function ensureTranslationEntitlement(args: {
  userId: string;
  lang: string;
}): Promise<
  | { ok: true; plan: PlanName; languages: string[]; remaining: number }
  | { ok: false; plan: PlanName; error: string; upgradeRequired: boolean; languages: string[]; remaining: number }
> {
  const lang = String(args.lang || "en").toLowerCase();
  if (!lang || lang === "en") {
    return { ok: true, plan: "free", languages: [], remaining: PAID_TRANSLATION_LIMIT };
  }

  const planInfo = await getPlanForUser(args.userId);
  if (planInfo.isOwner) {
    return { ok: true, plan: "paid", languages: [], remaining: OWNER_LIMITS.summary };
  }

  if (planInfo.plan !== "paid" || !planInfo.currentPeriodStart || !planInfo.currentPeriodEnd) {
    return {
      ok: false,
      plan: "free",
      error: "Subscription required for translation",
      upgradeRequired: true,
      languages: [],
      remaining: 0,
    };
  }

  const key = periodKey(planInfo.currentPeriodStart, planInfo.currentPeriodEnd);
  const existing = await prisma.translationUnlock.findMany({
    where: { userId: args.userId, periodKey: key },
    select: { lang: true },
    orderBy: { createdAt: "asc" },
  });

  const languages = existing.map((x) => x.lang);
  if (languages.includes(lang)) {
    return {
      ok: true,
      plan: "paid",
      languages,
      remaining: Math.max(0, PAID_TRANSLATION_LIMIT - languages.length),
    };
  }

  if (languages.length >= PAID_TRANSLATION_LIMIT) {
    return {
      ok: false,
      plan: "paid",
      error: "Translation language limit reached",
      upgradeRequired: false,
      languages,
      remaining: 0,
    };
  }

  await prisma.translationUnlock
    .create({ data: { userId: args.userId, periodKey: key, lang } })
    .catch(() => null);

  return {
    ok: true,
    plan: "paid",
    languages: [...languages, lang],
    remaining: Math.max(0, PAID_TRANSLATION_LIMIT - languages.length - 1),
  };
}

export async function activatePaidAccess(args: {
  userId: string;
  paymentSessionId?: string | null;
  providerStatus?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  provider?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
}) {
  const now = new Date();
  const start = args.periodStart ? new Date(args.periodStart) : now;
  const rawEnd = args.periodEnd ? new Date(args.periodEnd) : addOneMonth(now);
  const end = Number.isNaN(rawEnd.getTime()) ? addOneMonth(now) : rawEnd;

  await prisma.user.update({
    where: { id: args.userId },
    data: {
      subscriptionPlan: "paid",
      subscriptionStatus: "active",
      subscriptionCurrentPeriodStart: Number.isNaN(start.getTime()) ? now : start,
      subscriptionCurrentPeriodEnd: end,
      subscriptionProvider: args.provider || undefined,
      subscriptionProviderCustomerId: args.providerCustomerId || undefined,
      subscriptionProviderSubscriptionId: args.providerSubscriptionId || undefined,
    },
  });

  if (args.paymentSessionId) {
    await prisma.paymentSession
      .update({
        where: { id: args.paymentSessionId },
        data: { status: args.providerStatus || "finished" },
      })
      .catch(() => null);
  }

  return { currentPeriodStart: Number.isNaN(start.getTime()) ? now : start, currentPeriodEnd: end };
}

export async function updateSubscriptionFromProvider(args: {
  userId: string;
  status: string;
  provider: string;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
}) {
  const normalizedStatus = String(args.status || "free").toLowerCase();
  const active = normalizedStatus === "active" || normalizedStatus === "trialing";
  const start = args.periodStart ? new Date(args.periodStart) : null;
  const end = args.periodEnd ? new Date(args.periodEnd) : null;

  await prisma.user.update({
    where: { id: args.userId },
    data: {
      subscriptionPlan: active ? "paid" : "free",
      subscriptionStatus: normalizedStatus,
      subscriptionCurrentPeriodStart: start && !Number.isNaN(start.getTime()) ? start : undefined,
      subscriptionCurrentPeriodEnd: end && !Number.isNaN(end.getTime()) ? end : undefined,
      subscriptionProvider: args.provider,
      subscriptionProviderCustomerId: args.providerCustomerId || undefined,
      subscriptionProviderSubscriptionId: args.providerSubscriptionId || undefined,
    },
  });
}
