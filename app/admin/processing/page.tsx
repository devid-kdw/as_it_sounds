import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { RouteShell } from "@/components/ui/route-shell";
import { adminSampleEditRoute } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProcessingRetryButton } from "./processing-retry-button";

const statusLabels = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  canceled: "Canceled",
  timed_out: "Timed out",
} as const;

export default async function AdminProcessingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: jobs, error } = await supabase
    .from("processing_jobs")
    .select(
      "id,sample_id,job_type,status,attempts,max_attempts,last_error_code,last_error_message,started_at,finished_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(25);
  const safeJobs = jobs ?? [];
  const failedCount = safeJobs.filter((job) => job.status === "failed" || job.status === "timed_out").length;
  const runningCount = safeJobs.filter((job) => job.status === "running").length;
  const queuedCount = safeJobs.filter((job) => job.status === "queued").length;

  return (
    <RouteShell
      eyebrow="admin processing"
      title="Processing monitor"
      description="Watch queued, running, completed, and failed audio work without exposing private storage paths."
    >
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="queued" value={queuedCount} />
        <Metric label="running" value={runningCount} />
        <Metric label="failed" value={failedCount} tone={failedCount > 0 ? "danger" : "default"} />
      </section>

      {error ? (
        <section className="rounded-ais-md border border-ais-danger bg-ais-surface p-5">
          <p className="ais-meta text-ais-danger">processing query failed</p>
          <h2 className="ais-title mt-2 text-2xl text-ais-text">Unable to load processing jobs</h2>
          <p className="mt-3 leading-7 text-ais-muted">
            The monitor could not read job rows. No stack traces, secrets, or signed URLs are shown here.
          </p>
        </section>
      ) : safeJobs.length === 0 ? (
        <EmptyState
          eyebrow="processing queue"
          title="No processing jobs yet"
          description="Upload a WAV from the single upload page to create the first queued job."
        />
      ) : (
        <section className="grid gap-3">
          {safeJobs.map((job) => (
            <article
              className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4"
              key={job.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="ais-meta text-ais-faint">{job.job_type.replaceAll("_", " ")}</p>
                  <h2 className="ais-title mt-2 text-2xl text-ais-text">{statusLabels[job.status]}</h2>
                </div>
                <StatusIcon status={job.status} />
              </div>

              <dl className="mt-4 grid gap-3 text-sm text-ais-muted sm:grid-cols-2 xl:grid-cols-4">
                <JobDatum label="job" value={job.id} />
                <JobDatum label="attempts" value={`${job.attempts} / ${job.max_attempts}`} />
                <JobDatum label="started" value={formatDate(job.started_at)} />
                <JobDatum label="finished" value={formatDate(job.finished_at)} />
              </dl>

              {job.last_error_code || job.last_error_message ? (
                <div className="mt-4 rounded-ais-sm border border-ais-danger bg-ais-bg p-3">
                  <p className="ais-meta text-ais-danger">processing failed</p>
                  <p className="mt-2 text-sm leading-6 text-ais-text">
                    {job.last_error_message ?? "Audio processing failed."}
                    {job.last_error_code ? ` (${job.last_error_code})` : ""}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                {job.sample_id ? (
                  <Link
                    className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm font-medium text-ais-text transition hover:border-ais-amber"
                    href={adminSampleEditRoute(job.sample_id)}
                  >
                    Open sample
                  </Link>
                ) : null}
                {(job.status === "failed" || job.status === "timed_out") && job.attempts < job.max_attempts ? (
                  <ProcessingRetryButton jobId={job.id} />
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </RouteShell>
  );
}

function Metric({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "danger";
  value: number;
}) {
  return (
    <div className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4">
      <p className={tone === "danger" ? "ais-meta text-ais-danger" : "ais-meta text-ais-amber"}>{label}</p>
      <p className="ais-title mt-2 text-3xl text-ais-text">{value}</p>
    </div>
  );
}

function JobDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="ais-meta text-ais-faint">{label}</dt>
      <dd className="mt-1 break-words text-ais-text">{value}</dd>
    </div>
  );
}

function StatusIcon({ status }: { status: keyof typeof statusLabels }) {
  if (status === "succeeded") {
    return <CheckCircle2 className="text-ais-success" aria-hidden="true" size={22} />;
  }

  if (status === "failed" || status === "timed_out") {
    return <AlertTriangle className="text-ais-danger" aria-hidden="true" size={22} />;
  }

  if (status === "running") {
    return <Loader2 className="animate-spin text-ais-amber" aria-hidden="true" size={22} />;
  }

  return <Clock3 className="text-ais-faint" aria-hidden="true" size={22} />;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
