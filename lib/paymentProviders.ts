import crypto from "crypto";

const NOWPAYMENTS_BASE = "https://api.nowpayments.io/v1";
const MOONPAY_BASE = "https://buy.moonpay.com";
const FASTEST_CARD_CRYPTO_CODE = "usdttrc20";

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

export function subscriptionPrice() {
  return {
    amount: process.env.NOWPAYMENTS_PRICE_AMOUNT || "2.99",
    currency: (process.env.NOWPAYMENTS_PRICE_CURRENCY || "usd").toLowerCase(),
  };
}

export function cardCryptoCode(): string {
  return (process.env.MOONPAY_CARD_CRYPTO_CODE || FASTEST_CARD_CRYPTO_CODE).trim().toLowerCase();
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

export async function createNowpaymentsDirectPayment(args: {
  orderId: string;
  userEmail?: string | null;
}) {
  const price = subscriptionPrice();
  const payCurrency = cardCryptoCode();

  return nowpaymentsPost("/payment", {
    price_amount: Number(price.amount),
    price_currency: price.currency,
    pay_currency: payCurrency,
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

export function buildSignedMoonpayUrl(args: {
  walletAddress: string;
  quoteCurrencyAmount: string;
  orderId: string;
  userEmail?: string | null;
  currencyCode?: string | null;
}) {
  const publicKey = requiredEnv("MOONPAY_PUBLIC_KEY");
  const secretKey = requiredEnv("MOONPAY_SECRET_KEY");
  const currencyCode = String(args.currencyCode || cardCryptoCode()).trim().toLowerCase();

  const url = new URL(MOONPAY_BASE);
  url.searchParams.set("apiKey", publicKey);
  url.searchParams.set("currencyCode", currencyCode);
  url.searchParams.set("walletAddress", args.walletAddress);
  url.searchParams.set("quoteCurrencyAmount", args.quoteCurrencyAmount);
  url.searchParams.set("baseCurrencyCode", (process.env.NOWPAYMENTS_PRICE_CURRENCY || "usd").toLowerCase());
  url.searchParams.set("redirectURL", `${appUrl()}/?billing=card-pending&orderId=${encodeURIComponent(args.orderId)}`);
  url.searchParams.set("externalTransactionId", args.orderId);
  if (args.userEmail) url.searchParams.set("email", args.userEmail);

  const signature = crypto.createHmac("sha256", secretKey).update(url.search).digest("base64");
  url.searchParams.set("signature", signature);
  return url.toString();
}
