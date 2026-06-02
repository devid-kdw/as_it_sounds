import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, LockKeyhole } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth";
import {
  AccessConfigError,
  getEntitlementForCurrentUser,
  type AccessMode,
  type BillingMode,
  type EntitlementState,
  type SubscriptionStatus,
} from "@/lib/entitlement";
import { getCurrentSubscriptionView, type SubscriptionView } from "@/lib/data/subscriptions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RouteShell } from "@/components/ui/route-shell";
import { BillingActionForm } from "./billing-action-form";

type BillingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BillingPage({ searchParams }: BillingPageProps) {
  await requireCurrentUser("/account/billing");

  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const entitlement = await getBillingEntitlement(supabase);

  if (!entitlement) {
    return <PaidPreviewNotReadyBilling />;
  }

  const subscription = await getCurrentSubscriptionView(supabase);
  const checkoutState = parseCheckoutState(params?.checkout);
  const isPaidAccessSynced = isPaidActive(entitlement.subscriptionStatus);
  const showPendingSync = checkoutState === "success" && !isPaidAccessSynced;
  const billingCopy = getBillingCopy(entitlement, subscription, showPendingSync);
  const controls = getControlState(entitlement, subscription);

  return (
    <RouteShell
      eyebrow="billing"
      title="Billing"
      description="Stripe is reached only through AIS server routes. Access decisions stay anchored in the local subscription mirror."
    >
      <section className="grid max-w-4xl gap-5 rounded-ais-md border border-ais-border-soft bg-ais-panel p-6">
        {checkoutState ? (
          <CheckoutNotice state={checkoutState} pendingSync={showPendingSync} />
        ) : null}

        <div>
          <p className="ais-meta text-ais-amber">{billingCopy.eyebrow}</p>
          <h2 className="ais-title mt-3 text-2xl text-ais-text">{billingCopy.title}</h2>
          <p className="mt-3 leading-7 text-ais-muted">{billingCopy.description}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <BillingStat label="Access mode" value={formatAccessMode(entitlement.accessMode)} />
          <BillingStat label="Billing mode" value={formatBillingMode(entitlement.billingMode)} />
          <BillingStat
            label="Subscription"
            value={formatSubscriptionStatus(entitlement.subscriptionStatus)}
            detail={getSubscriptionDescription(entitlement.subscriptionStatus)}
          />
          <BillingStat
            label="Download access"
            value={entitlement.canDownloadOriginal ? "Allowed" : "Not entitled"}
            detail={
              entitlement.canDownloadOriginal
                ? "Original downloads are currently open to this account."
                : "Original downloads remain closed until entitlement is restored."
            }
          />
          <BillingStat
            label="Billing period"
            value={formatPeriodEnd(subscription?.currentPeriodEnd)}
            detail={subscription?.cancelAtPeriodEnd ? "Cancellation is scheduled at period end." : undefined}
          />
          <BillingStat
            label="Stripe customer"
            value={subscription?.stripeCustomerId ? "Linked locally" : "Not linked locally"}
          />
        </div>

        {billingCopy.warning ? <BillingWarning message={billingCopy.warning} /> : null}

        {controls.showControls ? (
          <section className="grid gap-3 rounded-ais-sm border border-ais-border-soft bg-ais-surface p-4 sm:grid-cols-2">
            <BillingActionForm
              action="checkout"
              endpoint="/api/billing/checkout"
              label={controls.checkoutLabel}
              variant="primary"
              disabled={!controls.checkoutEnabled}
            />
            <BillingActionForm
              action="portal"
              endpoint="/api/billing/portal"
              label="Open billing portal"
              disabled={!controls.portalEnabled}
            />
            {!controls.portalEnabled ? (
              <p className="text-sm leading-6 text-ais-muted sm:col-span-2">
                The portal opens after Stripe creates a local customer record through checkout.
              </p>
            ) : null}
          </section>
        ) : (
          <NoStripeControls mode={entitlement.accessMode} />
        )}

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

async function getBillingEntitlement(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  try {
    return await getEntitlementForCurrentUser(supabase);
  } catch (error) {
    if (error instanceof AccessConfigError && error.code === "paid_preview_not_ready") {
      return null;
    }

    throw error;
  }
}

function PaidPreviewNotReadyBilling() {
  return (
    <RouteShell
      eyebrow="billing"
      title="Billing"
      description="Production billing is held closed until AIS can confirm paid-live preview safety."
    >
      <section className="grid max-w-4xl gap-5 rounded-ais-md border border-ais-border-soft bg-ais-panel p-6">
        <div>
          <p className="ais-meta text-ais-amber">paid preview not ready</p>
          <h2 className="ais-title mt-3 text-2xl text-ais-text">Paid live is fail-closed</h2>
          <p className="mt-3 leading-7 text-ais-muted">
            The backend exposed `paid_preview_not_ready`, so AIS is not showing production checkout
            or portal controls.
          </p>
        </div>
        <NoStripeControls mode="paid_live" />
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

type BillingCopy = {
  eyebrow: string;
  title: string;
  description: string;
  warning?: string;
};

const STATUS_COPY: Record<SubscriptionStatus, { label: string; description: string }> = {
  trialing: {
    label: "Trialing",
    description: "Stripe trial access is reflected locally.",
  },
  active: {
    label: "Active",
    description: "Paid access is current.",
  },
  past_due: {
    label: "Past due",
    description: "Payment needs attention in the portal.",
  },
  canceled: {
    label: "Canceled",
    description: "Paid access has ended.",
  },
  unpaid: {
    label: "Unpaid",
    description: "Invoices are unpaid; access is closed.",
  },
  lifetime_granted: {
    label: "Lifetime granted",
    description: "Local owner access is granted without Stripe.",
  },
  free_launch_access: {
    label: "Free launch access",
    description: "Launch access marker; the free launch switch decides downloads.",
  },
};

function BillingStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-ais-sm border border-ais-border-soft bg-ais-surface p-4">
      <p className="ais-meta text-ais-muted">{label}</p>
      <p className="mt-2 font-medium text-ais-text">{value}</p>
      {detail ? <p className="mt-2 text-sm leading-6 text-ais-muted">{detail}</p> : null}
    </div>
  );
}

function CheckoutNotice({ state, pendingSync }: { state: "success" | "canceled"; pendingSync: boolean }) {
  if (state === "success" && pendingSync) {
    return (
      <div className="flex gap-3 rounded-ais-sm border border-ais-warning/60 bg-ais-surface p-4">
        <Clock className="mt-0.5 shrink-0 text-ais-warning" size={18} aria-hidden="true" />
        <div>
          <p className="font-medium text-ais-text">Syncing subscription status</p>
          <p className="mt-1 text-sm leading-6 text-ais-muted">
            Checkout returned successfully, but the webhook has not updated the local AIS subscription yet.
          </p>
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="flex gap-3 rounded-ais-sm border border-ais-success/60 bg-ais-surface p-4">
        <CheckCircle2 className="mt-0.5 shrink-0 text-ais-success" size={18} aria-hidden="true" />
        <div>
          <p className="font-medium text-ais-text">Checkout complete</p>
          <p className="mt-1 text-sm leading-6 text-ais-muted">
            AIS sees the paid subscription in the local mirror.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 rounded-ais-sm border border-ais-border-soft bg-ais-surface p-4">
      <AlertTriangle className="mt-0.5 shrink-0 text-ais-amber" size={18} aria-hidden="true" />
      <div>
        <p className="font-medium text-ais-text">Checkout canceled</p>
        <p className="mt-1 text-sm leading-6 text-ais-muted">
          No subscription change was applied. You can start checkout again when ready.
        </p>
      </div>
    </div>
  );
}

function BillingWarning({ message }: { message: string }) {
  return (
    <div className="flex gap-3 rounded-ais-sm border border-ais-warning/60 bg-ais-surface p-4">
      <AlertTriangle className="mt-0.5 shrink-0 text-ais-warning" size={18} aria-hidden="true" />
      <p className="text-sm leading-6 text-ais-muted">{message}</p>
    </div>
  );
}

function NoStripeControls({ mode }: { mode: AccessMode }) {
  const copy = getNoStripeControlsCopy(mode);

  return (
    <div className="flex gap-3 rounded-ais-sm border border-ais-border-soft bg-ais-surface p-4">
      <LockKeyhole className="mt-0.5 shrink-0 text-ais-moss" size={18} aria-hidden="true" />
      <p className="text-sm leading-6 text-ais-muted">{copy}</p>
    </div>
  );
}

function getNoStripeControlsCopy(mode: AccessMode) {
  if (mode === "local_owner") {
    return "Local owner mode uses AIS entitlement only. Stripe controls and upgrade prompts stay hidden here.";
  }

  if (mode === "free_launch") {
    return "Free launch mode uses AIS launch access. Stripe controls stay hidden until the paid phase is enabled.";
  }

  return "Production billing controls are hidden while AIS is fail-closed.";
}

function getBillingCopy(
  entitlement: EntitlementState,
  subscription: SubscriptionView | null,
  pendingSync: boolean,
): BillingCopy {
  if (entitlement.accessMode === "local_owner") {
    return {
      eyebrow: "local owner",
      title: entitlement.canDownloadOriginal ? "Local owner access is active" : "Billing is disabled locally",
      description:
        "Stripe is not required in local owner mode. Owner access comes from admin role or lifetime entitlement in the local database.",
    };
  }

  if (entitlement.accessMode === "free_launch") {
    return {
      eyebrow: "free launch",
      title: "Free launch access",
      description:
        entitlement.canDownloadOriginal
          ? "Free launch downloads are open for authenticated accounts through the AIS launch switch."
          : "This account has the launch marker, but original downloads are closed until the AIS launch switch is enabled.",
    };
  }

  if (entitlement.accessMode === "paid_test") {
    return {
      eyebrow: "paid test",
      title: pendingSync ? "Checkout is returning to AIS" : "Stripe test billing",
      description:
        "Use Stripe test mode to verify checkout, webhook sync, download entitlement, and portal cancellation before live launch.",
      warning:
        "Test mode only. Do not use real card details, and treat local subscription state as the source of access truth.",
    };
  }

  if (entitlement.billingMode !== "live") {
    return {
      eyebrow: "paid preview not ready",
      title: "Paid live is fail-closed",
      description:
        "AIS is not exposing production billing controls because the local backend has not confirmed live billing readiness.",
      warning: "paid_preview_not_ready: production checkout remains closed until the backend exposes live-safe billing.",
    };
  }

  return {
    eyebrow: "paid live",
    title: subscription?.stripeCustomerId ? "Manage your AIS subscription" : "Start AIS subscription",
    description:
      "Production billing is enabled. Checkout and portal sessions are created only by AIS server routes.",
  };
}

function getControlState(entitlement: EntitlementState, subscription: SubscriptionView | null) {
  const showControls = entitlement.accessMode === "paid_test" || entitlement.accessMode === "paid_live";
  const portalEnabled = entitlement.shouldShowBillingPortal || Boolean(subscription?.stripeCustomerId);
  const checkoutEnabled = entitlement.shouldShowCheckout && !isPaidActive(entitlement.subscriptionStatus);

  return {
    showControls,
    checkoutEnabled,
    portalEnabled,
    checkoutLabel: isPaidActive(entitlement.subscriptionStatus) ? "Subscription active" : "Start checkout",
  };
}

function parseCheckoutState(value: string | string[] | undefined) {
  const checkout = Array.isArray(value) ? value[0] : value;

  if (checkout === "success" || checkout === "canceled") {
    return checkout;
  }

  return null;
}

function isPaidActive(status: SubscriptionStatus | null) {
  return status === "active" || status === "trialing" || status === "lifetime_granted";
}

function formatSubscriptionStatus(status: SubscriptionStatus | null) {
  if (!status) {
    return "None";
  }

  return STATUS_COPY[status]?.label ?? humanizeStatus(status);
}

function getSubscriptionDescription(status: SubscriptionStatus | null) {
  if (!status) {
    return "No local subscription status has arrived yet.";
  }

  return STATUS_COPY[status]?.description;
}

function formatAccessMode(mode: AccessMode) {
  const labels: Record<AccessMode, string> = {
    local_owner: "Local owner",
    free_launch: "Free launch",
    paid_test: "Paid test",
    paid_live: "Paid live",
  };

  return labels[mode];
}

function formatBillingMode(mode: BillingMode) {
  const labels: Record<BillingMode, string> = {
    disabled: "Disabled",
    test: "Stripe test",
    live: "Stripe live",
  };

  return labels[mode];
}

function formatPeriodEnd(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function humanizeStatus(value: string) {
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
