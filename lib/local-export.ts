import "server-only";

import { constants } from "node:fs";
import { access, mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NextRequest } from "next/server";
import { AISUserSafeError } from "@/lib/errors";
import { getAccessMode, getEntitlementForCurrentUser, type EntitlementState } from "@/lib/entitlement";
import {
  ensureLocalDirectories,
  getLocalPaths,
  sanitizeFilename,
  tokenizePath,
  resolveTokenizedPath,
} from "@/lib/local-paths";
import { logLocalUsageEvent } from "@/lib/local-events";
import { createStorageProvider, type StorageProvider } from "@/lib/storage";
import { createSupabaseAdminClient, type PublicTableRow, type SupabaseDatabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const execFileAsync = promisify(execFile);
const LOCAL_DOWNLOAD_SOURCE = "web" as const;

type LocalSampleRow = Pick<
  PublicTableRow<"samples">,
  "id" | "poetic_name" | "bpm" | "musical_key" | "status" | "archived_at"
>;

type OriginalAssetRow = Pick<PublicTableRow<"sample_assets">, "bucket" | "object_path" | "kind" | "access_level">;

export type LocalExportResult = {
  filename: string;
  tokenizedPath: string;
  dropzoneTokenizedPath: string;
  sampleId: string;
  action: "exported_to_dropzone";
};

export type LocalRevealResult = {
  tokenizedPath: string;
  revealed: boolean;
  action: "revealed";
};

export type LocalCopyPathResult = {
  tokenizedPath: string;
  absolutePath: string;
  action: "copy_path";
};

type LocalExportOptions = {
  supabase?: SupabaseDatabaseClient;
  storage?: StorageProvider;
  request?: NextRequest;
};

export async function exportSampleToFlDropzone(
  sampleId: string,
  options: LocalExportOptions = {},
): Promise<LocalExportResult> {
  const sessionSupabase = options.supabase ?? (await createSupabaseServerClient());
  const entitlement = await requireLocalOwnerDownloadEntitlement(sessionSupabase);
  const adminSupabase = createSupabaseAdminClient();
  const [sample, originalAsset] = await loadPublishedSampleAndOriginalAsset(sampleId, adminSupabase);

  await ensureLocalDirectories();
  await mkdir(getLocalPaths().flDropzone, { recursive: true });

  const baseFilename = buildLocalExportFilename(sample);
  const storage = options.storage ?? createStorageProvider(adminSupabase);
  const originalExists = await storage.exists({
    bucket: originalAsset.bucket,
    objectPath: originalAsset.object_path,
  });

  if (!originalExists) {
    throw new AISUserSafeError("Original WAV asset is missing in storage.", "original_asset_missing", 409);
  }

  const destinationPath = await reserveCollisionSafeDestination(getLocalPaths().flDropzone, baseFilename);

  try {
    const originalBytes = await storage.downloadObject({
      bucket: originalAsset.bucket,
      objectPath: originalAsset.object_path,
    });
    await writeFile(`${destinationPath}.tmp`, Buffer.from(originalBytes), { flag: "wx" });
    await rename(`${destinationPath}.tmp`, destinationPath);
  } catch (error) {
    await cleanupReservedDestination(destinationPath);
    throw toLocalExportStorageError(error);
  }

  await logLocalExportDownload(sample.id, entitlement, adminSupabase, options.request);
  await logLocalUsageEvent({
    type: "sample_exported_to_dropzone",
    sampleId: sample.id,
    sourceSurface: "browse",
    tokenizedPath: tokenizePath(destinationPath),
    userId: entitlement.userId,
    metadata: {
      filename: path.basename(destinationPath),
      dropzonePath: tokenizePath(getLocalPaths().flDropzone),
    },
  });

  return {
    filename: path.basename(destinationPath),
    tokenizedPath: tokenizePath(destinationPath),
    dropzoneTokenizedPath: tokenizePath(getLocalPaths().flDropzone),
    sampleId: sample.id,
    action: "exported_to_dropzone",
  };
}

export async function revealLocalTokenizedPath(tokenizedPath: string): Promise<LocalRevealResult> {
  await requireLocalOwnerActionEntitlement();
  const absolutePath = resolveLocalActionPath(tokenizedPath);
  const revealTarget = await resolveRevealTarget(absolutePath);

  try {
    await revealPathInOs(revealTarget);
  } catch {
    throw new AISUserSafeError("Unable to reveal the local path from this server environment.", "local_reveal_failed", 503);
  }

  await logLocalUsageEvent({
    type: "local_path_revealed",
    sourceSurface: "browse",
    tokenizedPath: tokenizePath(revealTarget),
    metadata: {
      action: "reveal",
    },
  });

  return {
    tokenizedPath: tokenizePath(revealTarget),
    revealed: true,
    action: "revealed",
  };
}

export async function getAbsoluteLocalPathForCopy(tokenizedPath: string): Promise<LocalCopyPathResult> {
  await requireLocalOwnerActionEntitlement();
  const absolutePath = resolveLocalActionPath(tokenizedPath);
  await assertPathExists(absolutePath, "local_path_not_found");
  await logLocalUsageEvent({
    type: "local_path_copied",
    sourceSurface: "browse",
    tokenizedPath: tokenizePath(absolutePath),
    metadata: {
      action: "copy_path",
    },
  });

  // Copy path is the only local action allowed to return an absolute path.
  return {
    tokenizedPath: tokenizePath(absolutePath),
    absolutePath,
    action: "copy_path",
  };
}

export function buildLocalExportFilename(sample: Pick<LocalSampleRow, "id" | "poetic_name" | "bpm" | "musical_key">) {
  const poeticName = sanitizeFilename(sample.poetic_name) || "ais_sample";
  const bpm = sample.bpm ? `${Math.round(sample.bpm)}bpm` : "no_bpm";
  const musicalKey = sample.musical_key ? sanitizeFilename(sample.musical_key.toLowerCase()) : "no_key";
  const sampleIdShort = sanitizeFilename(sample.id.replaceAll("-", "").slice(0, 8));

  return `${poeticName}__${bpm}__${musicalKey || "no_key"}__${sampleIdShort}__ais.wav`;
}

async function requireLocalOwnerDownloadEntitlement(
  supabase: SupabaseDatabaseClient,
): Promise<EntitlementState & { userId: string }> {
  return requireLocalOwnerWorkflowEntitlementForSupabase(supabase);
}

async function requireLocalOwnerActionEntitlement() {
  const supabase = await createSupabaseServerClient();
  await requireLocalOwnerDownloadEntitlement(supabase);
}

async function requireLocalOwnerWorkflowEntitlementForSupabase(
  supabase: SupabaseDatabaseClient,
): Promise<EntitlementState & { userId: string }> {
  const entitlement = await getEntitlementForCurrentUser(supabase);

  if (entitlement.accessMode !== "local_owner" || getAccessMode() !== "local_owner") {
    throw new AISUserSafeError("Local workflow actions are only available in Local Producer Mode.", "local_owner_only", 403);
  }

  if (!entitlement.isAuthenticated || !entitlement.userId) {
    throw new AISUserSafeError("You must be signed in to export originals locally.", "not_authenticated", 401);
  }

  if (!entitlement.isAdmin && entitlement.subscriptionStatus !== "lifetime_granted") {
    throw new AISUserSafeError("Local workflow actions are only available to the local owner.", "local_owner_only", 403);
  }

  if (!entitlement.canDownloadOriginal) {
    throw new AISUserSafeError("Your account cannot download original WAV files.", "not_entitled", 403);
  }

  return entitlement as EntitlementState & { userId: string };
}

async function loadPublishedSampleAndOriginalAsset(
  sampleId: string,
  supabase: SupabaseDatabaseClient,
): Promise<[LocalSampleRow, OriginalAssetRow]> {
  const [{ data: sample, error: sampleError }, { data: originalAsset, error: assetError }] = await Promise.all([
    supabase
      .from("samples")
      .select("id,poetic_name,bpm,musical_key,status,archived_at")
      .eq("id", sampleId)
      .maybeSingle(),
    supabase
      .from("sample_assets")
      .select("bucket,object_path,kind,access_level")
      .eq("sample_id", sampleId)
      .eq("kind", "original_wav")
      .maybeSingle(),
  ]);

  if (sampleError) {
    throw new AISUserSafeError("Unable to load sample for local export.", "local_export_sample_lookup_failed", 500);
  }

  if (!sample) {
    throw new AISUserSafeError("Sample was not found.", "sample_not_found", 404);
  }

  if (sample.status === "archived" || sample.archived_at) {
    throw new AISUserSafeError("Sample is archived.", "sample_archived", 410);
  }

  if (sample.status !== "published") {
    throw new AISUserSafeError("Sample was not found.", "sample_not_found", 404);
  }

  if (assetError) {
    throw new AISUserSafeError("Unable to load original WAV asset.", "original_asset_lookup_failed", 500);
  }

  if (!originalAsset) {
    throw new AISUserSafeError("Published sample has no original WAV asset.", "original_asset_missing", 409);
  }

  return [sample as LocalSampleRow, originalAsset as OriginalAssetRow];
}

async function reserveCollisionSafeDestination(directory: string, filename: string) {
  const parsed = path.parse(filename);

  // Append a numeric suffix such as _(1) without overwriting existing exports.
  for (let index = 0; index < 1000; index += 1) {
    const candidateFilename = index === 0 ? filename : `${parsed.name}_(${index})${parsed.ext}`;
    const candidatePath = path.join(directory, candidateFilename);

    try {
      const handle = await open(candidatePath, "wx");
      await handle.close();
      return candidatePath;
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        continue;
      }

      throw new AISUserSafeError("Unable to reserve a dropzone export path.", "local_export_destination_failed", 500);
    }
  }

  throw new AISUserSafeError("Too many matching files already exist in the dropzone.", "local_export_collision_limit", 409);
}

