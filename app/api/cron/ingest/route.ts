import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { ingestOnce } from "@/lib/ingest";

// Ensure the handler isn't accidentally cached.
export const dynamic = "force-dynamic";

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

  // Explicit guard so TypeScript narrows keys to `string` below.
  // (Even if env vars are set in Vercel, `process.env.*` is typed as `string | undefined`.)
  if (!currentSigningKey || !nextSigningKey) {
    // Return a JSON body so QStash logs show the real reason instead of an empty 500.
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

// QStash (scheduled) calls should use POST.
export async function POST(req: Request) {
  try {
    const signature =
      req.headers.get("Upstash-Signature") ?? req.headers.get("upstash-signature");

    if (!signature) {
      return NextResponse.json(
        { ok: false, error: "Missing Upstash-Signature header" },
        { status: 401 }
      );
    }

    // Receiver.verify expects the *raw request body*.
    const body = await req.text();

    const { receiver, errorResponse } = receiverOrErrorResponse();
    if (errorResponse) return errorResponse;

    let isValid = false;
    try {
      isValid = await receiver!.verify({ signature, body });
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
      return NextResponse.json(
        { ok: false, error: "Invalid signature" },
        { status: 401 }
      );
    }

    const result = await ingestOnce();
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("/api/cron/ingest POST failed:", e);
    return NextResponse.json(
      { ok: false, error: "Ingest failed", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}

// Manual trigger (your UI button / debugging). Keep this protected.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    // In production, require ADMIN_TOKEN.
    if (process.env.VERCEL_ENV === "production") {
      if (!process.env.ADMIN_TOKEN) {
        return NextResponse.json(
          { ok: false, error: "ADMIN_TOKEN is not set" },
          { status: 500 }
        );
      }
      if (token !== process.env.ADMIN_TOKEN) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    } else {
      // In preview/dev, if ADMIN_TOKEN exists, enforce it; otherwise allow.
      if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await ingestOnce();
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("/api/cron/ingest GET failed:", e);
    return NextResponse.json(
      { ok: false, error: "Ingest failed", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
