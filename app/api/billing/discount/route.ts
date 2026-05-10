export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { resolveUserIdFromSession } from "@/lib/sessionUser";
import { subscriptionPrice } from "@/lib/paymentProviders";
import { validateDiscountForUser } from "@/lib/discounts";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return Response.json({ ok: false, error: "User id missing" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = String(body?.code || "").trim();
  const price = subscriptionPrice();
  const result = await validateDiscountForUser({ code, userId, amount: price.amount, currency: price.currency });

  if (!result.ok) return Response.json(result, { status: 400 });

  return Response.json({
    ok: true,
    code: result.discount.code,
    percentOff: result.discount.percentOff,
    price: result.price,
  });
}
