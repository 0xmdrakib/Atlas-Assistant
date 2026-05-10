export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { cardCryptoCode, subscriptionPrice } from "@/lib/paymentProviders";

export async function GET() {
  const price = subscriptionPrice();
  return Response.json(
    {
      ok: true,
      price,
      cardCryptoCode: cardCryptoCode(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
