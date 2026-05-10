const NOWPAYMENTS_BASE = "https://api.nowpayments.io/v1";
const PADDLE_LIVE_BASE = "https://api.paddle.com";
const PADDLE_SANDBOX_BASE = "https://sandbox-api.paddle.com";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function appUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

async function nowpaymentsPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${NOWPAYMENTS_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": requiredEnv("NOWPAYMENTS_API_KEY"),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`NOWPayments request failed: ${res.status} ${txt}`);
  }

  return await res.json();
}

function paddleApiBase(apiKey: string): string {
  return apiKey.includes("_sdbx_") ? PADDLE_SANDBOX_BASE : PADDLE_LIVE_BASE;
}

async function paddlePost(path: string, body: any): Promise<any> {
  const apiKey = requiredEnv("PADDLE_API_KEY");
  const res = await fetch(`${paddleApiBase(apiKey)}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Paddle-Version": "1",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Paddle request failed: ${res.status} ${txt}`);
  }

  return await res.json();
}

export function subscriptionPrice() {
  return {
    amount: process.env.NOWPAYMENTS_PRICE_AMOUNT || "2.99",
    currency: (process.env.NOWPAYMENTS_PRICE_CURRENCY || "usd").toLowerCase(),
  };
}

export function paddlePriceId(): string {
  return requiredEnv("PADDLE_PRICE_ID");
}

export async function createNowpaymentsInvoice(args: {
  orderId: string;
  userEmail?: string | null;
}) {
  const price = subscriptionPrice();
  return nowpaymentsPost("/invoice", {
    price_amount: Number(price.amount),
    price_currency: price.currency,
    order_id: args.orderId,
    order_description: "Atlas Assistant monthly subscription",
    ipn_callback_url: `${appUrl()}/api/webhooks/nowpayments`,
    success_url: `${appUrl()}/?billing=success`,
    cancel_url: `${appUrl()}/?billing=cancelled`,
    customer_email: args.userEmail || undefined,
    is_fixed_rate: true,
    is_fee_paid_by_user: true,
  });
}

export async function createPaddleCheckoutTransaction(args: {
  orderId: string;
  paymentSessionId: string;
  userId: string;
  userEmail?: string | null;
}) {
  return paddlePost("/transactions", {
    items: [{ price_id: paddlePriceId(), quantity: 1 }],
    collection_mode: "automatic",
    enable_checkout: true,
    checkout: {
      url: `${appUrl()}/paddle-checkout`,
    },
    custom_data: {
      source: "atlas-assistant",
      orderId: args.orderId,
      paymentSessionId: args.paymentSessionId,
      userId: args.userId,
      userEmail: args.userEmail || undefined,
    },
  });
}
