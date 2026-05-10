export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { activatePaidAccess, updateSubscriptionFromProvider } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

function parseSignatureHeader(header: string | null): { ts: string; h1: string[] } | null {
  if (!header) return null;
  const parts = header.split(";").map((part) => part.trim());
  const ts = parts.find((part) => part.startsWith("ts="))?.slice(3) || "";
  const h1 = parts.filter((part) => part.startsWith("h1=")).map((part) => part.slice(3)).filter(Boolean);
  if (!ts || h1.length === 0) return null;
  return { ts, h1 };
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyPaddleSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return false;

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const toleranceSeconds = Number(process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS || 300);
  const timestamp = Number(parsed.ts);
  if (!Number.isFinite(timestamp)) return false;
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${parsed.ts}:${rawBody}`).digest("hex");
  return parsed.h1.some((sig) => safeEqualHex(expected, sig));
}

function customData(data: any): Record<string, any> {
  return data?.custom_data && typeof data.custom_data === "object" ? data.custom_data : {};
}

function billingPeriod(data: any) {
  const period = data?.current_billing_period || data?.billing_period || null;
  return {
    start: period?.starts_at ? String(period.starts_at) : null,
    end: period?.ends_at ? String(period.ends_at) : null,
  };
}

async function findUserIdForPaddleData(data: any): Promise<string | null> {
  const meta = customData(data);
  if (typeof meta.userId === "string" && meta.userId) return meta.userId;

  const subscriptionId = data?.subscription_id || data?.id;
  if (subscriptionId) {
    const user = await prisma.user.findFirst({
      where: { subscriptionProvider: "paddle", subscriptionProviderSubscriptionId: String(subscriptionId) },
      select: { id: true },
    });
    if (user?.id) return user.id;
  }

  const transactionId = data?.id ? String(data.id) : "";
  if (transactionId.startsWith("txn_")) {
    const session = await prisma.paymentSession.findFirst({
      where: { paddleTransactionId: transactionId },
      select: { userId: true },
    });
    if (session?.userId) return session.userId;
  }

  return null;
}

async function updatePaymentSessionForTransaction(eventType: string, data: any, raw: any) {
  const meta = customData(data);
  const transactionId = data?.id ? String(data.id) : null;
  const orderId = typeof meta.orderId === "string" ? meta.orderId : null;
  const paymentSessionId = typeof meta.paymentSessionId === "string" ? meta.paymentSessionId : null;
  const subscriptionId = data?.subscription_id ? String(data.subscription_id) : null;

  const where =
    paymentSessionId ? { id: paymentSessionId } : transactionId ? { paddleTransactionId: transactionId } : orderId ? { orderId } : null;

  if (!where) return null;

  return prisma.paymentSession
    .update({
      where: where as any,
      data: {
        status: String(data?.status || eventType),
        paddleTransactionId: transactionId,
        paddleSubscriptionId: subscriptionId,
        rawProviderData: raw,
      },
    })
    .catch(() => null);
}

async function handleTransactionCompleted(body: any) {
  const data = body?.data || {};
  const session = await updatePaymentSessionForTransaction("transaction.completed", data, body);
  const userId = session?.userId || (await findUserIdForPaddleData(data));
  if (!userId) return;

  const period = billingPeriod(data);
  await activatePaidAccess({
    userId,
    paymentSessionId: session?.id || null,
    providerStatus: "completed",
    periodStart: period.start,
    periodEnd: period.end,
    provider: "paddle",
    providerCustomerId: data?.customer_id ? String(data.customer_id) : null,
    providerSubscriptionId: data?.subscription_id ? String(data.subscription_id) : null,
  });
}

async function handleSubscriptionEvent(eventType: string, body: any) {
  const data = body?.data || {};
  const userId = await findUserIdForPaddleData(data);
  if (!userId) return;

  const period = billingPeriod(data);
  await updateSubscriptionFromProvider({
    userId,
    status: data?.status ? String(data.status) : eventType.split(".")[1] || "updated",
    provider: "paddle",
    providerCustomerId: data?.customer_id ? String(data.customer_id) : null,
    providerSubscriptionId: data?.id ? String(data.id) : null,
    periodStart: period.start,
    periodEnd: period.end,
  });

  if (data?.id) {
    await prisma.paymentSession
      .updateMany({
        where: { userId, method: "card", paddleSubscriptionId: null },
        data: { paddleSubscriptionId: String(data.id) },
      })
      .catch(() => null);
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyPaddleSignature(rawBody, req.headers.get("paddle-signature"))) {
    return Response.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody || "{}");
  const eventId = String(body?.event_id || "");
  const eventType = String(body?.event_type || "");
  if (!eventId || !eventType) {
    return Response.json({ ok: false, error: "Invalid Paddle event" }, { status: 400 });
  }

  try {
    await prisma.paymentEvent.create({
      data: {
        provider: "paddle",
        eventId,
        paymentId: body?.data?.id ? String(body.data.id) : null,
        orderId: customData(body?.data)?.orderId ? String(customData(body.data).orderId) : null,
        status: eventType,
        raw: body,
      },
    });
  } catch (e: any) {
    if (e?.code === "P2002") return Response.json({ ok: true, duplicate: true });
    throw e;
  }

  if (eventType === "transaction.completed") {
    await handleTransactionCompleted(body);
  } else if (eventType.startsWith("subscription.")) {
    await handleSubscriptionEvent(eventType, body);
  } else if (eventType.startsWith("transaction.")) {
    await updatePaymentSessionForTransaction(eventType, body?.data || {}, body);
  }

  return Response.json({ ok: true, eventType });
}
