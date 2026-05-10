import Link from "next/link";
import { Check, CreditCard, Coins, Sparkles } from "lucide-react";
import { Card } from "@/components/ui";

const updatedAt = "May 10, 2026";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[hsl(var(--bg))] px-4 py-10 text-[hsl(var(--fg))]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-muted hover:underline">
          Back to Atlas Assistant
        </Link>

        <section className="mt-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-soft bg-subtle-2">
              <Sparkles size={20} className="text-[hsl(var(--accent))]" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">Atlas Assistant Pro</h1>
              <p className="mt-1 text-sm text-muted">Pricing last updated {updatedAt}</p>
            </div>
          </div>

          <Card className="mt-6 border-[hsl(var(--border))] bg-solid-surface p-5 shadow-2xl">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-medium text-muted">Monthly plan</div>
                <div className="mt-2 text-4xl font-semibold tracking-normal">USD 2.99</div>
                <div className="mt-1 text-sm text-muted">per month</div>
              </div>
              <Link
                href="/?upgrade=pro"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--accent))] px-3 py-2 text-sm font-medium text-black transition hover:opacity-90 focus-ring"
              >
                <CreditCard size={16} />
                Subscribe
              </Link>
            </div>

            <div className="mt-6 grid gap-3 text-sm">
              {[
                "20 item summaries per day, reset at UTC midnight.",
                "10 AI digest summaries per day, reset at UTC midnight.",
                "2 non-English translation languages per paid period.",
                "Cached AI results do not consume quota.",
              ].map((item) => (
                <div key={item} className="flex gap-3">
                  <Check size={16} className="mt-0.5 shrink-0 text-[hsl(var(--accent))]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-soft bg-solid-muted p-4">
                <div className="flex items-center gap-2 font-medium">
                  <CreditCard size={16} />
                  Pay with card
                </div>
                <p className="mt-2 text-sm text-muted">
                  Card subscriptions are processed securely by Paddle.
                </p>
              </div>
              <div className="rounded-xl border border-soft bg-solid-muted p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Coins size={16} />
                  Pay with crypto
                </div>
                <p className="mt-2 text-sm text-muted">
                  Crypto access is processed through NOWPayments and activates after payment confirmation.
                </p>
              </div>
            </div>
          </Card>

          <div className="mt-6 grid gap-2 text-sm text-muted">
            <p>For billing questions, contact 0xmdrakib@gmail.com.</p>
            <p>
              Read the{" "}
              <Link href="/terms-and-conditions" className="underline">
                Terms of Service
              </Link>
              ,{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
              , and{" "}
              <Link href="/refund" className="underline">
                Refund Policy
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
