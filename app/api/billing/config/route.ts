export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { cardPaymentEnabled, subscriptionPrice } from "@/lib/paymentProviders";

export async function GET() {
  const price = subscriptionPrice();
  return Response.json(
    {
      ok: true,
      price,
      cardProvider: "paddle",
      cardPaymentEnabled: cardPaymentEnabled(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
