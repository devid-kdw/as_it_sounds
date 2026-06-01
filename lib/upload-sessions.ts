import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/types/database.types";
import type {
  UploadSessionCreateRequest,
  UploadSessionCreateResponse,
  UploadSessionFinalizeRequest,
  UploadSessionFinalizeResponse,
} from "@/types/api";
import { AISUserSafeError } from "@/lib/errors";
import type {
  PublicTableInsert,
  PublicTableRow,
  PublicTableUpdate,
  SupabaseDatabaseClient,
} from "@/lib/supabase/admin";
import type { StorageProvider } from "@/lib/storage";
import { poeticNameSchema } from "@/lib/validators";

export const UPLOAD_SESSION_BUCKET = "ais-processing-temp";
export const UPLOAD_SESSION_URL_TTL_SECONDS = 15 * 60;
export const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;

export const WAV_CONTENT_TYPES = [
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/vnd.wave",
] as const;

type UploadSessionActor = {
  userId: string;
};

type UploadSessionServiceOptions = {
  supabase?: SupabaseDatabaseClient;
  storage?: StorageProvider;
  now?: () => Date;
  idFactory?: () => string;
};

type ProcessingJobRow = PublicTableRow<"processing_jobs">;
type SampleRow = PublicTableRow<"samples">;
type UploadSampleStatus = Pick<SampleRow, "id" | "status">;

const uploadSessionCreateSchema = z
  .object({
    mode: z.enum(["single", "bulk"]),
    filename: z.string().trim().min(1).max(255),
    content_type: z.string().trim().toLowerCase(),
    file_size_bytes: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES),
    category_slug: poeticNameSchema,
    sample_type_slug: poeticNameSchema,
    bpm: z.number().positive().max(400).nullable().optional(),
    batch_id: z.string().uuid().nullable().optional(),
    bulk_position: z.number().int().positive().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (!isWavFilename(value.filename)) {
      context.addIssue({
        code: "custom",
        path: ["filename"],
        message: "Only .wav files are supported.",
      });
    }

    if (!isSafeDeclaredFilename(value.filename)) {
      context.addIssue({
        code: "custom",
        path: ["filename"],
        message: "Filename must not include path separators or control characters.",
      });
    }

    if (!isWavContentType(value.content_type)) {
      context.addIssue({
        code: "custom",
        path: ["content_type"],
        message: "Only WAV content types are supported.",
      });
    }

    if (value.sample_type_slug === "loop" && !value.bpm) {
      context.addIssue({
        code: "custom",
        path: ["bpm"],
        message: "Loop uploads require BPM at draft creation time.",
      });
    }

    if (value.mode === "single" && (value.batch_id || value.bulk_position)) {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Single upload sessions cannot include bulk batch fields.",
      });
    }

    if (value.mode === "bulk" && (!value.batch_id || !value.bulk_position)) {
      context.addIssue({
        code: "custom",
        path: ["batch_id"],
        message: "Bulk upload sessions require a batch ID and position.",
      });
    }
  });

const uploadSessionFinalizeSchema = z
  .object({
    mode: z.literal("single").optional(),
    sample_id: z.string().uuid(),
    processing_job_id: z.string().uuid(),
  })
  .strict();

export function parseUploadSessionCreateRequest(payload: unknown): UploadSessionCreateRequest {
  const parsed = uploadSessionCreateSchema.safeParse(payload);

  if (!parsed.success) {
    throw new AISUserSafeError(
      parsed.error.issues[0]?.message ?? "Invalid upload session request.",
      "invalid_upload_session_request",
      400,
    );
  }

  return parsed.data;
}

export function parseUploadSessionFinalizeRequest(payload: unknown): UploadSessionFinalizeRequest {
  const parsed = uploadSessionFinalizeSchema.safeParse(payload);

  if (!parsed.success) {
    throw new AISUserSafeError(
      parsed.error.issues[0]?.message ?? "Invalid upload finalize request.",
      "invalid_upload_finalize_request",
      400,
    );
  }

  return parsed.data;
}

