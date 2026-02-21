import { prisma } from "@/lib/prisma";

export default async function AdminPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams?.token || "";
  const ok = token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;

  if (!ok) {
    return (
      <div className="mx-auto max-w-xl px-6 py-10">
        <div className="rounded-2xl border border-soft bg-surface p-6 shadow-soft">
          <div className="text-lg font-semibold">Admin locked</div>
          <div className="mt-2 text-sm text-muted">
            Open <code className="rounded bg-black/10 px-1">/admin?token=YOUR_ADMIN_TOKEN</code>
          </div>
        </div>
      </div>
    );
  }

  const sources = await prisma.source.findMany({ orderBy: [{ section: "asc" }, { trustScore: "desc" }] });
  const counts = await prisma.item.groupBy({ by: ["section"], _count: { _all: true } });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="rounded-2xl border border-soft bg-surface p-6 shadow-soft">
        <div className="text-xl font-semibold">Admin</div>
        <div className="mt-1 text-sm text-muted">
          Sources + DB counts. Edit sources in <code className="rounded bg-black/10 px-1">sources/seed-sources.json</code> then run seed + ingest.
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {counts.map((c) => (
            <div key={c.section} className="rounded-2xl border border-soft bg-black/10 p-3">
              <div className="text-xs text-muted">{c.section}</div>
              <div className="text-lg font-semibold">{c._count._all}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-auto rounded-2xl border border-soft">
          <table className="min-w-full text-sm">
            <thead className="bg-black/10 text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Section</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Country</th>
                <th className="px-3 py-2 text-left">Trust</th>
                <th className="px-3 py-2 text-left">Enabled</th>
                <th className="px-3 py-2 text-left">URL</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-t border-soft">
                  <td className="px-3 py-2">{s.section}</td>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2">{s.country || ""}</td>
                  <td className="px-3 py-2">{s.trustScore}</td>
                  <td className="px-3 py-2">{String(s.enabled)}</td>
                  <td className="px-3 py-2">
                    <a className="underline underline-offset-4 hover:opacity-80" href={s.url} target="_blank">
                      link
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
