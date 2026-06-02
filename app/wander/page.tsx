import { WanderPlayer } from "@/components/discovery/wander-player";
import { getEntitlementForCurrentUser } from "@/lib/entitlement";

export default async function WanderPage() {
  const entitlement = await getEntitlementForCurrentUser();

  return (
    <section className="grid gap-7 pb-24">
      <div className="grid gap-5 border-b border-ais-border-soft pb-7 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
        <div>
          <p className="ais-meta text-ais-amber">wander</p>
          <h1 className="ais-display mt-3 text-5xl leading-tight text-ais-text sm:text-7xl">
            Loose paths through the archive.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ais-muted">
            One sound at a time, nudged by mood and kept clear of what you just played or skipped.
          </p>
        </div>
        <p className="ais-meta rounded-ais-sm border border-ais-border-soft bg-ais-panel px-4 py-3 text-xs leading-6 text-ais-faint">
          published samples only / client exclusions capped at 20
        </p>
      </div>

      <WanderPlayer entitlement={entitlement} />
    </section>
  );
}
