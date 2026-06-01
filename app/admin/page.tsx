import Link from "next/link";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { RouteShell } from "@/components/ui/route-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const quickActions = [
  { href: "/admin/upload", label: "Upload one WAV" },
  { href: "/admin/bulk-upload", label: "Bulk upload WAVs" },
  { href: "/admin/samples?status=needs_review", label: "Review latest items" },
  { href: "/admin/processing?status=failed", label: "Open failed jobs" },
  { href: "/admin/albums", label: "Create album" },
] as const;

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const [
    needsReview,
    drafts,
    processing,
    failedProcessing,
    published,
    duplicateJobs,
    incompleteLicense,
    recentUploads,
  ] = await Promise.all([
    countRows(supabase, "samples", { status: "needs_review" }),
    countRows(supabase, "samples", { status: "draft" }),
    countProcessing(supabase, ["queued", "running"] as const),
    countProcessing(supabase, ["failed", "timed_out"] as const),
    countRows(supabase, "samples", { status: "published" }),
    supabase.from("processing_jobs").select("id", { count: "exact", head: true }).contains("metadata", {
      duplicate_check: { is_duplicate: true },
    }),
    supabase.from("samples").select("id", { count: "exact", head: true }).neq("license_status", "verified"),
    supabase.from("processing_jobs").select("id,status,metadata,created_at").eq("job_type", "initial_upload").order("created_at", { ascending: false }).limit(5),
  ]);
  const duplicateCount = duplicateJobs.error ? null : duplicateJobs.count ?? 0;
  const licenseCount = incompleteLicense.error ? null : incompleteLicense.count ?? 0;

  return (
    <RouteShell
      eyebrow="admin"
      title="Curation console"
      description="A work queue overview for upload, review, processing recovery, albums, and publish readiness."
    >
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard href="/admin/samples?status=needs_review" label="Needs review" value={needsReview} />
        <DashboardCard href="/admin/samples?status=draft" label="Drafts" value={drafts} />
        <DashboardCard href="/admin/processing?status=running" label="Processing" value={processing} />
        <DashboardCard danger href="/admin/processing?status=failed" label="Failed processing" value={failedProcessing} />
        <DashboardCard href="/admin/samples?status=published" label="Published library" value={published} />
        <DashboardCard href="/admin/samples?duplicate_warning=true" label="Duplicate warnings" value={duplicateCount} />
        <DashboardCard href="/admin/samples?license_status=unverified" label="License incomplete" value={licenseCount} />
        <DashboardCard href="/admin/albums" label="Albums" value={null} />
      </section>

      <section className="grid gap-4 rounded-ais-md border border-ais-border-soft bg-ais-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="ais-meta text-ais-amber">quick actions</p>
            <h2 className="ais-title mt-2 text-2xl text-ais-text">Continue curation</h2>
          </div>
          <AdminStatusBadge label="dashboard is read-only" tone="muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {quickActions.map((item) => (
            <Link
              className="rounded-ais-sm border border-ais-border-soft bg-ais-surface px-4 py-3 text-sm font-medium text-ais-text transition hover:border-ais-amber"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-ais-md border border-ais-border-soft bg-ais-surface">
        <div className="border-b border-ais-border-soft px-4 py-3">
          <p className="ais-meta text-ais-amber">recent uploads</p>
          <h2 className="ais-title mt-1 text-xl text-ais-text">Latest intake rows</h2>
        </div>
        {recentUploads.error || !recentUploads.data?.length ? (
          <p className="p-4 text-sm leading-6 text-ais-muted">No recent uploads are available yet.</p>
        ) : (
          <div className="grid divide-y divide-ais-border-soft">
            {recentUploads.data.map((job) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" key={job.id}>
                <div>
                  <p className="font-ais-mono text-xs text-ais-faint">{job.id}</p>
                  <p className="mt-1 text-sm text-ais-muted">{originalFilename(job.metadata) ?? "source filename unavailable"}</p>
                </div>
                <AdminStatusBadge label={job.status.replaceAll("_", " ")} tone={job.status === "failed" || job.status === "timed_out" ? "danger" : "muted"} />
              </div>
            ))}
          </div>
        )}
      </section>
    </RouteShell>
  );
}

async function countRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table: "samples",
  filters: Record<string, string>,
) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });

  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  const result = await query;
  return result.error ? null : result.count ?? 0;
}

async function countProcessing(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  statuses: readonly ("queued" | "running" | "succeeded" | "failed" | "canceled" | "timed_out")[],
) {
  const result = await supabase.from("processing_jobs").select("id", { count: "exact", head: true }).in("status", statuses);
  return result.error ? null : result.count ?? 0;
}

function DashboardCard({
  danger = false,
  href,
  label,
  value,
}: {
  danger?: boolean;
  href: string;
  label: string;
  value: number | null;
}) {
  return (
    <Link className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4 transition hover:border-ais-amber" href={href}>
      <p className={danger && value ? "ais-meta text-ais-danger" : "ais-meta text-ais-amber"}>{label}</p>
      <p className="ais-title mt-2 text-3xl text-ais-text">{value ?? "?"}</p>
    </Link>
  );
}

function originalFilename(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>).original_filename;
  return typeof value === "string" ? value : null;
}
