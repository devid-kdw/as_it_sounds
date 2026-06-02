import { SampleCard } from "@/components/library/sample-card";
import type { SampleActionEntitlement } from "@/components/sample-actions/sample-actions";
import type { PlayerSurface } from "@/stores/player-store";
import type { SampleCardView } from "@/types/sample";

type SampleGridProps = {
  entitlement: SampleActionEntitlement;
  samples: SampleCardView[];
  sourceSurface?: PlayerSurface;
  similarSourceSampleId?: string;
};

export function SampleGrid({ entitlement, samples, similarSourceSampleId, sourceSurface = "browse" }: SampleGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {samples.map((sample) => (
        <SampleCard
          entitlement={entitlement}
          key={sample.id}
          sample={sample}
          similarSourceSampleId={similarSourceSampleId}
          sourceSurface={sourceSurface}
        />
      ))}
    </div>
  );
}
