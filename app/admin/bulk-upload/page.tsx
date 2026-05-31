import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function AdminBulkUploadPage() {
  return (
    <RouteShell
      eyebrow="admin bulk upload"
      title="Batch upload shell"
      description="Batch editing, partial publish, and per-file processing states will be implemented from Doc 07."
    >
      <EmptyState
        eyebrow="batch pending"
        title="No batch rows are loaded yet"
        description="This shell avoids local fixture behavior as production logic."
      />
    </RouteShell>
  );
}
