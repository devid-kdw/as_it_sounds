import { LocalCratesWorkspace } from "@/components/local-crates/local-crates-workspace";
import { RouteShell } from "@/components/ui/route-shell";
import { getEntitlementForCurrentUser } from "@/lib/entitlement";

export default async function LocalCratesPage() {
  const entitlement = await getEntitlementForCurrentUser();

  return (
    <RouteShell
      eyebrow="project crates"
      title="Local Project Crates"
      description="Track which published sounds were considered, exported, and actually used while producing locally."
    >
      <LocalCratesWorkspace entitlement={entitlement} />
    </RouteShell>
  );
}
