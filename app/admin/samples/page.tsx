import Link from "next/link";
import { AdminSampleRowActions } from "@/components/admin/sample-row-actions";
import {
  AdminStatusBadge,
  AssetStatusBadge,
  LifecycleBadge,
  LicenseStatusBadge,
  ProcessingStatusBadge,
} from "@/components/admin/status-badge";
import { RouteShell } from "@/components/ui/route-shell";
import { listAdminSamples, parseAdminSampleListFilters } from "@/lib/data/admin";

type AdminSamplesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminSamplesPage({ searchParams }: AdminSamplesPageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseAdminSampleListFilters(toUrlSearchParams(resolvedSearchParams ?? {}));
  const result = await listAdminSamples(filters);
  const items = result.items;
  const statusCounts = countBy(items, (item) => item.status);
  const blockedCount = items.filter((item) => !item.publish_eligibility.can_publish).length;

  return (
    <RouteShell
      eyebrow="admin samples"
      title="Sample management"
      description="Filter every lifecycle state, inspect processing and asset health, and jump into row-level recovery or curation."
    >
      <section className="grid gap-3 sm:grid-cols-4">
        <Metric label="rows loaded" value={items.length} />
        <Metric label="needs review" value={statusCounts.needs_review ?? 0} />
        <Metric label="published" value={statusCounts.published ?? 0} />
        <Metric label="publish blocked" tone={blockedCount > 0 ? "warning" : "default"} value={blockedCount} />
      </section>

      <section className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4">
        <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <FilterInput label="search" name="query" placeholder="poetic, title, filename" value={filters.query} />
          <FilterSelect label="lifecycle" name="status" value={filters.status ?? "all"}>
            {["all", "draft", "processing", "needs_review", "published", "archived", "failed"].map((status) => (
              <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="processing" name="processing_status" value={filters.processing_status ?? "all"}>
            {["all", "queued", "running", "succeeded", "failed", "timed_out", "canceled"].map((status) => (
              <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
            ))}
          </FilterSelect>
          <FilterInput label="category" name="category_slug" value={filters.category_slug} />
          <FilterInput label="sample type" name="sample_type_slug" value={filters.sample_type_slug} />
          <FilterInput label="mood" name="mood_slug" value={filters.mood_slug} />
          <FilterSelect label="license" name="license_status" value={filters.license_status ?? "all"}>
            {["all", "unverified", "verified", "restricted", "blocked", "archived"].map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="featured" name="featured" value={filters.featured === undefined ? "" : String(filters.featured)}>
            <option value="">any</option>
            <option value="true">featured</option>
            <option value="false">not featured</option>
          </FilterSelect>
          <FilterSelect label="duplicate" name="duplicate_warning" value={filters.duplicate_warning === undefined ? "" : String(filters.duplicate_warning)}>
            <option value="">any</option>
            <option value="true">has warning</option>
            <option value="false">none</option>
          </FilterSelect>
          <FilterSelect label="missing asset" name="missing_asset" value={filters.missing_asset ?? ""}>
            <option value="">any</option>
            <option value="any">any missing</option>
            <option value="original_wav">original</option>
            <option value="preview_audio">preview</option>
            <option value="waveform_peaks">waveform</option>
          </FilterSelect>
          <FilterInput label="album ID" name="album_id" value={filters.album_id} />
          <button className="self-end rounded-ais-sm border border-ais-amber bg-ais-amber px-3 py-2 text-sm font-medium text-ais-bg" type="submit">
            Apply filters
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-ais-md border border-ais-border-soft bg-ais-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ais-border-soft px-4 py-3">
          <div>
            <p className="ais-meta text-ais-amber">library triage</p>
            <h2 className="ais-title mt-1 text-xl text-ais-text">All lifecycle states</h2>
          </div>
          <AdminStatusBadge label={`${items.length} rows`} tone="muted" />
        </div>

        {items.length === 0 ? (
          <p className="p-5 text-sm leading-6 text-ais-muted">
            No samples match these filters. Try clearing lifecycle, processing, mood, asset, or album filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1240px] text-left text-sm">
              <thead className="bg-ais-panel text-ais-faint">
                <tr>
                  <ColumnHead>identity</ColumnHead>
                  <ColumnHead>status</ColumnHead>
                  <ColumnHead>processing</ColumnHead>
                  <ColumnHead>assets</ColumnHead>
                  <ColumnHead>license</ColumnHead>
                  <ColumnHead>taxonomy</ColumnHead>
                  <ColumnHead>moods</ColumnHead>
                  <ColumnHead>duration/bpm</ColumnHead>
                  <ColumnHead>featured</ColumnHead>
                  <ColumnHead>dates</ColumnHead>
                  <ColumnHead>actions</ColumnHead>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const latestJob = item.latest_processing_job;
                  const failedJobId =
                    latestJob && ["failed", "timed_out", "canceled"].includes(latestJob.status) ? latestJob.id : null;

                  return (
                    <tr className="border-t border-ais-border-soft align-top" key={item.id}>
                      <td className="max-w-64 px-4 py-3">
                        <p className="break-words font-medium text-ais-text">{item.display_title}</p>
                        <p className="mt-1 break-words font-ais-mono text-xs text-ais-amber">{item.poetic_name}</p>
                        {item.original_filename ? (
                          <p className="mt-2 break-words text-xs text-ais-faint">source: {item.original_filename}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3"><LifecycleBadge status={item.status} /></td>
                      <td className="px-4 py-3">
                        <div className="grid gap-2">
                          <ProcessingStatusBadge retryEligible={Boolean(failedJobId)} status={latestJob?.status ?? null} />
                          {latestJob ? <p className="font-ais-mono text-xs text-ais-faint">{latestJob.attempts}/{latestJob.max_attempts}</p> : null}
                          {item.duplicate_warning.present ? <AdminStatusBadge label="duplicate warning" tone={item.duplicate_warning.acknowledged ? "muted" : "warning"} /> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {item.asset_status.map((asset) => (
                            <AssetStatusBadge key={asset.kind} label={asset.kind.replaceAll("_", " ")} present={asset.status === "present"} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3"><LicenseStatusBadge status={item.license_status} /></td>
                      <td className="px-4 py-3 text-ais-muted">
                        <p>{item.category_slug}</p>
                        <p className="mt-1 font-ais-mono text-xs text-ais-faint">{item.sample_type_slug}</p>
                      </td>
                      <td className="max-w-44 px-4 py-3 text-ais-muted">{item.mood_slugs.join(", ") || "none"}</td>
                      <td className="px-4 py-3 text-ais-muted">
                        <p>{formatDuration(item.duration_seconds)}</p>
                        <p className="mt-1">{item.bpm ? `${item.bpm} bpm` : "no bpm"}</p>
                      </td>
                      <td className="px-4 py-3">{item.featured ? <AdminStatusBadge label="featured" tone="amber" /> : <AdminStatusBadge label="not featured" />}</td>
                      <td className="px-4 py-3 text-ais-muted">
                        <p>updated {formatDate(item.updated_at)}</p>
                        <p className="mt-1">published {formatDate(item.published_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        {/* Row actions include preview, publish, archive, restore, retry, reprocess preview, reprocess waveform, and toggle featured. */}
                        <AdminSampleRowActions
                          failedJobId={failedJobId}
                          poeticName={item.poetic_name}
                          sampleId={item.id}
                          status={item.status}
                        />
                        <div className="mt-2">
                          <Link className="text-xs text-ais-amber underline-offset-4 hover:underline" href={`/admin/samples/${item.id}/edit`}>
                            edit workspace
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </RouteShell>
  );
}

function Metric({ label, tone = "default", value }: { label: string; tone?: "default" | "warning"; value: number }) {
  return (
    <div className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4">
      <p className={tone === "warning" ? "ais-meta text-ais-warning" : "ais-meta text-ais-amber"}>{label}</p>
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

function countBy<Item, Key extends string>(items: Item[], key: (item: Item) => Key) {
  const counts: Partial<Record<Key, number>> = {};

  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}

function formatDate(value: string | null) {
  if (!value) {
    return "not set";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDuration(value: number | null) {
  if (!value) {
    return "no duration";
  }

  return `${Math.round(value)}s`;
}
