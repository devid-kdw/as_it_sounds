import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function AdminProcessingPage() {
  return (
    <RouteShell
      eyebrow="admin processing"
      title="Processing monitor shell"
      description="Processing job states, retries, failures, preview generation, and waveform peak generation are reserved for the audio pipeline phase."
    >
      <EmptyState
        eyebrow="processing pending"
        title="No processing jobs are connected yet"
        description="Future failures must be visible and human-readable without leaking storage paths or secrets."
      />
    </RouteShell>
  );
}
