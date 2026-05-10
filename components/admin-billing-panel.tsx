"use client";

import * as React from "react";
import Link from "next/link";
import { BadgePercent, CheckCircle2, Shield, Sparkles, Users } from "lucide-react";
import { Button, Card } from "@/components/ui";

type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  subscriptionCurrentPeriodEnd: string | null;
  subscriptionProvider: string | null;
  paymentSessions: Array<{
    id: string;
    method: string;
    status: string;
    priceAmount: string;
    finalPriceAmount: string | null;
    priceCurrency: string;
    discountCode: string | null;
    discountPercentOff: number | null;
    createdAt: string;
  }>;
};

type AdminDiscount = {
  id: string;
  code: string;
  percentOff: number;
  maxRedemptions: number | null;
  redeemedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { redemptions: number };
};

function dateLabel(value?: string | null) {
  if (!value) return "None";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "None";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
}

function activePaid(user: AdminUser) {
  const end = user.subscriptionCurrentPeriodEnd ? new Date(user.subscriptionCurrentPeriodEnd) : null;
  return user.subscriptionPlan === "paid" && user.subscriptionStatus === "active" && end && end.getTime() > Date.now();
}

export function AdminBillingPanel({
  ownerEmail,
  users,
  discounts,
  counts,
}: {
  ownerEmail: string;
  users: AdminUser[];
  discounts: AdminDiscount[];
  counts: Array<{ section: string; count: number }>;
}) {
  const [grantEmail, setGrantEmail] = React.useState("");
  const [grantDays, setGrantDays] = React.useState("30");
  const [discountCode, setDiscountCode] = React.useState("");
  const [discountPercent, setDiscountPercent] = React.useState("50");
  const [discountLimit, setDiscountLimit] = React.useState("10");
  const [discountExpires, setDiscountExpires] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const activeUsers = users.filter(activePaid).length;

  async function postJson(url: string, body: any) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Request failed");
      setMessage("Saved.");
      window.setTimeout(() => window.location.reload(), 350);
    } catch (e: any) {
      setMessage(e?.message || "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDiscount(id: string, active: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/billing/discounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Request failed");
      window.location.reload();
    } catch (e: any) {
      setMessage(e?.message || "Request failed");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/" className="text-sm text-muted hover:underline">
            Back to Atlas Assistant
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">Admin</h1>
          <p className="mt-1 text-sm text-muted">Owner: {ownerEmail}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <Card className="border-[hsl(var(--border))] bg-solid-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Users</span>
            <Users size={16} className="text-[hsl(var(--accent))]" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{users.length}</div>
        </Card>
        <Card className="border-[hsl(var(--border))] bg-solid-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Active Pro</span>
            <Sparkles size={16} className="text-[hsl(var(--accent))]" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{activeUsers}</div>
        </Card>
        <Card className="border-[hsl(var(--border))] bg-solid-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Discounts</span>
            <BadgePercent size={16} className="text-[hsl(var(--accent))]" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{discounts.length}</div>
        </Card>
        <Card className="border-[hsl(var(--border))] bg-solid-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Sections</span>
            <Shield size={16} className="text-[hsl(var(--accent))]" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{counts.length}</div>
        </Card>
      </div>

      {message ? <div className="mt-4 rounded-xl border border-soft bg-solid-muted p-3 text-sm text-muted">{message}</div> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="border-[hsl(var(--border))] bg-solid-surface p-4">
          <h2 className="text-lg font-semibold">Give Premium</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-muted">User email</span>
              <input
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                className="rounded-xl border border-soft bg-solid-muted px-3 py-2 outline-none focus-ring"
                placeholder="user@example.com"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Access days</span>
              <input
                value={grantDays}
                onChange={(e) => setGrantDays(e.target.value)}
                className="rounded-xl border border-soft bg-solid-muted px-3 py-2 outline-none focus-ring"
                inputMode="numeric"
              />
            </label>
            <Button disabled={busy} onClick={() => postJson("/api/admin/billing/grant", { email: grantEmail, days: grantDays })}>
              Grant premium
            </Button>
          </div>
        </Card>

        <Card className="border-[hsl(var(--border))] bg-solid-surface p-4">
          <h2 className="text-lg font-semibold">Create Discount</h2>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Code</span>
                <input
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                  className="rounded-xl border border-soft bg-solid-muted px-3 py-2 outline-none focus-ring"
                  placeholder="LAUNCH50"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Percent off</span>
                <input
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  className="rounded-xl border border-soft bg-solid-muted px-3 py-2 outline-none focus-ring"
                  inputMode="numeric"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Claim limit</span>
                <input
                  value={discountLimit}
                  onChange={(e) => setDiscountLimit(e.target.value)}
                  className="rounded-xl border border-soft bg-solid-muted px-3 py-2 outline-none focus-ring"
                  inputMode="numeric"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Expires at</span>
                <input
                  value={discountExpires}
                  onChange={(e) => setDiscountExpires(e.target.value)}
                  className="rounded-xl border border-soft bg-solid-muted px-3 py-2 outline-none focus-ring"
                  type="date"
                />
              </label>
            </div>
            <Button
              disabled={busy}
              onClick={() =>
                postJson("/api/admin/billing/discounts", {
                  code: discountCode,
                  percentOff: discountPercent,
                  maxRedemptions: discountLimit,
                  expiresAt: discountExpires,
                })
              }
            >
              Create discount
            </Button>
          </div>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden border-[hsl(var(--border))] bg-solid-surface">
        <div className="border-b border-soft p-4">
          <h2 className="text-lg font-semibold">Users</h2>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-solid-muted text-muted">
              <tr>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-left">Ends</th>
                <th className="px-3 py-2 text-left">Provider</th>
                <th className="px-3 py-2 text-left">Latest payment</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const latest = user.paymentSessions[0];
                return (
                  <tr key={user.id} className="border-t border-soft">
                    <td className="px-3 py-2">
                      <div className="font-medium">{user.name || "Unnamed"}</div>
                      <div className="text-xs text-muted">{user.email || user.id}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={activePaid(user) ? "text-[hsl(var(--accent))]" : ""}>
                        {activePaid(user) ? "active pro" : user.subscriptionStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2">{dateLabel(user.subscriptionCurrentPeriodEnd)}</td>
                    <td className="px-3 py-2">{user.subscriptionProvider || "-"}</td>
                    <td className="px-3 py-2">
                      {latest ? (
                        <div>
                          <div>
                            {latest.method} / {latest.status}
                          </div>
                          <div className="text-xs text-muted">
                            {(latest.finalPriceAmount || latest.priceAmount).toUpperCase()} {latest.priceCurrency.toUpperCase()}
                            {latest.discountCode ? ` / ${latest.discountCode} ${latest.discountPercentOff}%` : ""}
                          </div>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        disabled={busy || !user.email}
                        onClick={() => postJson("/api/admin/billing/grant", { email: user.email, days: 30 })}
                        className="inline-flex items-center gap-1 rounded-lg border border-soft bg-solid-muted px-2 py-1 text-xs transition hover-subtle-2 disabled:opacity-60"
                      >
                        <CheckCircle2 size={14} />
                        30d
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6 overflow-hidden border-[hsl(var(--border))] bg-solid-surface">
        <div className="border-b border-soft p-4">
          <h2 className="text-lg font-semibold">Discount Codes</h2>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-solid-muted text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Off</th>
                <th className="px-3 py-2 text-left">Claims</th>
                <th className="px-3 py-2 text-left">Expires</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((discount) => (
                <tr key={discount.id} className="border-t border-soft">
                  <td className="px-3 py-2 font-medium">{discount.code}</td>
                  <td className="px-3 py-2">{discount.percentOff}%</td>
                  <td className="px-3 py-2">
                    {discount.redeemedCount}
                    {discount.maxRedemptions ? ` / ${discount.maxRedemptions}` : ""}
                  </td>
                  <td className="px-3 py-2">{dateLabel(discount.expiresAt)}</td>
                  <td className="px-3 py-2">{discount.active ? "active" : "paused"}</td>
                  <td className="px-3 py-2">
                    <button
                      disabled={busy}
                      onClick={() => toggleDiscount(discount.id, !discount.active)}
                      className="rounded-lg border border-soft bg-solid-muted px-2 py-1 text-xs transition hover-subtle-2 disabled:opacity-60"
                    >
                      {discount.active ? "Pause" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
