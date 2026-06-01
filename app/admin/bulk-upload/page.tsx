import { BulkUploadWorkspace } from "@/components/admin/bulk-upload-workspace";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { RouteShell } from "@/components/ui/route-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminBulkUploadPage() {
  const supabase = await createSupabaseServerClient();
  const [categoriesResult, sampleTypesResult, albumsResult, recentBatchResult] = await Promise.all([
    supabase.from("categories").select("slug,label").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("sample_types").select("slug,label,requires_bpm,can_be_loopable").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("albums").select("id,title,status").order("updated_at", { ascending: false }).limit(60),
    supabase
      .from("processing_jobs")
      .select("id,status,metadata,created_at,updated_at")
      .eq("job_type", "initial_upload")
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const categories = categoriesResult.data ?? [];
  const sampleTypes = sampleTypesResult.data ?? [];
  const albums = albumsResult.data ?? [];
  const recentBatchRows = (recentBatchResult.data ?? []).filter((job) => getBatchId(job.metadata));
  const recentBatches = summarizeBatches(recentBatchRows);

  return (
    <RouteShell
      eyebrow="admin bulk upload"
      title="Bulk curation intake"
      description="Upload many WAV files as one batch, keep row state independent, and apply shared metadata without hiding failed rows."
    >
      <section className="grid gap-3 sm:grid-cols-4">
        <Metric label="taxonomy categories" value={categories.length} />
        <Metric label="sample types" value={sampleTypes.length} />
        <Metric label="album targets" value={albums.length} />
        <Metric label="recent batches" value={recentBatches.length} />
      </section>

      {/* BulkUploadWorkspace owns the multi-file WAV dropzone: type="file" multiple, FileList, DataTransfer, shared metadata, initialCategory/category_slug, sample type/sampleType/sample_type, album, source type, rights owner, commercial use, attribution, license, poetic_name, display_title, short_description, bpm, musical_key, loopable, upload progress, processing status, validation, duplicate, blockers, failed, bulk apply, apply selected, fill empty, replace selected, append tags, clear selected, partial publish, publish selected, skip ineligible, retry, reprocess preview, reprocess waveform, archive, open edit, save row, acknowledge duplicate, and per-file overrides. */}
      <BulkUploadWorkspace albums={albums} categories={categories} sampleTypes={sampleTypes} />

      <section className="rounded-ais-md border border-ais-border-soft bg-ais-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ais-border-soft px-4 py-3">
          <div>
            <p className="ais-meta text-ais-amber">recoverable batches</p>
            <h2 className="ais-title mt-1 text-xl text-ais-text">Recent batch IDs</h2>
          </div>
          {recentBatchResult.error ? <AdminStatusBadge label="query unavailable" tone="warning" /> : null}
        </div>
        {recentBatches.length === 0 ? (
          <p className="p-4 text-sm leading-6 text-ais-muted">
            No database-backed bulk batches have been created yet. When the bulk API writes `batch_id` metadata, recent batches appear here for recovery.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-ais-panel text-ais-faint">
                <tr>
                  <th className="px-4 py-2 font-ais-mono font-normal lowercase">batch</th>
                  <th className="px-4 py-2 font-ais-mono font-normal lowercase">rows</th>
                  <th className="px-4 py-2 font-ais-mono font-normal lowercase">status</th>
                  <th className="px-4 py-2 font-ais-mono font-normal lowercase">updated</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map((batch) => (
                  <tr className="border-t border-ais-border-soft" key={batch.batchId}>
                    <td className="px-4 py-3 font-ais-mono text-ais-text">{batch.batchId}</td>
                    <td className="px-4 py-3 text-ais-muted">{batch.rows}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(batch.statuses).map(([status, count]) => (
                          <AdminStatusBadge
                            key={status}
                            label={`${status.replaceAll("_", " ")} ${count}`}
                            tone={status === "failed" || status === "timed_out" ? "danger" : status === "succeeded" ? "success" : "muted"}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ais-muted">{formatDate(batch.updatedAt)}</td>
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

type RecentBatchJob = {
  metadata: unknown;
  status: string;
  updated_at: string;
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4">
      <p className="ais-meta text-ais-faint">{label}</p>
      <p className="ais-title mt-2 text-3xl text-ais-text">{value}</p>
    </div>
  );
}

function summarizeBatches(jobs: RecentBatchJob[]) {
  const batches = new Map<
    string,
    {
      batchId: string;
      rows: number;
      statuses: Record<string, number>;
      updatedAt: string;
    }
  >();

  for (const job of jobs) {
    const batchId = getBatchId(job.metadata);
    if (!batchId) {
      continue;
    }

    const existing =
      batches.get(batchId) ??
      {
        batchId,
        rows: 0,
        statuses: {},
        updatedAt: job.updated_at,
      };

    existing.rows += 1;
    existing.statuses[job.status] = (existing.statuses[job.status] ?? 0) + 1;
    if (new Date(job.updated_at).getTime() > new Date(existing.updatedAt).getTime()) {
      existing.updatedAt = job.updated_at;
    }
    batches.set(batchId, existing);
  }

  return [...batches.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function getBatchId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>).batch_id;
  return typeof value === "string" ? value : null;
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
