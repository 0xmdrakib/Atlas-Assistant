export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ensureTranslationEntitlement } from "@/lib/billing";
import { resolveUserIdFromSession } from "@/lib/sessionUser";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return Response.json({ ok: false, error: "User id missing" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const lang = String(body?.lang || "").trim().toLowerCase();
  if (!lang) return Response.json({ ok: false, error: "Missing lang" }, { status: 400 });

  const entitlement = await ensureTranslationEntitlement({ userId, lang });
  if (!entitlement.ok) {
    const { ok, ...blocked } = entitlement;
    return Response.json(
      { ok: false, ...blocked },
      { status: entitlement.upgradeRequired ? 402 : 429 }
    );
  }

  const { ok, ...allowed } = entitlement;
  return Response.json({ ok: true, ...allowed }, { headers: { "Cache-Control": "no-store" } });
}
