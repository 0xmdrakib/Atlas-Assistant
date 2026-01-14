import { ingestOnce } from "@/lib/ingest";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") || "";
  // Developer experience: allow local manual ingest without a token.
  // Production stays protected by ADMIN_TOKEN.
  const isDev = process.env.NODE_ENV !== "production";
  const ok = isDev || (token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN);
  if (!ok) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const res = await ingestOnce();
  return Response.json(res);
}
