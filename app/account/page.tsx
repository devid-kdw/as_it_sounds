import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth";
import { getEntitlementForCurrentUser } from "@/lib/entitlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RouteShell } from "@/components/ui/route-shell";

export default async function AccountPage() {
  const user = await requireCurrentUser("/account");
  const supabase = await createSupabaseServerClient();
  const entitlement = await getEntitlementForCurrentUser(supabase);
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
      description="Your AIS identity and local access state are resolved from Supabase Auth and the local subscription mirror."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <dl className="grid gap-4 rounded-ais-md border border-ais-border-soft bg-ais-panel p-6">
          <AccountRow label="Email" value={user.email ?? "Unknown"} />
          {showDevelopmentMode ? (
            <AccountRow
              label="Access mode"
              value={`${entitlement.accessMode} / ${entitlement.billingMode}`}
            />
          ) : null}
          <AccountRow
            label="Subscription"
            value={formatSubscriptionStatus(entitlement.subscriptionStatus)}
          />
          <AccountRow
            label="Downloads"
            value={entitlement.canDownloadOriginal ? "Original downloads enabled" : "Original downloads locked"}
          />
          <AccountRow
            label="Preview"
            value={entitlement.canPreviewFull ? "Full previews enabled" : "Limited previews only"}
          />
          <AccountRow label="Admin" value={entitlement.isAdmin ? "Enabled" : "Disabled"} />
        </dl>

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

        <section className="rounded-ais-md border border-ais-border-soft bg-ais-panel p-6 lg:col-span-2">
          <p className="ais-meta text-ais-amber">download history</p>
          <p className="mt-3 text-ais-muted">{downloadHistorySummary}</p>
        </section>
      </div>
    </RouteShell>
  );
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-ais-border-soft pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="ais-meta text-ais-muted">{label}</dt>
      <dd className="font-medium text-ais-text">{value}</dd>
    </div>
  );
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

function formatDownloadCount(count: number) {
  if (count === 1) {
    return "1 original download recorded";
  }

  return `${count} original downloads recorded`;
}
