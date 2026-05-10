export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOwnerSession } from "@/lib/owner";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await requireOwnerSession();
  if (!session) return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = String(body?.code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const percentOff = Math.max(1, Math.min(100, Math.round(Number(body?.percentOff || 0))));
  const maxRedemptionsRaw = String(body?.maxRedemptions || "").trim();
  const maxRedemptions = maxRedemptionsRaw ? Math.max(1, Math.round(Number(maxRedemptionsRaw))) : null;
  const expiresAtRaw = String(body?.expiresAt || "").trim();
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

  if (!code) return Response.json({ ok: false, error: "Code is required" }, { status: 400 });
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return Response.json({ ok: false, error: "Invalid expiry date" }, { status: 400 });
  }

  const discount = await prisma.discountCode.create({
    data: {
      code,
      percentOff,
      maxRedemptions,
      expiresAt,
      active: body?.active === false ? false : true,
    },
  });

  return Response.json({ ok: true, discount });
}

export async function PATCH(req: Request) {
  const session = await requireOwnerSession();
  if (!session) return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id || "").trim();
  if (!id) return Response.json({ ok: false, error: "Discount id is required" }, { status: 400 });

  const discount = await prisma.discountCode.update({
    where: { id },
    data: { active: Boolean(body?.active) },
  });

  return Response.json({ ok: true, discount });
}
