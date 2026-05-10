export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { activatePaidAccess } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

function sortObject(value: any): any {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;

  return Object.keys(value)
    .sort()
    .reduce((acc: any, key) => {
      acc[key] = sortObject(value[key]);
      return acc;
    }, {});
}

function verifyNowpaymentsSignature(body: any, signature: string | null): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;

  const signedPayload = JSON.stringify(sortObject(body));
  const expected = crypto.createHmac("sha512", secret).update(signedPayload).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function stableEventId(body: any): string {
  const paymentId = String(body?.payment_id || body?.invoice_id || body?.purchase_id || body?.order_id || "unknown");
  const status = String(body?.payment_status || body?.status || "unknown");
  const hash = crypto.createHash("sha256").update(JSON.stringify(sortObject(body))).digest("hex").slice(0, 24);
  return `${paymentId}:${status}:${hash}`;
}

function providerStatus(body: any): string {
  return String(body?.payment_status || body?.status || "unknown").toLowerCase();
}

function isSuccessStatus(status: string): boolean {
  return status === "finished" || status === "confirmed";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const sig = req.headers.get("x-nowpayments-sig");
  if (!verifyNowpaymentsSignature(body, sig)) {
    return Response.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  const eventId = stableEventId(body);
  const paymentId = body?.payment_id ? String(body.payment_id) : null;
  const purchaseId = body?.purchase_id ? String(body.purchase_id) : null;
  const invoiceId = body?.invoice_id ? String(body.invoice_id) : null;
  const orderId = body?.order_id ? String(body.order_id) : null;
  const status = providerStatus(body);

  try {
    await prisma.paymentEvent.create({
      data: {
        provider: "nowpayments",
        eventId,
        paymentId,
        orderId,
        status,
        raw: body,
      },
    });
  } catch (e: any) {
    if (e?.code === "P2002") return Response.json({ ok: true, duplicate: true });
    throw e;
  }

  const candidates = [
    paymentId ? { nowpaymentsPaymentId: paymentId } : undefined,
    purchaseId ? { nowpaymentsPurchaseId: purchaseId } : undefined,
    invoiceId ? { nowpaymentsInvoiceId: invoiceId } : undefined,
    orderId ? { orderId } : undefined,
  ].filter(Boolean) as any[];

  if (candidates.length === 0) {
    return Response.json({ ok: true, matched: false });
  }

  const session = await prisma.paymentSession.findFirst({ where: { OR: candidates } });

  if (!session) {
    return Response.json({ ok: true, matched: false });
  }

  await prisma.paymentSession.update({
    where: { id: session.id },
    data: {
      status,
      nowpaymentsPaymentId: paymentId || session.nowpaymentsPaymentId,
      nowpaymentsPurchaseId: purchaseId || session.nowpaymentsPurchaseId,
      payAddress: body?.pay_address ? String(body.pay_address) : session.payAddress,
      payAmount: body?.pay_amount ? String(body.pay_amount) : session.payAmount,
      payCurrency: body?.pay_currency ? String(body.pay_currency).toLowerCase() : session.payCurrency,
      rawProviderData: body,
    },
  });

  const alreadyActivated = session.status === "finished" || session.status === "confirmed";
  if (isSuccessStatus(status) && !alreadyActivated) {
    await activatePaidAccess({
      userId: session.userId,
      paymentSessionId: session.id,
      providerStatus: status,
    });
  }

  return Response.json({ ok: true, matched: true, status });
}
