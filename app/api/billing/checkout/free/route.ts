export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { activatePaidAccess } from "@/lib/billing";
import { claimDiscountForUser } from "@/lib/discounts";
import { prisma } from "@/lib/prisma";
import { subscriptionPrice } from "@/lib/paymentProviders";
import { resolveUserIdFromSession } from "@/lib/sessionUser";

function orderId(userId: string) {
  return `atlas_free_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return Response.json({ ok: false, error: "User id missing" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const discountCode = String(body?.discountCode || "").trim();
  const price = subscriptionPrice();
  const oid = orderId(userId);

  const row = await prisma.paymentSession.create({
    data: {
      userId,
      orderId: oid,
      method: "discount",
      status: "pending",
      priceAmount: price.amount,
      priceCurrency: price.currency,
    },
  });

  try {
    const claim = await claimDiscountForUser({
      code: discountCode,
      userId,
      amount: price.amount,
      currency: price.currency,
      paymentSessionId: row.id,
      status: "redeemed",
    });

    if (!claim || claim.price.percentOff < 100) throw new Error("This code does not cover the full price");

    await prisma.paymentSession.update({
      where: { id: row.id },
      data: {
        status: "finished",
        discountCode: claim.discount.code,
        discountPercentOff: claim.discount.percentOff,
        finalPriceAmount: claim.price.finalAmount,
      },
    });

    const access = await activatePaidAccess({
      userId,
      paymentSessionId: row.id,
      providerStatus: "finished",
      provider: "discount",
    });

    return Response.json({ ok: true, orderId: oid, access });
  } catch (e: any) {
    await prisma.paymentSession.update({ where: { id: row.id }, data: { status: "failed" } }).catch(() => null);
    return Response.json({ ok: false, error: e?.message || "Discount activation failed" }, { status: 400 });
  }
}
