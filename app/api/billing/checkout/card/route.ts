export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildSignedMoonpayUrl,
  createNowpaymentsDirectPayment,
  subscriptionPrice,
} from "@/lib/paymentProviders";
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
    const payment = await createNowpaymentsDirectPayment({
      orderId: oid,
      userEmail: session.user?.email || null,
    });

    const payAddress = payment?.pay_address ? String(payment.pay_address) : "";
    const payAmount = payment?.pay_amount ? String(payment.pay_amount) : "";
    if (!payAddress || !payAmount) {
      throw new Error("NOWPayments did not return a deposit address and amount");
    }

    const moonpayUrl = buildSignedMoonpayUrl({
      walletAddress: payAddress,
      quoteCurrencyAmount: payAmount,
      orderId: oid,
      userEmail: session.user?.email || null,
      currencyCode: payment?.pay_currency ? String(payment.pay_currency) : null,
    });

    await prisma.paymentSession.update({
      where: { id: row.id },
      data: {
        nowpaymentsPaymentId: payment?.payment_id ? String(payment.payment_id) : null,
        nowpaymentsPurchaseId: payment?.purchase_id ? String(payment.purchase_id) : null,
        payAddress,
        payAmount,
        payCurrency: payment?.pay_currency ? String(payment.pay_currency).toLowerCase() : null,
        moonpayUrl,
        rawProviderData: payment,
      },
    });

    return Response.json({ ok: true, url: moonpayUrl, orderId: oid });
  } catch (e: any) {
    await prisma.paymentSession.update({ where: { id: row.id }, data: { status: "failed" } }).catch(() => null);
    return Response.json({ ok: false, error: e?.message || "Card bridge failed" }, { status: 500 });
  }
}
