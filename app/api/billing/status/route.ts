export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getBillingStatus } from "@/lib/billing";
import { resolveUserIdFromSession } from "@/lib/sessionUser";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({
      ok: true,
      authed: false,
      plan: "free",
      status: "free",
      limits: { summary: 5, digest: 3, paidTranslationLanguages: 2 },
      usage: { summary: 0, digest: 0 },
      remaining: { summary: 5, digest: 3 },
      translationLanguages: [],
    });
  }

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return Response.json({ ok: false, error: "User id missing" }, { status: 401 });

  const status = await getBillingStatus(userId);
  return Response.json({ ok: true, authed: true, ...status }, { headers: { "Cache-Control": "no-store" } });
}
