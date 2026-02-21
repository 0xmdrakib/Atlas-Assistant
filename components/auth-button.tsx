"use client";

import * as React from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui";

export function AuthButton() {
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const authed = status === "authenticated";

  if (loading) {
    return (
      <div className="rounded-2xl border border-soft bg-wash-55 px-3 py-2 text-xs text-muted">
        Checking session…
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="h-9" onClick={() => signIn("google")}>Sign in</Button>
      </div>
    );
  }

  const email = session?.user?.email || "Signed in";
  return (
    <div className="flex items-center gap-2">
      <div className="hidden rounded-2xl border border-soft bg-wash-55 px-3 py-2 text-xs text-muted sm:block">
        {email}
      </div>
      <Button variant="ghost" className="h-9" onClick={() => signOut()}>Sign out</Button>
    </div>
  );
}
