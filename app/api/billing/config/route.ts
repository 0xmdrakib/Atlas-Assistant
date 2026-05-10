export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { subscriptionPrice } from "@/lib/paymentProviders";

export async function GET() {
  const price = subscriptionPrice();
  return Response.json(
    {
      ok: true,
      price,
      cardProvider: "paddle",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
