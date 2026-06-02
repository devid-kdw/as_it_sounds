import { CollectionsWorkspace } from "@/components/collections/collections-workspace";
import { RouteShell } from "@/components/ui/route-shell";
import { getEntitlementForCurrentUser } from "@/lib/entitlement";

export default async function CollectionsPage() {
  const entitlement = await getEntitlementForCurrentUser();

  return (
    <RouteShell
      eyebrow="collections"
      title="Private collections"
      description="Gather published sounds into private listening paths. Names and atmosphere stay first; collection tools stay quiet and owner-scoped."
    >
      <CollectionsWorkspace entitlement={entitlement} />
    </RouteShell>
  );
}
