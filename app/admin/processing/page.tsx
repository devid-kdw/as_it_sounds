import Link from "next/link";
import {
  AdminStatusBadge,
  LifecycleBadge,
  ProcessingStatusBadge,
  StatusIcon,
} from "@/components/admin/status-badge";
import { RouteShell } from "@/components/ui/route-shell";
import { listAdminProcessingJobs, parseAdminProcessingJobListFilters } from "@/lib/data/admin";
import { adminSampleEditRoute } from "@/lib/routes";
import { ProcessingRetryButton } from "./processing-retry-button";

type AdminProcessingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProcessingPage({ searchParams }: AdminProcessingPageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseAdminProcessingJobListFilters(toUrlSearchParams(resolvedSearchParams ?? {}));
  const result = await listAdminProcessingJobs(filters);
  const jobs = result.items;
  const queuedCount = jobs.filter((job) => job.status === "queued").length;
  const runningCount = jobs.filter((job) => job.status === "running").length;
  const failedCount = jobs.filter((job) => job.status === "failed" || job.status === "timed_out").length;
  const reprocessCount = jobs.filter((job) => job.job_type === "reprocess_preview" || job.job_type === "reprocess_waveform").length;
  const stuckCount = jobs.filter((job) => job.is_stuck).length;
  const batchCount = new Set(jobs.map((job) => job.batch_id).filter(Boolean)).size;

  return (
    <RouteShell
      eyebrow="admin processing"
      title="Processing recovery center"
      description="Filter queued, running, failed, timed-out, reprocess, and batch-scoped jobs directly from durable processing state."
    >
      <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="queued" value={queuedCount} />
        <Metric label="running" value={runningCount} />
        <Metric label="failed or timed out" tone={failedCount > 0 ? "danger" : "default"} value={failedCount} />
        <Metric label="stuck running" tone={stuckCount > 0 ? "warning" : "default"} value={stuckCount} />
        <Metric label="reprocess jobs" value={reprocessCount} />
        <Metric label="batch IDs" value={batchCount} />
      </section>

      <section className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4">
        <form className="grid gap-3 md:grid-cols-5">
          <FilterSelect label="status" name="status" value={filters.status ?? "all"}>
            {["all", "queued", "running", "succeeded", "failed", "timed_out", "canceled"].map((status) => (
              <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="job type" name="job_type" value={filters.job_type ?? "all"}>
            {["all", "initial_upload", "reprocess_preview", "reprocess_waveform", "reprocess_metadata"].map((type) => (
              <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
            ))}
          </FilterSelect>
          <FilterInput label="batch_id" name="batch_id" placeholder="batch UUID" value={filters.batch_id} />
          <FilterSelect label="stuck" name="stuck" value={filters.stuck === undefined ? "" : String(filters.stuck)}>
            <option value="">any</option>
            <option value="true">stuck only</option>
            <option value="false">not stuck</option>
          </FilterSelect>
          <button className="self-end rounded-ais-sm border border-ais-amber bg-ais-amber px-3 py-2 text-sm font-medium text-ais-bg" type="submit">
            Apply filters
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-ais-md border border-ais-border-soft bg-ais-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ais-border-soft px-4 py-3">
          <div>
            <p className="ais-meta text-ais-amber">pipeline rows</p>
            <h2 className="ais-title mt-1 text-xl text-ais-text">Jobs grouped by batch_id when present</h2>
          </div>
          <AdminStatusBadge label={`${jobs.length} jobs`} tone="muted" />
        </div>

        {jobs.length === 0 ? (
          <p className="p-5 text-sm leading-6 text-ais-muted">
            No processing jobs match these filters. Failed and timed-out rows remain visible here until retried or superseded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] text-left text-sm">
              <thead className="bg-ais-panel text-ais-faint">
                <tr>
                  <ColumnHead>job</ColumnHead>
                  <ColumnHead>sample</ColumnHead>
                  <ColumnHead>type</ColumnHead>
                  <ColumnHead>status</ColumnHead>
                  <ColumnHead>attempts</ColumnHead>
                  <ColumnHead>error</ColumnHead>
                  <ColumnHead>batch</ColumnHead>
                  <ColumnHead>timestamps</ColumnHead>
                  <ColumnHead>actions</ColumnHead>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr className="border-t border-ais-border-soft align-top" key={job.id}>
                    <td className="max-w-56 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={job.status} />
                        <span className="break-all font-ais-mono text-xs text-ais-text">{job.id}</span>
                      </div>
                    </td>
                    <td className="max-w-56 px-4 py-3">
                      {job.sample_id ? (
                        <>
                          <p className="break-words font-medium text-ais-text">{job.sample_display_title ?? "Untitled sample"}</p>
                          <p className="mt-1 break-words font-ais-mono text-xs text-ais-amber">{job.sample_poetic_name ?? "unknown_sample"}</p>
                          {job.sample_status ? <div className="mt-2"><LifecycleBadge status={job.sample_status} /></div> : null}
                        </>
                      ) : (
                        <span className="text-ais-faint">no sample</span>
                      )}
                      {job.original_filename ? <p className="mt-2 break-words text-xs text-ais-faint">source: {job.original_filename}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-ais-muted">{job.job_type.replaceAll("_", " ")}</td>
                    <td className="px-4 py-3">
                      <div className="grid gap-2">
                        <ProcessingStatusBadge retryEligible={job.retry_eligible} status={job.status} stuck={job.is_stuck} />
                        {job.retry_reason ? <p className="max-w-56 text-xs leading-5 text-ais-muted">{job.retry_reason}</p> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-ais-mono text-ais-text">{job.attempts} / {job.max_attempts}</td>
                    <td className="max-w-72 px-4 py-3 text-ais-muted">
                      {job.last_error_code || job.last_error_message ? (
                        <>
                          <p className="font-ais-mono text-xs text-ais-danger">{job.last_error_code ?? "error"}</p>
                          <p className="mt-1 leading-5">{job.last_error_message ?? "Processing failed."}</p>
                        </>
                      ) : (
                        "none"
                      )}
                    </td>
                    <td className="max-w-48 px-4 py-3">
                      {job.batch_id ? (
                        <>
                          <p className="break-all font-ais-mono text-xs text-ais-text">{job.batch_id}</p>
                          {job.bulk_position ? <p className="mt-1 text-xs text-ais-faint">row {job.bulk_position}</p> : null}
                        </>
                      ) : (
                        <span className="text-ais-faint">single</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ais-muted">
                      <p>created {formatDate(job.created_at)}</p>
                      <p className="mt-1">started {formatDate(job.started_at)}</p>
                      <p className="mt-1">finished {formatDate(job.finished_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {job.sample_id ? (
                          <Link
                            className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-xs font-medium text-ais-text transition hover:border-ais-amber"
                            href={adminSampleEditRoute(job.sample_id)}
                          >
                            Open sample
                          </Link>
                        ) : null}
                        {job.retry_eligible ? <ProcessingRetryButton jobId={job.id} /> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </RouteShell>
  );
}

function Metric({ label, tone = "default", value }: { label: string; tone?: "default" | "danger" | "warning"; value: number }) {
  const labelClass = tone === "danger" ? "text-ais-danger" : tone === "warning" ? "text-ais-warning" : "text-ais-amber";

  return (
    <div className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4">
      <p className={`ais-meta ${labelClass}`}>{label}</p>
      <p className="ais-title mt-2 text-3xl text-ais-text">{value}</p>
    </div>
  );
}

function ColumnHead({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 font-ais-mono font-normal lowercase">{children}</th>;
}

function FilterInput({ label, name, placeholder, value }: { label: string; name: string; placeholder?: string; value?: string | null }) {
  return (
    <label className="grid gap-1 text-sm text-ais-muted">
      <span className="ais-meta text-ais-faint">{label}</span>
      <input className="ais-input" defaultValue={value ?? ""} name={name} placeholder={placeholder} />
    </label>
  );
}

function FilterSelect({ children, label, name, value }: { children: React.ReactNode; label: string; name: string; value?: string }) {
  return (
    <label className="grid gap-1 text-sm text-ais-muted">
      <span className="ais-meta text-ais-faint">{label}</span>
      <select className="ais-input" defaultValue={value ?? ""} name={name}>{children}</select>
    </label>
  );
}

function toUrlSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry);
      }
      continue;
    }
    if (value !== undefined) {
      params.set(key, value);
    }
  }

  return params;
}

function formatDate(value: string | null) {
  if (!value) {
    return "not set";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
