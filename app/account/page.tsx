import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";

export default function AccountPage() {
  return (
    <RouteShell
      eyebrow="account"
      title="Account shell"
      description="Profile, subscription mirror state, download history, and billing links will be wired after auth and entitlement phases."
    >
      <EmptyState
        eyebrow="signed out"
        title="No authenticated account is loaded yet"
        description="The future route must read local AIS subscription state rather than querying Stripe directly from client components."
      />
    </RouteShell>
  );
}
