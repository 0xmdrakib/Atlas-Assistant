export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPaddleCheckoutTransaction, subscriptionPrice } from "@/lib/paymentProviders";
import { resolveUserIdFromSession } from "@/lib/sessionUser";

function orderId(userId: string) {
  return `atlas_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return Response.json({ ok: false, error: "User id missing" }, { status: 401 });

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
    const transaction = await createPaddleCheckoutTransaction({
      orderId: oid,
      paymentSessionId: row.id,
      userId,
      userEmail: session.user?.email || null,
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
        rawProviderData: transaction,
      },
    });

    return Response.json({ ok: true, url: checkoutUrl, orderId: oid });
  } catch (e: any) {
    await prisma.paymentSession.update({ where: { id: row.id }, data: { status: "failed" } }).catch(() => null);
    return Response.json({ ok: false, error: e?.message || "Card checkout failed" }, { status: 500 });
  }
}
