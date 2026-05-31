import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function WanderPage() {
  return (
    <RouteShell
      eyebrow="wander"
      title="Discovery ritual shell"
      description="Wander exists as a route placeholder in this foundation phase. It must not fake full discovery logic before Doc 05 is implemented."
    >
      <EmptyState
        eyebrow="phase gated"
        title="Wander logic is not connected yet"
        description="Future work will use real published samples, exclusions from recent playback, and discovery scoring."
      />
    </RouteShell>
  );
}
