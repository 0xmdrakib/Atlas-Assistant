import Link from "next/link";
import { Card } from "@/components/ui";

const updatedAt = "May 10, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[hsl(var(--bg))] px-4 py-10 text-[hsl(var(--fg))]">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-muted hover:underline">
          Back to Atlas Assistant
        </Link>

        <Card className="mt-8 border-[hsl(var(--border))] bg-solid-surface p-5 shadow-2xl">
          <h1 className="text-3xl font-semibold tracking-normal">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted">Last updated {updatedAt}</p>

          <div className="mt-6 space-y-5 text-sm leading-6">
            <section>
              <h2 className="font-semibold">Information We Collect</h2>
              <p className="mt-1 text-muted">
                When you sign in, we store basic Google account information such as your name, email address, and profile image. We also store AI usage counters, subscription status, payment session identifiers, and translation language unlocks.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">Payments</h2>
              <p className="mt-1 text-muted">
                Card payments are handled by Paddle. Crypto payments are handled by NOWPayments. Atlas Assistant does not store full card numbers, card security codes, or private crypto wallet keys.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">AI Processing</h2>
              <p className="mt-1 text-muted">
                News text and user-selected content may be sent to OpenAI to generate summaries, digests, translations, and content selections.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">How We Use Information</h2>
              <p className="mt-1 text-muted">
                We use stored information to provide the service, enforce usage limits, activate subscriptions, prevent duplicate webhook processing, and improve reliability.
              </p>
            </section>

            <section>
              <h2 className="font-semibold">Contact</h2>
              <p className="mt-1 text-muted">For privacy questions, contact 0xmdrakib@gmail.com.</p>
            </section>
          </div>
        </Card>
      </article>
    </main>
  );
}
