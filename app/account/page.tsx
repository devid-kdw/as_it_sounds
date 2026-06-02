import Link from "next/link";
import { Download, LogOut, ShieldCheck } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth";
import {
  AccessConfigError,
  getEntitlementForCurrentUser,
  type SubscriptionStatus,
} from "@/lib/entitlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RouteShell } from "@/components/ui/route-shell";

export default async function AccountPage() {
  const user = await requireCurrentUser("/account");
  const supabase = await createSupabaseServerClient();
  const entitlement = await getAccountEntitlement(supabase);

  if (!entitlement) {
    return <PaidPreviewNotReadyAccount email={user.email ?? "Unknown email"} />;
  }

  const { count: downloadCount, error: downloadCountError } = await supabase
    .from("downloads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const showDevelopmentMode = process.env.NODE_ENV !== "production";
  const downloadHistorySummary = downloadCountError
    ? "Download history unavailable"
    : formatDownloadCount(downloadCount ?? 0);

  return (
    <RouteShell
      eyebrow="account"
      title="Account"
      description="Your AIS identity, subscription state, and download access are read from the local account mirror."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="grid gap-4 rounded-ais-md border border-ais-border-soft bg-ais-panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="ais-meta text-ais-amber">signed in as</p>
              <h2 className="mt-2 text-2xl font-medium text-ais-text">{user.email ?? "Unknown email"}</h2>
            </div>
            <StatusPill status={entitlement.subscriptionStatus} />
          </div>

          <dl className="grid gap-4">
            {showDevelopmentMode ? (
              <AccountRow
                label="Access mode"
                value={`${formatAccessMode(entitlement.accessMode)} · ${formatBillingMode(
                  entitlement.billingMode,
                )}`}
              />
            ) : null}
            <AccountRow
              label="Subscription"
              value={formatSubscriptionStatus(entitlement.subscriptionStatus)}
              detail={getSubscriptionDescription(entitlement.subscriptionStatus)}
            />
            <AccountRow
              label="Download access"
              value={entitlement.canDownloadOriginal ? "Original downloads enabled" : "Original downloads locked"}
              detail={
                entitlement.canDownloadOriginal
                  ? "AIS will allow original file downloads for this account."
                  : "Downloads require free launch access, lifetime access, or an active paid subscription."
              }
            />
            <AccountRow
              label="Preview access"
              value={entitlement.canPreviewFull ? "Full previews enabled" : "Limited previews only"}
            />
            <AccountRow label="Admin" value={entitlement.isAdmin ? "Enabled" : "Disabled"} />
          </dl>
        </section>

        <aside className="grid content-start gap-3 rounded-ais-md border border-ais-border-soft bg-ais-surface p-6">
          <Link
            className="rounded-ais-sm border border-ais-border-soft px-4 py-3 text-center text-sm font-medium text-ais-text transition hover:border-ais-amber"
            href="/account/billing"
          >
            Billing
          </Link>
          <form action="/auth/logout" method="post">
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-ais-sm bg-ais-amber px-4 py-3 text-sm font-medium text-ais-bg transition hover:bg-ais-pale-green"
              type="submit"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </aside>

        <section className="grid gap-4 rounded-ais-md border border-ais-border-soft bg-ais-panel p-6 lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-full border border-ais-border-soft bg-ais-surface text-ais-amber">
              <Download size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="ais-meta text-ais-amber">download history</p>
              <p className="mt-1 text-ais-muted">{downloadHistorySummary}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <AccessSummary
              label="Browse"
              value={entitlement.canBrowse ? "Open" : "Closed"}
              active={entitlement.canBrowse}
            />
            <AccessSummary
              label="Favorites"
              value={entitlement.canFavorite ? "Saved locally" : "Sign-in required"}
              active={entitlement.canFavorite}
            />
            <AccessSummary
              label="Plugin"
              value={entitlement.canUsePlugin ? "Available" : "Subscription-gated"}
              active={entitlement.canUsePlugin}
            />
          </div>
        </section>

        <section className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-6 lg:col-span-2">
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-ais-moss" aria-hidden="true" />
            <p className="ais-meta text-ais-amber">subscription state guide</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {SUBSCRIPTION_STATUS_ORDER.map((status) => (
              <StatusGuideItem key={status} status={status} />
            ))}
          </div>
        </section>
      </div>
    </RouteShell>
  );
}

async function getAccountEntitlement(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  try {
    return await getEntitlementForCurrentUser(supabase);
  } catch (error) {
    if (error instanceof AccessConfigError && error.code === "paid_preview_not_ready") {
      return null;
    }

    throw error;
  }
}

function PaidPreviewNotReadyAccount({ email }: { email: string }) {
  return (
    <RouteShell
      eyebrow="account"
      title="Account"
      description="AIS is holding production paid access closed until preview and download safety is confirmed."
    >
      <section className="grid max-w-3xl gap-4 rounded-ais-md border border-ais-border-soft bg-ais-panel p-6">
        <p className="ais-meta text-ais-amber">signed in as</p>
        <h2 className="text-2xl font-medium text-ais-text">{email}</h2>
        <dl className="grid gap-4">
          <AccountRow
            label="Subscription"
            value="Paid preview not ready"
            detail="The backend exposed a paid live safety guard, so AIS is not granting production paid access yet."
          />
          <AccountRow
            label="Download access"
            value="Original downloads locked"
            detail="Downloads stay closed while paid live mode is fail-closed."
          />
        </dl>
        <form action="/auth/logout" method="post">
          <button
            className="inline-flex w-fit items-center justify-center gap-2 rounded-ais-sm bg-ais-amber px-4 py-3 text-sm font-medium text-ais-bg transition hover:bg-ais-pale-green"
            type="submit"
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </section>
    </RouteShell>
  );
}

const SUBSCRIPTION_STATUS_ORDER: SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "lifetime_granted",
  "free_launch_access",
];

