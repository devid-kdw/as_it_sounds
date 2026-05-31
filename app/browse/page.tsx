import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function BrowsePage() {
  return (
    <RouteShell
      eyebrow="browse"
      title="Library route shell"
      description="Search, mood filters, category filters, sorting, sample cards, and the shared player will be wired after schema and data access phases."
    >
      <EmptyState
        eyebrow="empty library"
        title="No published samples are connected yet"
        description="This placeholder renders an intentional empty state instead of mock production behavior."
      />
    </RouteShell>
  );
}
