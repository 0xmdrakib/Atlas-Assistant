import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(req: Request) {
  const signature =
    req.headers.get("Upstash-Signature") ?? req.headers.get("upstash-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Upstash-Signature" }, { status: 401 });
  }

  // IMPORTANT: verify needs the *raw* body string
  const body = await req.text();

  const isValid = await receiver.verify({
    signature,
    body,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ✅ Authorized by QStash: run ingest
  // await runIngest();   <-- call your existing ingest logic

  return NextResponse.json({ ok: true });
}
