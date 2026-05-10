"use client";

import * as React from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button, Card } from "@/components/ui";

declare global {
  interface Window {
    Paddle?: {
      Environment?: { set: (environment: "sandbox") => void };
      Initialize: (args: Record<string, any>) => void;
      Checkout: { open: (args: Record<string, any>) => void };
    };
    __atlasPaddleReady?: boolean;
  }
}

function loadPaddleScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.Paddle) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://cdn.paddle.com/paddle/v2/paddle.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Paddle checkout")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Paddle checkout"));
    document.head.appendChild(script);
  });
}

export default function PaddleCheckoutPage() {
  const [status, setStatus] = React.useState("Preparing secure card checkout...");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    async function openCheckout() {
      try {
        const params = new URLSearchParams(window.location.search);
        const transactionId = params.get("_ptxn") || params.get("ptxn") || params.get("transactionId");
        if (!transactionId) throw new Error("Missing Paddle transaction id");

        const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
        if (!token) throw new Error("Missing required env var: NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");

        await loadPaddleScript();
        if (cancelled || !window.Paddle) return;

        if (!window.__atlasPaddleReady) {
          if (process.env.NEXT_PUBLIC_PADDLE_ENV === "sandbox") {
            window.Paddle.Environment?.set("sandbox");
          }

          window.Paddle.Initialize({
            token,
            eventCallback: (event: any) => {
              if (event?.name === "checkout.completed") {
                setStatus("Payment complete. Activating your subscription...");
                window.setTimeout(() => {
                  window.location.href = "/?billing=success";
                }, 1200);
              }
            },
          });
          window.__atlasPaddleReady = true;
        }

        setStatus("Opening Paddle checkout...");
        window.Paddle.Checkout.open({
          transactionId,
          settings: {
            displayMode: "overlay",
            variant: "one-page",
            theme: "light",
          },
        });
      } catch (e: any) {
        setError(e?.message || "Unable to open Paddle checkout");
      }
    }

    openCheckout();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[hsl(var(--bg))] px-4 py-10 text-[hsl(var(--fg))]">
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
        <Card className="w-full border-[hsl(var(--border))] bg-solid-surface p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-soft bg-subtle-2">
              <CreditCard size={18} className="text-[hsl(var(--accent))]" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Card checkout</h1>
              <p className="mt-1 text-sm text-muted">
                {error || status}
              </p>
            </div>
          </div>

          {!error ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" />
              <span>Waiting for Paddle...</span>
            </div>
          ) : (
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => (window.location.href = "/")}>
                Back
              </Button>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
