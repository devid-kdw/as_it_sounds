import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, LockKeyhole, Music2, Waves } from "lucide-react";
import { RouteShell } from "@/components/ui/route-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDefaultStorageProvider, type StoredObjectRef } from "@/lib/storage";
import { adminSampleEditRoute } from "@/lib/routes";
import { WaveformPeaksPreview } from "./waveform-peaks-preview";

const requiredAssetKinds = ["original_wav", "preview_audio", "waveform_peaks"] as const;

type RequiredAssetKind = (typeof requiredAssetKinds)[number];
type AssetStatus = "present" | "missing_row" | "missing_object";
type AssetSummary = {
  kind: RequiredAssetKind;
  label: string;
  status: AssetStatus;
  accessLevel: string | null;
  publicUrl: string | null;
};

export default async function AdminSampleEditPage({
  params,
}: {
  params: Promise<{ sampleId: string }>;
}) {
  const { sampleId } = await params;
  const supabase = await createSupabaseServerClient();
  const storage = createDefaultStorageProvider();
  const [{ data: sample, error: sampleError }, { data: assets }, { data: jobs }] = await Promise.all([
    supabase
      .from("samples")
      .select("id,poetic_name,display_title,status,license_status,duration_seconds,sample_rate,bit_depth,channels,file_hash_sha256")
      .eq("id", sampleId)
      .maybeSingle(),
    supabase
      .from("sample_assets")
      .select("kind,bucket,object_path,access_level,mime_type,file_size_bytes,checksum_sha256")
      .eq("sample_id", sampleId),
    supabase
      .from("processing_jobs")
      .select("id,status,job_type,metadata,last_error_code,last_error_message,created_at,finished_at")
      .eq("sample_id", sampleId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (sampleError || !sample) {
    notFound();
  }

  const assetSummaries = await Promise.all(
    requiredAssetKinds.map((kind) => resolveAssetSummary(kind, assets ?? [], storage)),
  );
  const previewAsset = assetSummaries.find((asset) => asset.kind === "preview_audio");
  const waveformAsset = assetSummaries.find((asset) => asset.kind === "waveform_peaks");
  const latestJob = jobs?.[0] ?? null;
  const duplicateIds = collectDuplicateSampleIds(latestJob?.metadata);
  const { data: duplicateSamples } = duplicateIds.length
    ? await supabase
        .from("samples")
        .select("id,display_title,poetic_name,status")
        .in("id", duplicateIds)
    : { data: [] };

  return (
    <RouteShell
      eyebrow="admin edit"
      title={sample.display_title}
      description="Review generated assets before metadata curation and publish gating."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="ais-meta text-ais-amber">{sample.poetic_name}</p>
              <h2 className="ais-title mt-2 text-2xl text-ais-text">{sample.status.replace("_", " ")}</h2>
            </div>
            <div className="grid gap-1 text-sm text-ais-muted sm:text-right">
              <span>License: {sample.license_status}</span>
              <span>{formatTechnicalLine(sample)}</span>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {assetSummaries.map((asset) => (
            <AssetStatusPanel asset={asset} key={asset.kind} />
          ))}
        </section>

        <section className="grid gap-5 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-5">
          <div className="flex items-center gap-3">
            <Music2 className="text-ais-amber" aria-hidden="true" size={22} />
            <div>
              <p className="ais-meta text-ais-amber">preview audio</p>
              <h2 className="ais-title mt-1 text-2xl text-ais-text">Generated stream</h2>
            </div>
          </div>
          {previewAsset?.publicUrl ? (
            <audio className="w-full" controls preload="none" src={previewAsset.publicUrl} />
          ) : (
            <VisibleAssetError message="Preview audio is missing or unavailable." />
          )}
        </section>

        <section className="grid gap-5 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-5">
          <div className="flex items-center gap-3">
            <Waves className="text-ais-amber" aria-hidden="true" size={22} />
            <div>
              <p className="ais-meta text-ais-amber">waveform peaks</p>
              <h2 className="ais-title mt-1 text-2xl text-ais-text">Generated waveform</h2>
            </div>
          </div>
          {waveformAsset?.publicUrl ? (
            <WaveformPeaksPreview url={waveformAsset.publicUrl} />
          ) : (
            <VisibleAssetError message="Waveform peaks JSON is missing or unavailable." />
          )}
        </section>

        {duplicateIds.length ? (
          <section className="rounded-ais-lg border border-ais-warning bg-ais-surface p-5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-ais-warning" aria-hidden="true" size={22} />
              <div>
                <p className="ais-meta text-ais-warning">duplicate hash</p>
                <h2 className="ais-title mt-1 text-2xl text-ais-text">Possible duplicate source</h2>
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-ais-muted">
              {(duplicateSamples ?? []).map((duplicate) => (
                <Link
                  className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-ais-text transition hover:border-ais-warning"
                  href={adminSampleEditRoute(duplicate.id)}
                  key={duplicate.id}
                >
                  {duplicate.display_title} - {duplicate.status}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {latestJob?.last_error_code || latestJob?.last_error_message ? (
          <VisibleAssetError
            message={`${latestJob.last_error_message ?? "Processing failed."}${latestJob.last_error_code ? ` (${latestJob.last_error_code})` : ""}`}
          />
        ) : null}
      </div>
    </RouteShell>
  );
}

async function resolveAssetSummary(
  kind: RequiredAssetKind,
  assets: Array<{ kind: string; bucket: string; object_path: string; access_level: string | null }>,
  storage: ReturnType<typeof createDefaultStorageProvider>,
): Promise<AssetSummary> {
  const asset = assets.find((row) => row.kind === kind);

  if (!asset) {
    return { kind, label: assetLabel(kind), status: "missing_row", accessLevel: null, publicUrl: null };
  }

  const ref: StoredObjectRef = {
    bucket: asset.bucket,
    objectPath: asset.object_path,
  };
  const exists = await storage.exists(ref).catch(() => false);
  const publicUrl =
    exists && kind !== "original_wav"
      ? storage.getPublicUrl(ref)
      : null;

  return {
    kind,
    label: assetLabel(kind),
    status: exists ? "present" : "missing_object",
    accessLevel: asset.access_level,
    publicUrl,
  };
}

function AssetStatusPanel({ asset }: { asset: AssetSummary }) {
  const isPresent = asset.status === "present";

  return (
    <article className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="ais-meta text-ais-faint">{asset.label}</p>
          <h3 className="ais-title mt-2 text-xl text-ais-text">{assetStatusLabel(asset.status)}</h3>
        </div>
        {asset.kind === "original_wav" ? (
          <LockKeyhole className="text-ais-muted" aria-hidden="true" size={20} />
        ) : isPresent ? (
          <CheckCircle2 className="text-ais-success" aria-hidden="true" size={20} />
        ) : (
          <AlertTriangle className="text-ais-danger" aria-hidden="true" size={20} />
        )}
      </div>
      <p className="mt-3 text-sm text-ais-muted">
        {asset.kind === "original_wav"
          ? "Stored privately. Browser playback uses preview only."
          : asset.accessLevel ?? "No access level recorded."}
      </p>
    </article>
  );
}

function VisibleAssetError({ message }: { message: string }) {
  return (
    <div className="rounded-ais-md border border-ais-danger bg-ais-surface p-4">
      <p className="ais-meta text-ais-danger">asset error</p>
      <p className="mt-2 text-sm leading-6 text-ais-text">{message}</p>
    </div>
  );
}

function assetLabel(kind: RequiredAssetKind) {
  if (kind === "original_wav") {
    return "Original WAV";
  }

  if (kind === "preview_audio") {
    return "Preview audio";
  }

  return "Waveform peaks";
}

function assetStatusLabel(status: AssetStatus) {
  if (status === "present") {
    return "Present";
  }

  if (status === "missing_object") {
    return "Missing object";
  }

  return "Missing row";
}

function formatTechnicalLine(sample: {
  duration_seconds: number | null;
  sample_rate: number | null;
  bit_depth: number | null;
  channels: number | null;
}) {
  const parts = [
    sample.duration_seconds ? `${Number(sample.duration_seconds).toFixed(3)}s` : null,
    sample.sample_rate ? `${sample.sample_rate} Hz` : null,
    sample.bit_depth ? `${sample.bit_depth}-bit` : null,
    sample.channels ? `${sample.channels} ch` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" - ") : "Technical metadata pending";
}

function collectDuplicateSampleIds(metadata: unknown) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return [];
  }

  const duplicateCheck = (metadata as Record<string, unknown>).duplicate_check;

  if (typeof duplicateCheck !== "object" || duplicateCheck === null || Array.isArray(duplicateCheck)) {
    return [];
  }

  const ids = (duplicateCheck as Record<string, unknown>).matching_sample_ids;

  return Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === "string"))] : [];
}
