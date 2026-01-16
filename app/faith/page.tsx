import { TabShell } from "@/components/tab-shell";
import { Feed } from "@/components/feed";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function Page(){
  return (
    <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading…</div>}>
      <TabShell>
        <Feed section="faith" />
      </TabShell>
    </Suspense>
  );
}
