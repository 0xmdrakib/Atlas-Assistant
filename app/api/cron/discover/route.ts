import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { discoverOnce } from "@/lib/discovery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function getSigningKeys() {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  return { currentSigningKey, nextSigningKey };
}

function receiverOrErrorResponse() {
  const { currentSigningKey, nextSigningKey } = getSigningKeys();
  const missing: string[] = [];
  if (!currentSigningKey) missing.push("QSTASH_CURRENT_SIGNING_KEY");
  if (!nextSigningKey) missing.push("QSTASH_NEXT_SIGNING_KEY");

  if (!currentSigningKey || !nextSigningKey) {
    return {
      receiver: null as Receiver | null,
      errorResponse: NextResponse.json(
        {
          ok: false,
          error: "Missing QStash signing keys",
          missing,
        },
        { status: 500 }
      ),
    };
  }

  return {
    receiver: new Receiver({ currentSigningKey, nextSigningKey }),
    errorResponse: null as NextResponse | null,
  };
}

export async function POST(req: Request) {
  try {
    const signature = req.headers.get("Upstash-Signature") ?? req.headers.get("upstash-signature");

    if (!signature) {
      return NextResponse.json({ ok: false, error: "Missing Upstash-Signature header" }, { status: 401 });
    }

    const body = await req.text();

    const { receiver, errorResponse } = receiverOrErrorResponse();
    if (errorResponse) return errorResponse;

    const u = new URL(req.url);
    const candidateUrls = [req.url, `${u.origin}${u.pathname}`];

    let isValid = false;
    try {
      for (const url of candidateUrls) {
        isValid = await receiver!.verify({ signature, body, url });
        if (isValid) break;
      }
    } catch (e: any) {
      console.error("QStash signature verification threw:", e);
      return NextResponse.json(
        {
          ok: false,
          error: "Signature verification error",
          message: e?.message || String(e),
        },
        { status: 401 }
      );
    }


    if (!isValid) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }

    const result = await discoverOnce();
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("/api/cron/discover POST failed:", e);
    return NextResponse.json(
      { ok: false, error: "Discovery failed", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (process.env.VERCEL_ENV === "production") {
      if (!process.env.ADMIN_TOKEN) {
        return NextResponse.json({ ok: false, error: "ADMIN_TOKEN is not set" }, { status: 500 });
      }
      if (token !== process.env.ADMIN_TOKEN) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    } else {
      if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await discoverOnce();
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("/api/cron/discover GET failed:", e);
    return NextResponse.json(
      { ok: false, error: "Discovery failed", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
