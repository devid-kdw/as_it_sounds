import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default async function AdminSampleEditPage({
  params,
}: {
  params: Promise<{ sampleId: string }>;
}) {
  const { sampleId } = await params;

  return (
    <RouteShell
      eyebrow="admin edit"
      title={`Edit sample ${sampleId}`}
      description="Admin edit routes use UUIDs. Metadata review, preview checks, waveform checks, and license confirmation are phase-gated."
    >
      <EmptyState
        eyebrow="edit pending"
        title="No editable sample record is loaded yet"
        description="Future edits must enforce license confirmation before publish."
      />
    </RouteShell>
  );
}
