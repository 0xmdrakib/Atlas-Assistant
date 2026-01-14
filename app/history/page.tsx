import { TabShell } from "@/components/tab-shell";
import { Feed } from "@/components/feed";

export default function Page(){
  return (
    <TabShell>
      <Feed section="history" />
    </TabShell>
  );
}
