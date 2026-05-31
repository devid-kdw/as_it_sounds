import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function LicensePage() {
  return (
    <RouteShell
      eyebrow="license"
      title="Usage rights shell"
      description="The public royalty-free licensing explanation route exists for later content."
    >
      <EmptyState
        eyebrow="content pending"
        title="License copy is not finalized yet"
        description="Finished license language should be added from the approved specification, not improvised in this skeleton."
      />
    </RouteShell>
  );
}
