import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function AdminAnalyticsPage() {
  return (
    <RouteShell
      eyebrow="admin analytics"
      title="Analytics shell"
      description="Analytics is phase-gated until event tables and real usage exist."
    >
      <EmptyState
        eyebrow="analytics pending"
        title="No usage events are connected yet"
        description="This route must not invent dashboard numbers before event capture is implemented."
      />
    </RouteShell>
  );
}
