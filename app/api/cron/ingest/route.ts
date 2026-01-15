import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { ingestOnce } from "@/lib/ingest";

// Ensure the handler isn't accidentally cached.
export const dynamic = "force-dynamic";

function getReceiver() {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    throw new Error("Missing QStash signing keys");
  }
  return new Receiver({ currentSigningKey, nextSigningKey });
}

export async function POST(req: Request) {
  const signature =
    req.headers.get("Upstash-Signature") ?? req.headers.get("upstash-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Upstash-Signature" }, { status: 401 });
  }

  // IMPORTANT: verify needs the *raw* body string
  const body = await req.text();

  const receiver = getReceiver();

  const isValid = await receiver.verify({
    signature,
    body,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ✅ Authorized by QStash: run ingest
  const result = await ingestOnce();
  return NextResponse.json(result);
}
