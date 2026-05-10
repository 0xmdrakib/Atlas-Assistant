export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { cardCryptoCodes, subscriptionPrice } from "@/lib/paymentProviders";

export async function GET() {
  const price = subscriptionPrice();
  return Response.json(
    {
      ok: true,
      price,
      cardCryptoCodes: cardCryptoCodes(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
