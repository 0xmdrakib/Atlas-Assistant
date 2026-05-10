import { AdminBillingPanel } from "@/components/admin-billing-panel";
import { requireOwnerSession } from "@/lib/owner";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireOwnerSession();

  if (!session) {
    return (
      <div className="mx-auto max-w-xl px-6 py-10">
        <div className="rounded-2xl border border-soft bg-surface p-6 shadow-soft">
          <div className="text-lg font-semibold">Admin locked</div>
          <div className="mt-2 text-sm text-muted">Sign in with the owner email configured in OWNER_EMAILS.</div>
        </div>
      </div>
    );
  }

  const [users, discounts, counts] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
        subscriptionProvider: true,
        paymentSessions: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            id: true,
            method: true,
            status: true,
            priceAmount: true,
            finalPriceAmount: true,
            priceCurrency: true,
            discountCode: true,
            discountPercentOff: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.discountCode.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { redemptions: true } } },
    }),
    prisma.item.groupBy({ by: ["section"], _count: { _all: true } }),
  ]);

  return (
    <AdminBillingPanel
      ownerEmail={session.user?.email || ""}
      users={users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        subscriptionCurrentPeriodEnd: u.subscriptionCurrentPeriodEnd?.toISOString() || null,
        paymentSessions: u.paymentSessions.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      }))}
      discounts={discounts.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        expiresAt: d.expiresAt?.toISOString() || null,
      }))}
      counts={counts.map((c) => ({ section: c.section, count: c._count._all }))}
    />
  );
}
