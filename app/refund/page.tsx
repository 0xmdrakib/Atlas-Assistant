import Link from "next/link";
import { Card } from "@/components/ui";

const updatedAt = "May 10, 2026";

export default function RefundPage() {
  return (
    <main className="min-h-screen bg-[hsl(var(--bg))] px-4 py-10 text-[hsl(var(--fg))]">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-muted hover:underline">
          Back to Atlas Assistant
        </Link>

        <Card className="mt-8 border-[hsl(var(--border))] bg-solid-surface p-5 shadow-2xl">
          <h1 className="text-3xl font-semibold tracking-normal">Refund Policy</h1>
          <p className="mt-2 text-sm text-muted">Last updated {updatedAt}</p>

          <div className="mt-6 space-y-5 text-sm leading-6">
            <section>
              <h2 className="font-semibold">Monthly Subscription</h2>
              <p className="mt-1 text-muted">
                Atlas Assistant Pro is billed at USD 2.99 per month. Card payments are processed by Paddle and crypto payments are processed by NOWPayments.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">Refund Requests</h2>
              <p className="mt-1 text-muted">
                Refund requests may be reviewed within 7 days of purchase when the service has not been substantially used or when a billing error occurred.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">Crypto Payments</h2>
              <p className="mt-1 text-muted">
                Crypto payments may include network and provider fees. Approved crypto refunds may be reduced by non-recoverable fees and require a valid return address.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">Access After Cancellation</h2>
              <p className="mt-1 text-muted">
                If a subscription is canceled, paid access remains available until the current paid period ends unless a refund requires immediate access removal.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">Contact</h2>
              <p className="mt-1 text-muted">To request help with billing or refunds, contact 0xmdrakib@gmail.com.</p>
            </section>
          </div>
        </Card>
      </article>
    </main>
  );
}