export async function createSingleUploadSession(
  request: UploadSessionCreateRequest,
  actor: UploadSessionActor,
  options: UploadSessionServiceOptions = {},
): Promise<UploadSessionCreateResponse> {
  if (request.mode !== "single") {
    throw new AISUserSafeError("Only single upload sessions are supported here.", "unsupported_upload_session_mode", 400);
  }

  const supabase = await getSupabase(options);
  const storage = await getStorage(options);
  const sampleId = createId(options);
  const processingJobId = createId(options);
  const uploadPath = buildUploadSessionPath(sampleId, processingJobId);
  const uploadRef = {
    bucket: UPLOAD_SESSION_BUCKET,
    objectPath: uploadPath,
  };

  await assertActiveTaxonomy(supabase, request);

  const signedUpload = await storage.createSignedUploadUrl(
    uploadRef,
    UPLOAD_SESSION_URL_TTL_SECONDS,
    { upsert: false },
  );

  const { error: sampleError } = await supabase.from("samples").insert({
    id: sampleId,
    poetic_name: buildDraftPoeticName(sampleId),
    display_title: "Draft Upload",
    display_title_is_custom: false,
    category_slug: request.category_slug,
    sample_type_slug: request.sample_type_slug,
    bpm: request.bpm ?? null,
    loopable: request.sample_type_slug === "loop",
    status: "draft",
    license_status: "unverified",
    source_type: "original_recording",
    commercial_use_allowed: true,
    redistribution_allowed: false,
    attribution_required: false,
    is_melodic: false,
    unknown_key_confirmed: false,
    uploaded_by: actor.userId,
  } satisfies PublicTableInsert<"samples">);

  if (sampleError) {
    throw new AISUserSafeError("Unable to create the draft sample.", "upload_sample_create_failed", 500);
  }

  const { error: jobError } = await supabase.from("processing_jobs").insert({
    id: processingJobId,
    sample_id: sampleId,
    job_type: "initial_upload",
    status: "queued",
    input_bucket: uploadRef.bucket,
    input_path: uploadRef.objectPath,
    metadata: {
      upload_mode: "single",
      upload_session_id: processingJobId,
      original_filename: request.filename,
      declared_content_type: request.content_type,
      declared_file_size_bytes: request.file_size_bytes,
      created_by: actor.userId,
    },
  } satisfies PublicTableInsert<"processing_jobs">);

  if (jobError) {
    throw new AISUserSafeError("Unable to create the processing job.", "upload_processing_job_create_failed", 500);
  }

  return {
    sample_id: sampleId,
    processing_job_id: processingJobId,
    upload_bucket: signedUpload.bucket,
    upload_path: signedUpload.objectPath,
    signed_upload: {
      url: signedUpload.url,
      token: signedUpload.token ?? null,
      expires_at: signedUpload.expiresAt ?? getSignedUploadExpiresAt(options.now?.() ?? new Date()),
    },
  };
}

export async function finalizeSingleUploadSession(
  request: UploadSessionFinalizeRequest,
  actor: UploadSessionActor,
  options: UploadSessionServiceOptions = {},
): Promise<UploadSessionFinalizeResponse> {
  const supabase = await getSupabase(options);
  const job = await getUploadProcessingJob(supabase, request.processing_job_id);

  if (job.sample_id !== request.sample_id) {
    throw new AISUserSafeError("Upload session does not match the requested sample.", "upload_session_sample_mismatch", 409);
  }

  assertSingleUploadJob(job);

  const uploadRef = {
    bucket: job.input_bucket,
    objectPath: job.input_path,
  };
  const uploadExists =
    job.status === "queued" ? await (await getStorage(options)).exists(uploadRef) : true;

  if (!uploadExists) {
    throw new AISUserSafeError("Uploaded source file was not found.", "upload_source_missing", 409);
  }

  const sample = await getUploadSample(supabase, job.sample_id);
  const finalizedAt = getExistingStringMetadata(job.metadata, "upload_finalized_at") ?? getNowIso(options);
  const metadata = mergeUploadMetadata(job.metadata, {
    upload_finalized_at: finalizedAt,
    upload_finalized_by: actor.userId,
  });
  const update: PublicTableUpdate<"processing_jobs"> = {
    metadata,
  };
  const { data: updatedJob, error: updateError } = await supabase
    .from("processing_jobs")
    .update(update)
    .eq("id", job.id)
    .select("*")
    .single();

  if (updateError) {
    throw new AISUserSafeError("Unable to finalize the upload session.", "upload_session_finalize_failed", 500);
  }

  return {
    sample_id: job.sample_id,
    processing_job_id: job.id,
    processing_status: updatedJob.status,
    sample_processing_status: sample.status,
    finalized: true,
  };
}

export function buildUploadSessionPath(sampleId: string, uploadSessionId: string) {
  return `intake/${sampleId}/${uploadSessionId}/source.wav`;
}

export function getSignedUploadExpiresAt(now = new Date()) {
  return new Date(now.getTime() + UPLOAD_SESSION_URL_TTL_SECONDS * 1000).toISOString();
}

