import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PriceBreakdown = {
  amount: string;
  currency: string;
  percentOff: number;
  discountAmount: string;
  finalAmount: string;
};

function centsFromAmount(amount: string): number {
  return Math.max(0, Math.round(Number(amount || 0) * 100));
}

function formatCents(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

export function discountPrice(amount: string, currency: string, percentOff = 0): PriceBreakdown {
  const baseCents = centsFromAmount(amount);
  const pct = Math.max(0, Math.min(100, Math.round(percentOff)));
  const discountCents = Math.floor((baseCents * pct) / 100);
  const finalCents = Math.max(0, baseCents - discountCents);

  return {
    amount: formatCents(baseCents),
    currency,
    percentOff: pct,
    discountAmount: formatCents(discountCents),
    finalAmount: formatCents(finalCents),
  };
}

export async function validateDiscountForUser(args: {
  code: string;
  userId: string;
  amount: string;
  currency: string;
}) {
  const code = String(args.code || "").trim().toUpperCase();
  if (!code) return { ok: false as const, error: "Enter a discount code" };

  const discount = await prisma.discountCode.findUnique({ where: { code } });
  if (!discount || !discount.active) return { ok: false as const, error: "Invalid discount code" };
  if (discount.expiresAt && discount.expiresAt.getTime() <= Date.now()) {
    return { ok: false as const, error: "This discount code has expired" };
  }
  if (discount.maxRedemptions !== null && discount.redeemedCount >= discount.maxRedemptions) {
    return { ok: false as const, error: "This discount code has reached its claim limit" };
  }

  const existing = await prisma.discountRedemption.findUnique({
    where: { discountCodeId_userId: { discountCodeId: discount.id, userId: args.userId } },
    select: { id: true },
  });
  if (existing) return { ok: false as const, error: "You already claimed this discount code" };

  return {
    ok: true as const,
    discount,
    price: discountPrice(args.amount, args.currency, discount.percentOff),
  };
}

export async function claimDiscountForUser(args: {
  code: string;
  userId: string;
  amount: string;
  currency: string;
  paymentSessionId?: string | null;
  status?: string;
}) {
  const code = String(args.code || "").trim().toUpperCase();
  if (!code) return null;

  return prisma.$transaction(async (tx) => {
    const discount = await tx.discountCode.findUnique({ where: { code } });
    if (!discount || !discount.active) throw new Error("Invalid discount code");
    if (discount.expiresAt && discount.expiresAt.getTime() <= Date.now()) throw new Error("This discount code has expired");
    if (discount.maxRedemptions !== null && discount.redeemedCount >= discount.maxRedemptions) {
      throw new Error("This discount code has reached its claim limit");
    }

    const price = discountPrice(args.amount, args.currency, discount.percentOff);
    const redemption = await tx.discountRedemption
      .create({
        data: {
          discountCodeId: discount.id,
          userId: args.userId,
          paymentSessionId: args.paymentSessionId || null,
          percentOff: discount.percentOff,
          status: args.status || "pending",
          redeemedAt: args.status === "redeemed" ? new Date() : null,
        },
      })
      .catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new Error("You already claimed this discount code");
        }
        throw e;
      });

    await tx.discountCode.update({
      where: { id: discount.id },
      data: { redeemedCount: { increment: 1 } },
    });

    return { discount, redemption, price };
  });
}

export async function markDiscountRedemptionRedeemed(paymentSessionId: string) {
  await prisma.discountRedemption.updateMany({
    where: { paymentSessionId, status: "pending" },
    data: { status: "redeemed", redeemedAt: new Date() },
  });
}
