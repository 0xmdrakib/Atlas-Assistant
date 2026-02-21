"use client";

import * as React from "react";
import { signIn, useSession } from "next-auth/react";
import { Button } from "@/components/ui";

export function AuthButton() {
  const { status } = useSession();
  const loading = status === "loading";
  const authed = status === "authenticated";

  if (loading) {
    return (
      <div className="rounded-2xl border border-soft bg-glass px-3 py-2 text-xs text-muted">
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

  // When authenticated, the user controls (profile, theme, language, sign out)
  // live inside the 3-line menu. Keep the header minimal.
  return null;
}