export function isWavFilename(filename: string) {
  return /\.wav$/i.test(filename.trim());
}

export function isWavContentType(contentType: string) {
  return WAV_CONTENT_TYPES.includes(contentType.trim().toLowerCase() as (typeof WAV_CONTENT_TYPES)[number]);
}

export function isSafeDeclaredFilename(filename: string) {
  const trimmed = filename.trim();
  return Boolean(trimmed) && !/[\\/]/.test(trimmed) && !/[\u0000-\u001f\u007f]/.test(trimmed);
}

async function assertActiveTaxonomy(
  supabase: SupabaseDatabaseClient,
  request: Pick<UploadSessionCreateRequest, "category_slug" | "sample_type_slug">,
) {
  const [{ data: category, error: categoryError }, { data: sampleType, error: sampleTypeError }] = await Promise.all([
    supabase
      .from("categories")
      .select("slug")
      .eq("slug", request.category_slug)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("sample_types")
      .select("slug")
      .eq("slug", request.sample_type_slug)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (categoryError || sampleTypeError) {
    throw new AISUserSafeError("Unable to validate upload taxonomy.", "upload_taxonomy_lookup_failed", 500);
  }

  if (!category) {
    throw new AISUserSafeError("Upload category is not available.", "invalid_upload_category", 400);
  }

  if (!sampleType) {
    throw new AISUserSafeError("Upload sample type is not available.", "invalid_upload_sample_type", 400);
  }
}

async function getUploadProcessingJob(supabase: SupabaseDatabaseClient, processingJobId: string) {
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("*")
    .eq("id", processingJobId)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load the upload session.", "upload_session_lookup_failed", 500);
  }

  if (!data) {
    throw new AISUserSafeError("Upload session was not found.", "upload_session_not_found", 404);
  }

  return data;
}

async function getUploadSample(supabase: SupabaseDatabaseClient, sampleId: string): Promise<UploadSampleStatus> {
  const { data, error } = await supabase
    .from("samples")
    .select("id,status")
    .eq("id", sampleId)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load the upload sample.", "upload_sample_lookup_failed", 500);
  }

  if (!data) {
    throw new AISUserSafeError("Upload sample was not found.", "upload_sample_not_found", 404);
  }

  return data;
}

function assertSingleUploadJob(
  job: ProcessingJobRow,
): asserts job is ProcessingJobRow & { sample_id: string; input_bucket: string; input_path: string } {
  if (job.job_type !== "initial_upload") {
    throw new AISUserSafeError("Upload session is not an initial upload job.", "invalid_upload_processing_job", 409);
  }

  if (!job.sample_id || !job.input_bucket || !job.input_path) {
    throw new AISUserSafeError("Upload session is missing intake storage details.", "invalid_upload_session_storage", 409);
  }

  if (job.input_bucket !== UPLOAD_SESSION_BUCKET || !job.input_path.startsWith(`intake/${job.sample_id}/`)) {
    throw new AISUserSafeError("Upload session intake storage is invalid.", "invalid_upload_session_storage", 409);
  }

  if (!["queued", "running", "succeeded"].includes(job.status)) {
    throw new AISUserSafeError("Upload processing is not in a finalizable state.", "upload_processing_not_finalizable", 409);
  }
}

function buildDraftPoeticName(sampleId: string) {
  return `draft_upload_${sampleId.replaceAll("-", "").slice(0, 24)}`;
}

function createId(options: UploadSessionServiceOptions) {
  return options.idFactory?.() ?? randomUUID();
}

function getExistingStringMetadata(metadata: Json, key: string) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function mergeUploadMetadata(existingMetadata: Json, metadataPatch: Record<string, Json | undefined>): Json {
  const existing =
    typeof existingMetadata === "object" && existingMetadata !== null && !Array.isArray(existingMetadata)
      ? existingMetadata
      : {};
  const merged: Record<string, Json> = {};

  for (const [key, value] of Object.entries(existing)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  for (const [key, value] of Object.entries(metadataPatch)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
}

async function getSupabase(options: UploadSessionServiceOptions) {
  if (options.supabase) {
    return options.supabase;
  }

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  return createSupabaseAdminClient();
}

async function getStorage(options: UploadSessionServiceOptions) {
  if (options.storage) {
    return options.storage;
  }

  const { createDefaultStorageProvider } = await import("@/lib/storage");
  return createDefaultStorageProvider();
}

function getNowIso(options: UploadSessionServiceOptions) {
  return (options.now?.() ?? new Date()).toISOString();
}
