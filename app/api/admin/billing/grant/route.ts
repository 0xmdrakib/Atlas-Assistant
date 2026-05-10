export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOwnerSession } from "@/lib/owner";
import { prisma } from "@/lib/prisma";

function addDays(d: Date, days: number) {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export async function POST(req: Request) {
  const session = await requireOwnerSession();
  if (!session) return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const userId = String(body?.userId || "").trim();
  const days = Math.max(1, Math.min(3650, Math.round(Number(body?.days || 30))));

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    : email
      ? await prisma.user.findUnique({ where: { email }, select: { id: true } })
      : null;

  if (!user) return Response.json({ ok: false, error: "User not found" }, { status: 404 });

  const now = new Date();
  const end = addDays(now, days);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionPlan: "paid",
      subscriptionStatus: "active",
      subscriptionCurrentPeriodStart: now,
      subscriptionCurrentPeriodEnd: end,
      subscriptionProvider: "admin",
      subscriptionProviderCustomerId: null,
      subscriptionProviderSubscriptionId: null,
    },
  });

  return Response.json({ ok: true, userId: user.id, currentPeriodEnd: end.toISOString() });
}
