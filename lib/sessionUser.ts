import { prisma } from "@/lib/prisma";

export async function resolveUserIdFromSession(session: any): Promise<string | null> {
  const id = session?.user ? (session.user as any).id : null;
  if (id) return String(id);

  const email = session?.user?.email ? String(session.user.email) : null;
  if (!email) return null;

  const u = await prisma.user.findUnique({ where: { email } }).catch(() => null);
  return u?.id || null;
}
