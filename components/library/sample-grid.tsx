import { SampleCard } from "@/components/library/sample-card";
import type { PlayerSurface } from "@/stores/player-store";
import type { SampleCardView } from "@/types/sample";

type SampleGridProps = {
  samples: SampleCardView[];
  sourceSurface?: PlayerSurface;
};

export function SampleGrid({ samples, sourceSurface = "browse" }: SampleGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {samples.map((sample) => (
        <SampleCard key={sample.id} sample={sample} sourceSurface={sourceSurface} />
      ))}
    </div>
  );
}
