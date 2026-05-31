import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default async function SampleDetailPage({
  params,
}: {
  params: Promise<{ poeticName: string }>;
}) {
  const { poeticName } = await params;

  return (
    <RouteShell
      eyebrow="sample detail"
      title={poeticName}
      description="This route keeps poetic identity in the URL. Published sample data, waveform peaks, entitlement states, and similar samples are intentionally not mocked here."
    >
      <EmptyState
        eyebrow="sample placeholder"
        title="No published sample row is loaded yet"
        description="The future implementation must use preview audio and precomputed waveform peaks, never browser-side original WAV analysis."
      />
    </RouteShell>
  );
}
