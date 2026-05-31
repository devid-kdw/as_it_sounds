import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";
import { getEntitlementForCurrentUser } from "@/lib/entitlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RouteShell } from "@/components/ui/route-shell";

export default async function BillingPage() {
  await requireCurrentUser("/account/billing");

  const supabase = await createSupabaseServerClient();
  const entitlement = await getEntitlementForCurrentUser(supabase);
  const billingCopy = getBillingCopy(entitlement.accessMode, entitlement.canDownloadOriginal);

  return (
    <RouteShell
      eyebrow="billing"
      title="Billing"
      description="Billing is resolved from AIS local state. Stripe controls stay unavailable while billing mode is disabled."
    >
      <section className="grid max-w-3xl gap-5 rounded-ais-md border border-ais-border-soft bg-ais-panel p-6">
        <div>
          <p className="ais-meta text-ais-amber">{billingCopy.eyebrow}</p>
          <h2 className="ais-title mt-3 text-2xl text-ais-text">{billingCopy.title}</h2>
          <p className="mt-3 leading-7 text-ais-muted">{billingCopy.description}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <BillingStat label="Billing mode" value={entitlement.billingMode} />
          <BillingStat
            label="Subscription"
            value={formatSubscriptionStatus(entitlement.subscriptionStatus)}
          />
          <BillingStat
            label="Download access"
            value={entitlement.canDownloadOriginal ? "Allowed" : "Not entitled"}
          />
          <BillingStat label="Portal" value="Disabled" />
        </div>
        <Link
          className="inline-flex w-fit rounded-ais-sm border border-ais-border-soft px-4 py-3 text-sm font-medium text-ais-text transition hover:border-ais-amber"
          href="/account"
        >
          Back to account
        </Link>
      </section>
    </RouteShell>
  );
}

function BillingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ais-sm border border-ais-border-soft bg-ais-surface p-4">
      <p className="ais-meta text-ais-muted">{label}</p>
      <p className="mt-2 font-medium text-ais-text">{value}</p>
    </div>
  );
}

function getBillingCopy(accessMode: string, canDownloadOriginal: boolean) {
  if (accessMode === "local_owner") {
    return {
      eyebrow: "local owner",
      title: canDownloadOriginal ? "Local owner access is active" : "Billing is disabled locally",
      description:
        "Stripe is not required in local owner mode. Owner access comes from admin role or lifetime entitlement in the local database.",
    };
  }

  if (accessMode === "free_launch") {
    return {
      eyebrow: "free launch",
      title: "Free launch access",
      description:
        "Stripe controls remain hidden while free launch mode uses AIS local entitlement state.",
    };
  }

  return {
    eyebrow: "billing disabled",
    title: "Paid billing is not connected",
    description: "Checkout and Customer Portal routes are controlled placeholders in this phase.",
  };
}

function formatSubscriptionStatus(status: string | null) {
  if (!status) {
    return "None";
  }

  return status
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
