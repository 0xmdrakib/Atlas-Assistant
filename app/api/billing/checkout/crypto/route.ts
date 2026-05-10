export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNowpaymentsInvoice, subscriptionPrice } from "@/lib/paymentProviders";
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
      method: "crypto",
      status: "pending",
      priceAmount: price.amount,
      priceCurrency: price.currency,
    },
  });

  try {
    const invoice = await createNowpaymentsInvoice({
      orderId: oid,
      userEmail: session.user?.email || null,
    });

    await prisma.paymentSession.update({
      where: { id: row.id },
      data: {
        nowpaymentsInvoiceId: invoice?.id ? String(invoice.id) : null,
        invoiceUrl: invoice?.invoice_url ? String(invoice.invoice_url) : null,
        rawProviderData: invoice,
      },
    });

    const url = invoice?.invoice_url ? String(invoice.invoice_url) : "";
    if (!url) throw new Error("NOWPayments did not return an invoice URL");
    return Response.json({ ok: true, url, orderId: oid });
  } catch (e: any) {
    await prisma.paymentSession.update({ where: { id: row.id }, data: { status: "failed" } }).catch(() => null);
    return Response.json({ ok: false, error: e?.message || "Checkout failed" }, { status: 500 });
  }
}
