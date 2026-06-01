import "server-only";

import { AISUserSafeError } from "@/lib/errors";
import { createStorageProvider, type StorageProvider } from "@/lib/storage";
import type { PublicTableRow, SupabaseDatabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicSampleAssetUrls } from "@/types/sample";

const PUBLIC_SAMPLE_ASSET_KINDS = ["preview_audio", "waveform_peaks"] as const;
const PUBLIC_SAMPLE_ASSET_SELECT = "sample_id,kind,bucket,object_path,access_level,samples!inner(status)";

type PublicSampleAssetKind = (typeof PUBLIC_SAMPLE_ASSET_KINDS)[number];
type SampleAssetRow = Pick<
  PublicTableRow<"sample_assets">,
  "sample_id" | "kind" | "bucket" | "object_path" | "access_level"
>;

type SampleAssetDataOptions = {
  supabase?: SupabaseDatabaseClient;
  storage?: StorageProvider;
};

export async function getPublicAssetUrlsForSample(
  sampleId: string,
  options: SampleAssetDataOptions = {},
): Promise<PublicSampleAssetUrls> {
  const assetsBySample = await getPublicAssetUrlsForSamples([sampleId], options);
  return assetsBySample.get(sampleId) ?? emptyPublicAssetUrls();
}

export async function getPublicAssetUrlsForSamples(
  sampleIds: string[],
  options: SampleAssetDataOptions = {},
): Promise<Map<string, PublicSampleAssetUrls>> {
  const uniqueSampleIds = [...new Set(sampleIds.filter(Boolean))];
  const assetsBySample = new Map<string, PublicSampleAssetUrls>(
    uniqueSampleIds.map((sampleId) => [sampleId, emptyPublicAssetUrls()]),
  );

  if (uniqueSampleIds.length === 0) {
    return assetsBySample;
  }

  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const storage = options.storage ?? createStorageProvider();
  const { data, error } = await supabase
    .from("sample_assets")
    .select(PUBLIC_SAMPLE_ASSET_SELECT)
    .in("sample_id", uniqueSampleIds)
    .in("kind", [...PUBLIC_SAMPLE_ASSET_KINDS])
    .eq("access_level", "public")
    .eq("samples.status", "published");

  if (error) {
    throw new AISUserSafeError("Unable to load public sample assets.", "public_sample_assets_failed", 500);
  }

  for (const asset of (data ?? []) as SampleAssetRow[]) {
    if (!isPublicSampleAssetKind(asset.kind)) {
      continue;
    }

    const publicUrl = getSafePublicUrl(asset, storage);
    if (!publicUrl) {
      continue;
    }

    const current = assetsBySample.get(asset.sample_id) ?? emptyPublicAssetUrls();
    assetsBySample.set(asset.sample_id, {
      previewAssetUrl: asset.kind === "preview_audio" ? publicUrl : current.previewAssetUrl,
      waveformPeaksUrl: asset.kind === "waveform_peaks" ? publicUrl : current.waveformPeaksUrl,
    });
  }

  return assetsBySample;
}

function emptyPublicAssetUrls(): PublicSampleAssetUrls {
  return {
    previewAssetUrl: null,
    waveformPeaksUrl: null,
  };
}

function isPublicSampleAssetKind(kind: PublicTableRow<"sample_assets">["kind"]): kind is PublicSampleAssetKind {
  return PUBLIC_SAMPLE_ASSET_KINDS.includes(kind as PublicSampleAssetKind);
}

function getSafePublicUrl(asset: SampleAssetRow, storage: StorageProvider) {
  if (asset.access_level !== "public") {
    return null;
  }

  try {
    return storage.getPublicUrl({
      bucket: asset.bucket,
      objectPath: asset.object_path,
    });
  } catch {
    return null;
  }
}
