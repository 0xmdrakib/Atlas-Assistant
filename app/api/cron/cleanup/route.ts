import { prisma } from "@/lib/prisma";
import { Receiver } from "@upstash/qstash";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TTL_MS = 60 * 60 * 1000; // 1 hour

function receiver() {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return null;
  return new Receiver({ currentSigningKey, nextSigningKey });
}

async function verifyQStash(req: Request): Promise<boolean> {
  const r = receiver();
  if (!r) return false;
  const signature = req.headers.get("upstash-signature");
  if (!signature) return false;
  const bodyText = await req.text();
  return r
    .verify({ signature, body: bodyText })
    .then(() => true)
    .catch(() => false);
}

async function runCleanup() {
  const cutoff = new Date(Date.now() - TTL_MS);

  const digestsDeleted = await prisma.digest.deleteMany({ where: { createdAt: { lt: cutoff } } });

  // Remove cached summaries after 1 hour (shared across users, per language).
  const summariesCleared = await prisma.itemTranslation.updateMany({
    where: { aiSummary: { not: null }, updatedAt: { lt: cutoff } },
    data: { aiSummary: null },
  });

  return { digestsDeleted: digestsDeleted.count, summariesCleared: summariesCleared.count, cutoff: cutoff.toISOString() };
}

export async function POST(req: Request) {
  // Prefer signed QStash requests; allow manual execution via token.
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const adminToken = process.env.ADMIN_TOKEN || "";

  if (token && adminToken && token === adminToken) {
    const out = await runCleanup();
    return Response.json({ ok: true, ...out, verified: "token" });
  }

  const verified = await verifyQStash(req);
  if (!verified) return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });

  const out = await runCleanup();
  return Response.json({ ok: true, ...out, verified: "qstash" });
}
