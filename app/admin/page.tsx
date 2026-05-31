import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function AdminPage() {
  return (
    <RouteShell
      eyebrow="admin"
      title="Curation console shell"
      description="Admin overview placeholders are present. Server-side authorization and real counts will arrive with auth, schema, and processing phases."
    >
      <EmptyState
        eyebrow="admin data pending"
        title="No processing or curation data is connected yet"
        description="Admin routes must be protected server-side in later phases; hidden navigation is never access control."
      />
    </RouteShell>
  );
}
