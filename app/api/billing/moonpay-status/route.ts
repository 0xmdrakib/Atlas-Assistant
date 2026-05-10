export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUserIdFromSession } from "@/lib/sessionUser";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return Response.json({ ok: false, error: "User id missing" }, { status: 401 });

  const orderId = req.nextUrl.searchParams.get("orderId") || "";
  if (!orderId) return Response.json({ ok: false, error: "Missing orderId" }, { status: 400 });

  const row = await prisma.paymentSession.findFirst({
    where: { userId, orderId },
    select: { orderId: true, status: true, method: true, createdAt: true, updatedAt: true },
  });

  if (!row) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, session: row }, { headers: { "Cache-Control": "no-store" } });
}
