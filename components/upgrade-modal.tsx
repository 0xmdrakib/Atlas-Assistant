"use client";

import * as React from "react";
import { CreditCard, Coins, Sparkles } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { Button, Card } from "@/components/ui";
import { useLanguage } from "@/components/language-provider";

type PayMethod = "card" | "crypto";
type CardCryptoOption = { value: string; label: string };

const CARD_CRYPTO_OPTIONS: CardCryptoOption[] = [
  { value: "usdttrc20", label: "USDT TRC20" },
  { value: "usdc", label: "USDC" },
  { value: "btc", label: "BTC" },
  { value: "eth", label: "ETH" },
  { value: "ltc", label: "LTC" },
];

function labelForCryptoRail(code: string) {
  const known = CARD_CRYPTO_OPTIONS.find((x) => x.value === code);
  return known?.label || code.toUpperCase();
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
  const [cardOptions, setCardOptions] = React.useState(CARD_CRYPTO_OPTIONS);
  const [cardCrypto, setCardCrypto] = React.useState(CARD_CRYPTO_OPTIONS[0].value);

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

        const codes = Array.isArray(data?.cardCryptoCodes) ? data.cardCryptoCodes.map(String) : [];
        const options: CardCryptoOption[] = codes.length
          ? codes.map((code: string) => ({ value: code.toLowerCase(), label: labelForCryptoRail(code.toLowerCase()) }))
          : CARD_CRYPTO_OPTIONS;
        setCardOptions(options);
        setCardCrypto((current) => (options.some((x) => x.value === current) ? current : options[0].value));
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
        headers: { "Content-Type": "application/json" },
        body: method === "card" ? JSON.stringify({ payCurrency: cardCrypto }) : undefined,
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
      <Card className="w-full max-w-md p-5 shadow-xl">
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

        {error ? <div className="mt-3 rounded-xl border border-soft bg-subtle-2 p-3 text-sm text-muted">{error}</div> : null}

        <div className="mt-5 rounded-xl border border-soft bg-subtle p-3">
          <label className="text-xs font-medium text-muted" htmlFor="card-crypto-rail">
            Card payment crypto rail
          </label>
          <select
            id="card-crypto-rail"
            value={cardCrypto}
            onChange={(e) => setCardCrypto(e.target.value)}
            className="mt-2 w-full rounded-xl border border-soft bg-subtle-2 px-3 py-2 text-sm text-[hsl(var(--fg))] focus-ring"
          >
            {cardOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="mt-2 text-xs text-muted">
            Crypto checkout lets users choose supported coins on NOWPayments. Card checkout uses the selected rail through MoonPay.
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
