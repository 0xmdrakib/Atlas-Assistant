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
  // On some platforms you may receive the header in lower case.
  const signature = req.headers.get("Upstash-Signature") ?? req.headers.get("upstash-signature");
  if (!signature) return false;

  // Receiver.verify expects the *raw request body*.
  const body = await req.text();

  // Upstash recommends validating the destination URL (`sub` claim) as well.
  // Some schedules include query params; others don't. Try both variants.
  const u = new URL(req.url);
  const candidateUrls = [req.url, `${u.origin}${u.pathname}`];

  for (const url of candidateUrls) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const ok = await r.verify({ signature, body, url });
      if (ok) return true;
    } catch (e) {
      // Keep responses consistent with other cron endpoints.
      console.error("QStash signature verification failed:", e);
    }
  }

  return false;
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
