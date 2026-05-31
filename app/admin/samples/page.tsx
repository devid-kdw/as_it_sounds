import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function AdminSamplesPage() {
  return (
    <RouteShell
      eyebrow="admin samples"
      title="Sample management shell"
      description="Lifecycle filters, processing status, edit links, and publish state visibility will be wired after schema and admin access are in place."
    >
      <EmptyState
        eyebrow="no admin samples"
        title="No editable samples are connected yet"
        description="Admin rows must use UUID identity and never expose original filenames as public identity."
      />
    </RouteShell>
  );
}
