import { EmptyState } from "@/components/ui/empty-state";
import { SampleGrid } from "@/components/library/sample-grid";
import { getWanderSamples } from "@/lib/data/search";
import { getEntitlementForCurrentUser } from "@/lib/entitlement";

type WanderPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const WANDER_LIMIT = 12;

export default async function WanderPage({ searchParams }: WanderPageProps) {
  const params = await searchParams;
  const seed = firstParam(params?.seed);
  const [samples, entitlement] = await Promise.all([
    getWanderSamples({ limit: WANDER_LIMIT, seed, source: "web" }),
    getEntitlementForCurrentUser(),
  ]);

  return (
    <section className="grid gap-6 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6 sm:p-8">
        <div>
          <p className="ais-meta text-ais-amber">wander</p>
          <h1 className="ais-display mt-3 text-5xl leading-tight text-ais-text sm:text-6xl">Loose paths through the archive.</h1>
        </div>
        {samples.length > 0 ? (
          <p className="ais-meta text-xs text-ais-faint">
            {samples.length === 1 ? "1 published sound" : `${samples.length} published sounds`}
          </p>
        ) : null}
      </div>

      {samples.length > 0 ? (
        <SampleGrid entitlement={entitlement} samples={samples} sourceSurface="wander" />
      ) : (
        <EmptyState
          eyebrow="empty library"
          title="No published samples are ready yet"
          description="Published sounds will appear here once the archive opens."
        />
      )}
    </section>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
