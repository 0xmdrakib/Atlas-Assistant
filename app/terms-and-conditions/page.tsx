import Link from "next/link";
import { Card } from "@/components/ui";

const updatedAt = "May 10, 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[hsl(var(--bg))] px-4 py-10 text-[hsl(var(--fg))]">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-muted hover:underline">
          Back to Atlas Assistant
        </Link>

        <Card className="mt-8 border-[hsl(var(--border))] bg-solid-surface p-5 shadow-2xl">
          <h1 className="text-3xl font-semibold tracking-normal">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted">Last updated {updatedAt}</p>

          <div className="mt-6 space-y-5 text-sm leading-6">
            <section>
              <h2 className="font-semibold">Service</h2>
              <p className="mt-1 text-muted">
                Atlas Assistant provides a curated news interface with AI summaries, digest generation, content selection, and translation features.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">Accounts</h2>
              <p className="mt-1 text-muted">
                Some features require Google sign in so usage limits, subscriptions, and translation language unlocks can be tied to one account.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">Subscriptions</h2>
              <p className="mt-1 text-muted">
                Atlas Assistant Pro costs USD 2.99 per month. Card subscriptions are processed by Paddle. Crypto payments are processed by NOWPayments and provide access for the paid period after payment confirmation.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">Usage Limits</h2>
              <p className="mt-1 text-muted">
                Free accounts include 5 item summaries and 3 AI digests per UTC day. Pro accounts include 20 item summaries, 10 AI digests, and 2 non-English translation languages per paid period.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">AI Output</h2>
              <p className="mt-1 text-muted">
                AI summaries and translations may contain mistakes. You should verify important information from original sources before relying on it.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">Contact</h2>
              <p className="mt-1 text-muted">For support, contact 0xmdrakib@gmail.com.</p>
            </section>
          </div>
        </Card>
      </article>
    </main>
  );
}
