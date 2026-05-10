"use client";

import * as React from "react";
import { CreditCard, Coins, Sparkles } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { Button, Card } from "@/components/ui";
import { useLanguage } from "@/components/language-provider";

type PayMethod = "card" | "crypto";

export function UpgradeModal({
  open,
  reason,
  onClose,
}: {
  open: boolean;
  reason?: string;
  onClose: () => void;
}) {
  const { status } = useSession();
  const authed = status === "authenticated";
  const { lang, t } = useLanguage();
  const [loading, setLoading] = React.useState<PayMethod | null>(null);
  const [error, setError] = React.useState("");
  const [priceLabel, setPriceLabel] = React.useState("$2.99 / month");

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/billing/config", { cache: "no-store" });
        const data = await r.json().catch(() => null);
        if (!data?.ok || cancelled) return;

        const amount = data?.price?.amount ? String(data.price.amount) : "2.99";
        const currency = data?.price?.currency ? String(data.price.currency).toUpperCase() : "USD";
        setPriceLabel(`${currency} ${amount} / month`);

      } catch {
        // Keep the built-in defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  async function startCheckout(method: PayMethod) {
    setError("");
    if (!authed) {
      signIn("google");
      return;
    }

    setLoading(method);
    try {
      const res = await fetch(`/api/billing/checkout/${method}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || "Checkout failed");
      window.location.href = String(data.url);
    } catch (e: any) {
      setError(e?.message || "Checkout failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4">
      <Card className="w-full max-w-md border-[hsl(var(--border))] bg-solid-surface p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-soft bg-subtle-2">
            <Sparkles size={18} className="text-[hsl(var(--accent))]" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold">{t(lang, "upgradeTitle")}</div>
            <div className="mt-1 text-sm text-muted">{reason || t(lang, "upgradeBody")}</div>
            <div className="mt-2 text-sm font-medium">{priceLabel}</div>
          </div>
        </div>

        {error ? <div className="mt-3 rounded-xl border border-soft bg-solid-muted p-3 text-sm text-muted">{error}</div> : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button className="gap-2" onClick={() => startCheckout("card")} disabled={Boolean(loading)}>
            <CreditCard size={16} />
            {loading === "card" ? t(lang, "starting") : t(lang, "payCard")}
          </Button>
          <Button variant="ghost" className="gap-2" onClick={() => startCheckout("crypto")} disabled={Boolean(loading)}>
            <Coins size={16} />
            {loading === "crypto" ? t(lang, "starting") : t(lang, "payCrypto")}
          </Button>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose} disabled={Boolean(loading)}>
            {t(lang, "notNow")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
