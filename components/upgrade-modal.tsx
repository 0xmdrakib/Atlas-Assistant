"use client";

import * as React from "react";
import { BadgePercent, Coins, CreditCard, Sparkles } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { Button, Card } from "@/components/ui";
import { useLanguage } from "@/components/language-provider";

type PayMethod = "card" | "crypto";
type BillingStatus = {
  ok?: boolean;
  authed?: boolean;
  plan?: "free" | "paid";
  status?: string;
  currentPeriodEnd?: string | null;
  limits?: { summary: number; digest: number; paidTranslationLanguages: number };
  remaining?: { summary: number; digest: number };
};
type BillingConfig = {
  cardPaymentEnabled?: boolean;
  price?: { amount?: string; currency?: string };
};
type AppliedDiscount = {
  code: string;
  percentOff: number;
  price: {
    amount: string;
    currency: string;
    discountAmount: string;
    finalAmount: string;
  };
};

function periodLabel(endIso?: string | null) {
  if (!endIso) return "";
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return "";

  const days = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
  const date = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(end);

  if (days <= 0) return `Ends today (${date})`;
  if (days === 1) return `1 day left, ends ${date}`;
  return `${days} days left, ends ${date}`;
}

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
  const [billingStatus, setBillingStatus] = React.useState<BillingStatus | null>(null);
  const [billingConfig, setBillingConfig] = React.useState<BillingConfig | null>(null);
  const [discountCode, setDiscountCode] = React.useState("");
  const [appliedDiscount, setAppliedDiscount] = React.useState<AppliedDiscount | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    setAppliedDiscount(null);
    (async () => {
      try {
        const [configRes, statusRes] = await Promise.all([
          fetch("/api/billing/config", { cache: "no-store" }),
          fetch("/api/billing/status", { cache: "no-store" }),
        ]);
        const data = await configRes.json().catch(() => null);
        const statusData = await statusRes.json().catch(() => null);
        if (cancelled) return;

        if (data?.ok) {
          setBillingConfig(data);
          const amount = data?.price?.amount ? String(data.price.amount) : "2.99";
          const currency = data?.price?.currency ? String(data.price.currency).toUpperCase() : "USD";
          setPriceLabel(`${currency} ${amount} / month`);
        }

        if (statusData?.ok) setBillingStatus(statusData);
      } catch {
        // Keep the built-in defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const ownerActive = authed && billingStatus?.status === "owner";
  const paidActive = authed && billingStatus?.plan === "paid";
  const active = ownerActive || paidActive;
  const activePeriod = periodLabel(billingStatus?.currentPeriodEnd);
  const cardEnabled = Boolean(billingConfig?.cardPaymentEnabled);
  const displayPrice = appliedDiscount
    ? `${appliedDiscount.price.currency.toUpperCase()} ${appliedDiscount.price.finalAmount} / month`
    : priceLabel;

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountCode: appliedDiscount?.code || undefined }),
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

  async function applyDiscount() {
    setError("");
    if (!authed) {
      signIn("google");
      return;
    }

    const code = discountCode.trim();
    if (!code) {
      setError("Enter a discount code");
      return;
    }

    setLoading("crypto");
    try {
      const res = await fetch("/api/billing/discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Invalid discount code");
      setAppliedDiscount(data);
      setDiscountCode(data.code || code);
    } catch (e: any) {
      setAppliedDiscount(null);
      setError(e?.message || "Invalid discount code");
    } finally {
      setLoading(null);
    }
  }

  async function activateFreeDiscount() {
    setError("");
    if (!authed) {
      signIn("google");
      return;
    }
    if (!appliedDiscount || appliedDiscount.percentOff < 100) return;

    setLoading("crypto");
    try {
      const res = await fetch("/api/billing/checkout/free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountCode: appliedDiscount.code }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Free activation failed");
      window.location.href = "/?billing=success";
    } catch (e: any) {
      setError(e?.message || "Free activation failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <Card className="w-full max-w-md border-[hsl(var(--border))] bg-solid-surface p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-soft bg-subtle-2">
            <Sparkles size={18} className="text-[hsl(var(--accent))]" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold">
              {ownerActive ? "Owner access active" : paidActive ? t(lang, "proActive") : t(lang, "upgradeTitle")}
            </div>
            <div className="mt-1 text-sm text-muted">
              {ownerActive
                ? "Unlimited owner access is enabled for this account."
                : paidActive
                  ? activePeriod || "Your Pro subscription is active."
                  : reason || t(lang, "upgradeBody")}
            </div>
            {!active ? <div className="mt-2 text-sm font-medium">{displayPrice}</div> : null}
          </div>
        </div>

        {error ? <div className="mt-3 rounded-xl border border-soft bg-solid-muted p-3 text-sm text-muted">{error}</div> : null}

        {active ? (
          <div className="mt-4 rounded-xl border border-soft bg-solid-muted p-3 text-sm">
            {ownerActive ? (
              <div className="text-muted">Unlimited AI summaries, AI digests, and translations.</div>
            ) : (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">{t(lang, "itemSummary")}</span>
                  <span className="font-medium">
                    {billingStatus?.remaining?.summary ?? 0}/{billingStatus?.limits?.summary ?? 20} today
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">{t(lang, "digestTitle")}</span>
                  <span className="font-medium">
                    {billingStatus?.remaining?.digest ?? 0}/{billingStatus?.limits?.digest ?? 10} today
                  </span>
                </div>
                <div className="text-xs text-muted">Daily limits reset at UTC midnight.</div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            <div className="rounded-xl border border-soft bg-solid-muted p-3">
              <div className="flex items-center gap-2">
                <BadgePercent size={16} className="text-muted" />
                <input
                  value={discountCode}
                  onChange={(e) => {
                    setDiscountCode(e.target.value.toUpperCase());
                    setAppliedDiscount(null);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                  placeholder="Discount code"
                />
                <button
                  type="button"
                  onClick={applyDiscount}
                  disabled={Boolean(loading)}
                  className="rounded-lg border border-soft bg-solid-surface px-2 py-1 text-xs transition hover-subtle-2 disabled:opacity-60"
                >
                  Apply
                </button>
              </div>
              {appliedDiscount ? (
                <div className="mt-2 text-xs text-muted">
                  {appliedDiscount.percentOff}% off applied. You pay {appliedDiscount.price.currency.toUpperCase()}{" "}
                  {appliedDiscount.price.finalAmount}.
                </div>
              ) : null}
            </div>

            {appliedDiscount?.percentOff === 100 ? (
              <Button className="gap-2" onClick={activateFreeDiscount} disabled={Boolean(loading)}>
                <Sparkles size={16} />
                {loading ? t(lang, "starting") : "Activate free Pro"}
              </Button>
            ) : (
              <div className={`grid gap-2 ${cardEnabled ? "sm:grid-cols-2" : ""}`}>
                <Button className="gap-2" onClick={() => startCheckout("crypto")} disabled={Boolean(loading)}>
                  <Coins size={16} />
                  {loading === "crypto" ? t(lang, "starting") : t(lang, "payCrypto")}
                </Button>
                {cardEnabled ? (
                  <Button variant="ghost" className="gap-2" onClick={() => startCheckout("card")} disabled={Boolean(loading)}>
                    <CreditCard size={16} />
                    {loading === "card" ? t(lang, "starting") : t(lang, "payCard")}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose} disabled={Boolean(loading)}>
            {t(lang, "notNow")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
