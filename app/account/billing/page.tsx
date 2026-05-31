import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function BillingPage() {
  return (
    <RouteShell
      eyebrow="billing"
      title="Billing shell"
      description="Stripe Customer Portal wiring belongs to the monetization phase and must fail gracefully while billing mode is disabled."
    >
      <EmptyState
        eyebrow="billing disabled"
        title="No billing portal is connected yet"
        description="Local owner and free launch modes may omit Stripe secrets."
      />
    </RouteShell>
  );
}
