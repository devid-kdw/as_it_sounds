import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function CollectionsPage() {
  return (
    <RouteShell
      eyebrow="collections"
      title="Private collections shell"
      description="Authenticated collection routes are present. User-owned data will live in Supabase with RLS rather than in client-only state."
    >
      <EmptyState
        eyebrow="no collections"
        title="No private collections are loaded yet"
        description="This phase keeps collection behavior empty until auth, schema, and data access are approved."
      />
    </RouteShell>
  );
}