async function cleanupReservedDestination(destinationPath: string) {
  await Promise.all([
    rm(destinationPath, { force: true }).catch(() => undefined),
    rm(`${destinationPath}.tmp`, { force: true }).catch(() => undefined),
  ]);
}

function resolveLocalActionPath(tokenizedPath: string) {
  try {
    return resolveTokenizedPath(tokenizedPath);
  } catch {
    throw new AISUserSafeError("Local action path is invalid.", "invalid_local_path", 400);
  }
}

async function resolveRevealTarget(absolutePath: string) {
  await assertPathExists(absolutePath, "local_path_not_found");

  try {
    const stats = await stat(absolutePath);
    return stats.isDirectory() ? absolutePath : path.dirname(absolutePath);
  } catch {
    throw new AISUserSafeError("Local path does not exist.", "local_path_not_found", 404);
  }
}

async function assertPathExists(absolutePath: string, code: string) {
  try {
    await access(absolutePath, constants.F_OK);
  } catch {
    throw new AISUserSafeError("Local path does not exist.", code, 404);
  }
}

async function revealPathInOs(absolutePath: string) {
  if (process.platform === "darwin") {
    await execFileAsync("open", [absolutePath]);
    return;
  }

  if (process.platform === "win32") {
    await execFileAsync("explorer", [absolutePath]);
    return;
  }

  await execFileAsync("xdg-open", [absolutePath]);
}

async function logLocalExportDownload(
  sampleId: string,
  entitlement: EntitlementState,
  supabase: SupabaseDatabaseClient,
  request?: NextRequest,
) {
  const { error } = await supabase.from("downloads").insert({
    sample_id: sampleId,
    user_id: entitlement.userId,
    source: LOCAL_DOWNLOAD_SOURCE,
    subscription_state_at_download: entitlement.subscriptionStatus,
    file_version: "original_wav",
    user_agent: request?.headers.get("user-agent") ?? null,
    ip: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
  });

  if (error) {
    throw new AISUserSafeError("Unable to log local export event.", "local_export_log_failed", 500);
  }
}

function toLocalExportStorageError(error: unknown) {
  if (error instanceof AISUserSafeError) {
    return error;
  }

  return new AISUserSafeError("Unable to materialize the original WAV in the dropzone.", "local_export_storage_failed", 500);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
