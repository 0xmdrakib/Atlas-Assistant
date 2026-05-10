import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export function normalizeEmail(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

export function ownerEmailSet(): Set<string> {
  return new Set(
    String(process.env.OWNER_EMAILS || "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

export function isOwnerEmail(email?: string | null): boolean {
  const owners = ownerEmailSet();
  return owners.size > 0 && owners.has(normalizeEmail(email));
}

export async function requireOwnerSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isOwnerEmail(session.user.email)) return null;
  return session;
}