const SUBSCRIPTION_STATUS_COPY: Record<SubscriptionStatus, { label: string; description: string }> = {
  trialing: {
    label: "Trialing",
    description: "Paid access is in a Stripe trial window.",
  },
  active: {
    label: "Active",
    description: "Paid access is current and original downloads are allowed.",
  },
  past_due: {
    label: "Past due",
    description: "A payment needs attention before access can be trusted.",
  },
  canceled: {
    label: "Canceled",
    description: "The paid subscription ended or was canceled through the portal.",
  },
  unpaid: {
    label: "Unpaid",
    description: "Stripe marked invoices unpaid; paid access is closed.",
  },
  lifetime_granted: {
    label: "Lifetime granted",
    description: "AIS local entitlement grants long-term owner access.",
  },
  free_launch_access: {
    label: "Free launch access",
    description: "Launch-phase account marker; downloads depend on the free launch switch.",
  },
};

function AccountRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="grid gap-1 border-b border-ais-border-soft pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="ais-meta text-ais-muted">{label}</dt>
      <dd>
        <p className="font-medium text-ais-text">{value}</p>
        {detail ? <p className="mt-1 text-sm leading-6 text-ais-muted">{detail}</p> : null}
      </dd>
    </div>
  );
}

function StatusPill({ status }: { status: SubscriptionStatus | null }) {
  return (
    <span className="rounded-full border border-ais-border-soft bg-ais-surface px-3 py-2 text-xs font-medium text-ais-amber">
      {formatSubscriptionStatus(status)}
    </span>
  );
}

function AccessSummary({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="rounded-ais-sm border border-ais-border-soft bg-ais-surface p-4">
      <p className="ais-meta text-ais-muted">{label}</p>
      <p className={active ? "mt-2 font-medium text-ais-text" : "mt-2 font-medium text-ais-faint"}>
        {value}
      </p>
    </div>
  );
}

function StatusGuideItem({ status }: { status: SubscriptionStatus }) {
  const copy = SUBSCRIPTION_STATUS_COPY[status];

  return (
    <div className="rounded-ais-sm border border-ais-border-soft bg-ais-panel p-4">
      <p className="font-medium text-ais-text">{copy.label}</p>
      <p className="mt-2 text-sm leading-6 text-ais-muted">{copy.description}</p>
    </div>
  );
}

function formatSubscriptionStatus(status: SubscriptionStatus | null) {
  if (!status) {
    return "None";
  }

  return SUBSCRIPTION_STATUS_COPY[status]?.label ?? humanizeStatus(status);
}

function getSubscriptionDescription(status: SubscriptionStatus | null) {
  if (!status) {
    return "No local subscription row is reflected for this account yet.";
  }

  return SUBSCRIPTION_STATUS_COPY[status]?.description;
}

function formatAccessMode(mode: string) {
  const labels: Record<string, string> = {
    local_owner: "Local owner",
    free_launch: "Free launch",
    paid_test: "Paid test",
    paid_live: "Paid live",
  };

  return labels[mode] ?? humanizeStatus(mode);
}

function formatBillingMode(mode: string) {
  const labels: Record<string, string> = {
    disabled: "Billing disabled",
    test: "Stripe test",
    live: "Stripe live",
  };

  return labels[mode] ?? humanizeStatus(mode);
}

function humanizeStatus(value: string) {
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDownloadCount(count: number) {
  if (count === 1) {
    return "1 original download recorded";
  }

  return `${count} original downloads recorded`;
}
