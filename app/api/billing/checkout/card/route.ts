export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { claimDiscountForUser } from "@/lib/discounts";
import { prisma } from "@/lib/prisma";
import { cardPaymentEnabled, createPaddleCheckoutTransaction, subscriptionPrice } from "@/lib/paymentProviders";
import { resolveUserIdFromSession } from "@/lib/sessionUser";

function orderId(userId: string) {
  return `atlas_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  if (!cardPaymentEnabled()) {
    return Response.json({ ok: false, error: "Card payment is not configured" }, { status: 503 });
  }

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
      method: "card",
      status: "pending",
      priceAmount: price.amount,
      priceCurrency: price.currency,
    },
  });

  try {
    const claim = discountCode
      ? await claimDiscountForUser({
          code: discountCode,
          userId,
          amount: price.amount,
          currency: price.currency,
          paymentSessionId: row.id,
          status: "pending",
        })
      : null;

    if (claim?.price.percentOff === 100) {
      throw new Error("Use free activation for a 100% discount code");
    }

    const transaction = await createPaddleCheckoutTransaction({
      orderId: oid,
      paymentSessionId: row.id,
      userId,
      userEmail: session.user?.email || null,
      discountCode: claim?.discount.code || null,
      discountPercentOff: claim?.discount.percentOff || null,
    });

    const data = transaction?.data || {};
    const checkoutUrl = data?.checkout?.url ? String(data.checkout.url) : "";
    if (!checkoutUrl) throw new Error("Paddle did not return a checkout URL");

    await prisma.paymentSession.update({
      where: { id: row.id },
      data: {
        paddleTransactionId: data?.id ? String(data.id) : null,
        paddleSubscriptionId: data?.subscription_id ? String(data.subscription_id) : null,
        checkoutUrl,
        discountCode: claim?.discount.code || null,
        discountPercentOff: claim?.discount.percentOff || null,
        finalPriceAmount: claim?.price.finalAmount || price.amount,
        rawProviderData: transaction,
      },
    });

    return Response.json({ ok: true, url: checkoutUrl, orderId: oid });
  } catch (e: any) {
    await prisma.paymentSession.update({ where: { id: row.id }, data: { status: "failed" } }).catch(() => null);
    return Response.json({ ok: false, error: e?.message || "Card checkout failed" }, { status: 500 });
  }
}
