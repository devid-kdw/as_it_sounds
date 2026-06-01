import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/types/database.types";
import type {
  BulkUploadFinalizeRequest,
  BulkUploadFinalizeResponse,
  BulkUploadStatusResponse,
  UploadSessionBatchItemResponse,
  UploadSessionCreateRequest,
  UploadSessionCreateResponse,
  UploadSessionFinalizeRequest,
  UploadSessionFinalizeResponse,
  UploadSessionsCreateRequest,
  UploadSessionsCreateResponse,
} from "@/types/api";
import { AISUserSafeError, getPipelineErrorDefinition } from "@/lib/errors";
import type {
  PublicTableInsert,
  PublicTableRow,
  PublicTableUpdate,
  SupabaseDatabaseClient,
} from "@/lib/supabase/admin";
import type { StorageProvider } from "@/lib/storage";
import { bulkIntakeUploadRef } from "@/lib/storage-paths";
import { poeticNameSchema } from "@/lib/validators";
import { tryWriteAdminAuditLog } from "@/lib/admin-audit";

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
    mode: z.literal("single"),
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

    if (value.batch_id || value.bulk_position) {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Single upload sessions cannot include bulk batch fields.",
      });
    }
  });

const uploadSessionFileSchema = z.preprocess(
  normalizeUploadSessionFilePayload,
  z
    .object({
      client_file_id: z.string().trim().min(1).max(160).nullable().optional(),
      filename: z.string().trim().min(1).max(255),
      content_type: z.string().trim().toLowerCase(),
      file_size_bytes: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES),
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
    }),
);

const uploadSessionsCreateSchema = z.preprocess(
  normalizeUploadSessionsCreatePayload,
  z
    .object({
      mode: z.enum(["single", "bulk"]),
      files: z.array(uploadSessionFileSchema).min(1).max(100),
      initial_category_slug: poeticNameSchema,
      initial_sample_type_slug: poeticNameSchema,
      initial_bpm: z.number().positive().max(400).nullable().optional(),
      album_id: z.string().uuid().nullable().optional(),
    })
    .superRefine((value, context) => {
      if (value.mode === "single" && value.files.length !== 1) {
        context.addIssue({
          code: "custom",
          path: ["files"],
          message: "Single upload session requests must include exactly one file.",
        });
      }

      if (value.mode === "bulk" && value.initial_sample_type_slug === "loop" && !value.initial_bpm) {
        context.addIssue({
          code: "custom",
          path: ["initial_bpm"],
          message: "Bulk loop uploads require an initial BPM.",
        });
      }
    }),
);

const uploadSessionFinalizeSchema = z
  .object({
    mode: z.literal("single").optional(),
    sample_id: z.string().uuid(),
    processing_job_id: z.string().uuid(),
  })
  .strict();

const bulkUploadFinalizeSchema = z
  .object({
    batch_id: z.string().uuid(),
    processing_job_ids: z.array(z.string().uuid()).max(100).optional(),
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

export function parseUploadSessionsCreateRequest(payload: unknown): UploadSessionsCreateRequest {
  const parsed = uploadSessionsCreateSchema.safeParse(payload);

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

export function parseBulkUploadFinalizeRequest(payload: unknown): BulkUploadFinalizeRequest {
  const parsed = bulkUploadFinalizeSchema.safeParse(payload);

  if (!parsed.success) {
    throw new AISUserSafeError(
      parsed.error.issues[0]?.message ?? "Invalid bulk finalize request.",
      "invalid_bulk_upload_finalize_request",
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
    await cleanupUploadSessionRows(supabase, sampleId);
    throw new AISUserSafeError("Unable to create the processing job.", "upload_processing_job_create_failed", 500);
  }

  let signedUpload;

  try {
    signedUpload = await storage.createSignedUploadUrl(
      uploadRef,
      UPLOAD_SESSION_URL_TTL_SECONDS,
      { upsert: false },
    );
  } catch {
    await cleanupUploadSessionRows(supabase, sampleId);
    throw new AISUserSafeError("Unable to create the signed upload URL.", "upload_signed_url_create_failed", 500);
  }

  await tryWriteAdminAuditLog(supabase, {
    actorUserId: actor.userId,
    action: "upload_session.create",
    entityType: "sample",
    entityId: sampleId,
    afterData: {
      processing_job_id: processingJobId,
      mode: "single",
      upload_bucket: uploadRef.bucket,
    },
  });

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

export async function createUploadSessions(
  request: UploadSessionsCreateRequest,
  actor: UploadSessionActor,
  options: UploadSessionServiceOptions = {},
): Promise<UploadSessionsCreateResponse> {
  if (request.mode === "single") {
    const file = request.files[0];

    if (!file) {
      throw new AISUserSafeError("Single upload session requests require one file.", "invalid_upload_session_request", 400);
    }

    const session = await createSingleUploadSession(
      {
        mode: "single",
        filename: file.filename,
        content_type: file.content_type,
        file_size_bytes: file.file_size_bytes,
        category_slug: request.initial_category_slug,
        sample_type_slug: request.initial_sample_type_slug,
        bpm: request.initial_bpm ?? null,
      },
      actor,
      options,
    );

    return {
      batch_id: null,
      sessions: [
        {
          ...session,
          client_file_id: file.client_file_id ?? null,
          bulk_position: 1,
          original_filename: file.filename,
        },
      ],
    };
  }

  return createBulkUploadSessions(request, actor, options);
}

export async function createBulkUploadSessions(
  request: UploadSessionsCreateRequest,
  actor: UploadSessionActor,
  options: UploadSessionServiceOptions = {},
): Promise<UploadSessionsCreateResponse> {
  if (request.mode !== "bulk") {
    throw new AISUserSafeError("Bulk upload session creation requires mode bulk.", "unsupported_upload_session_mode", 400);
  }

  const supabase = await getSupabase(options);
  const storage = await getStorage(options);
  const batchId = createId(options);
  const sampleIds: string[] = [];

  await assertActiveTaxonomy(supabase, {
    category_slug: request.initial_category_slug,
    sample_type_slug: request.initial_sample_type_slug,
  });

  if (request.album_id) {
    await assertAlbumExists(supabase, request.album_id);
  }

  const sessionRows: Array<{
    response: Omit<UploadSessionBatchItemResponse, "signed_upload" | "upload_bucket" | "upload_path">;
    uploadRef: { bucket: string; objectPath: string };
  }> = [];

  try {
    for (const [index, file] of request.files.entries()) {
      const bulkPosition = index + 1;
      const sampleId = createId(options);
      const processingJobId = createId(options);
      const uploadRef = bulkIntakeUploadRef({ batchId, sampleId });
      sampleIds.push(sampleId);

      const { error: sampleError } = await supabase.from("samples").insert({
        id: sampleId,
        poetic_name: buildDraftPoeticName(sampleId),
        display_title: `Draft Upload ${bulkPosition}`,
        display_title_is_custom: false,
        category_slug: request.initial_category_slug,
        sample_type_slug: request.initial_sample_type_slug,
        bpm: request.initial_bpm ?? null,
        loopable: request.initial_sample_type_slug === "loop",
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
        throw new AISUserSafeError("Unable to create a draft sample.", "upload_sample_create_failed", 500);
      }

      const { error: jobError } = await supabase.from("processing_jobs").insert({
        id: processingJobId,
        sample_id: sampleId,
        job_type: "initial_upload",
        status: "queued",
        input_bucket: uploadRef.bucket,
        input_path: uploadRef.objectPath,
        metadata: {
          upload_mode: "bulk",
          upload_session_id: processingJobId,
          batch_id: batchId,
          client_file_id: file.client_file_id ?? null,
          original_filename: file.filename,
          bulk_position: bulkPosition,
          shared_metadata_applied: false,
          declared_content_type: file.content_type,
          declared_file_size_bytes: file.file_size_bytes,
          initial_bpm: request.initial_bpm ?? null,
          created_by: actor.userId,
        },
      } satisfies PublicTableInsert<"processing_jobs">);

      if (jobError) {
        throw new AISUserSafeError("Unable to create a processing job.", "upload_processing_job_create_failed", 500);
      }

      if (request.album_id) {
        const { error: albumSampleError } = await supabase.from("album_samples").insert({
          album_id: request.album_id,
          sample_id: sampleId,
          sort_order: bulkPosition,
        } satisfies PublicTableInsert<"album_samples">);

        if (albumSampleError) {
          throw new AISUserSafeError("Unable to assign a bulk upload sample to the album.", "bulk_album_assign_failed", 500);
        }
      }

      sessionRows.push({
        response: {
          sample_id: sampleId,
          processing_job_id: processingJobId,
          client_file_id: file.client_file_id ?? null,
          bulk_position: bulkPosition,
          original_filename: file.filename,
        },
        uploadRef,
      });
    }

    const sessions: UploadSessionBatchItemResponse[] = [];

    for (const row of sessionRows) {
      const signedUpload = await storage.createSignedUploadUrl(
        row.uploadRef,
        UPLOAD_SESSION_URL_TTL_SECONDS,
        { upsert: false },
      );

      sessions.push({
        ...row.response,
        upload_bucket: signedUpload.bucket,
        upload_path: signedUpload.objectPath,
        signed_upload: {
          url: signedUpload.url,
          token: signedUpload.token ?? null,
          expires_at: signedUpload.expiresAt ?? getSignedUploadExpiresAt(options.now?.() ?? new Date()),
        },
      });
    }

    await tryWriteAdminAuditLog(supabase, {
      actorUserId: actor.userId,
      action: "upload_session.create_bulk",
      entityType: "processing_job",
      entityId: null,
      afterData: {
        mode: "bulk",
        batch_id: batchId,
        session_count: sessions.length,
        album_id: request.album_id ?? null,
        upload_bucket: UPLOAD_SESSION_BUCKET,
      },
    });

    return {
      batch_id: batchId,
      sessions,
    };
  } catch (error) {
    await cleanupUploadSessionRows(supabase, sampleIds);

    if (error instanceof AISUserSafeError) {
      throw error;
    }

    throw new AISUserSafeError("Unable to create the bulk upload sessions.", "bulk_upload_session_create_failed", 500);
  }
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

  await tryWriteAdminAuditLog(supabase, {
    actorUserId: actor.userId,
    action: "upload_session.finalize",
    entityType: "processing_job",
    entityId: job.id,
    beforeData: {
      status: job.status,
      upload_finalized_at: getExistingStringMetadata(job.metadata, "upload_finalized_at"),
    },
    afterData: {
      status: updatedJob.status,
      upload_finalized_at: finalizedAt,
      sample_id: job.sample_id,
    },
  });

  return {
    sample_id: job.sample_id,
    processing_job_id: job.id,
    processing_status: updatedJob.status,
    sample_processing_status: sample.status,
    finalized: true,
  };
}

export async function finalizeBulkUploadSessions(
  request: BulkUploadFinalizeRequest,
  actor: UploadSessionActor,
  options: UploadSessionServiceOptions = {},
): Promise<BulkUploadFinalizeResponse> {
  const supabase = await getSupabase(options);
  const storage = await getStorage(options);
  let query = supabase
    .from("processing_jobs")
    .select("*")
    .eq("job_type", "initial_upload")
    .contains("metadata", { batch_id: request.batch_id });

  if (request.processing_job_ids?.length) {
    query = query.in("id", request.processing_job_ids);
  }

  const { data: jobs, error } = await query.order("created_at", { ascending: true });

  if (error) {
    throw new AISUserSafeError("Unable to load the bulk upload session.", "bulk_upload_lookup_failed", 500);
  }

  const safeJobs = jobs ?? [];

  if (safeJobs.length === 0) {
    throw new AISUserSafeError("Bulk upload session was not found.", "bulk_upload_not_found", 404);
  }

  const finalized: UploadSessionFinalizeResponse[] = [];

  for (const job of safeJobs) {
    assertSingleUploadJob(job);

    const uploadExists =
      job.status === "queued"
        ? await storage.exists({ bucket: job.input_bucket, objectPath: job.input_path }).catch(() => false)
        : true;

    if (!uploadExists) {
      continue;
    }

    const sample = await getUploadSample(supabase, job.sample_id);
    const finalizedAt = getExistingStringMetadata(job.metadata, "upload_finalized_at") ?? getNowIso(options);
    const metadata = mergeUploadMetadata(job.metadata, {
      upload_finalized_at: finalizedAt,
      upload_finalized_by: actor.userId,
    });
    const { data: updatedJob, error: updateError } = await supabase
      .from("processing_jobs")
      .update({ metadata } satisfies PublicTableUpdate<"processing_jobs">)
      .eq("id", job.id)
      .select("*")
      .single();

    if (updateError) {
      throw new AISUserSafeError("Unable to finalize a bulk upload row.", "bulk_upload_finalize_failed", 500);
    }

    finalized.push({
      sample_id: job.sample_id,
      processing_job_id: job.id,
      processing_status: updatedJob.status,
      sample_processing_status: sample.status,
      finalized: true,
    });
  }

  await tryWriteAdminAuditLog(supabase, {
    actorUserId: actor.userId,
    action: "upload_session.finalize_bulk",
    entityType: "processing_job",
    entityId: null,
    afterData: {
      batch_id: request.batch_id,
      requested_count: safeJobs.length,
      finalized_count: finalized.length,
    },
  });

  return {
    batch_id: request.batch_id,
    finalized_count: finalized.length,
    sessions: finalized,
  };
}

export async function getBulkUploadStatus(
  batchId: string,
  options: UploadSessionServiceOptions = {},
): Promise<BulkUploadStatusResponse> {
  const supabase = await getSupabase(options);
  const { data: jobs, error } = await supabase
    .from("processing_jobs")
    .select("*")
    .eq("job_type", "initial_upload")
    .contains("metadata", { batch_id: batchId })
    .order("created_at", { ascending: true });

  if (error) {
    throw new AISUserSafeError("Unable to load bulk upload status.", "bulk_upload_status_failed", 500);
  }

  const safeJobs = jobs ?? [];

  if (safeJobs.length === 0) {
    throw new AISUserSafeError("Bulk upload session was not found.", "bulk_upload_not_found", 404);
  }

  const sampleIds = safeJobs
    .map((job) => job.sample_id)
    .filter((sampleId): sampleId is string => Boolean(sampleId));
  const [samplesResult, assetsResult] = await Promise.all([
    supabase.from("samples").select("id,status").in("id", sampleIds),
    supabase.from("sample_assets").select("sample_id,kind,access_level").in("sample_id", sampleIds),
  ]);

  if (samplesResult.error || assetsResult.error) {
    throw new AISUserSafeError("Unable to load bulk upload row details.", "bulk_upload_status_failed", 500);
  }

  const samplesById = new Map((samplesResult.data ?? []).map((sample) => [sample.id, sample]));
  const assetsBySample = groupAssetsBySample(assetsResult.data ?? []);

  return {
    batch_id: batchId,
    rows: safeJobs.map((job) => {
      assertSingleUploadJob(job);
      const sample = samplesById.get(job.sample_id);
      const retryEligibility = getRetryEligibility(job);

      return {
        batch_id: batchId,
        client_file_id: getExistingStringMetadata(job.metadata, "client_file_id"),
        bulk_position: getExistingNumberMetadata(job.metadata, "bulk_position"),
        original_filename: getExistingStringMetadata(job.metadata, "original_filename"),
        sample_id: job.sample_id,
        processing_job_id: job.id,
        upload_finalized_at: getExistingStringMetadata(job.metadata, "upload_finalized_at"),
        processing_status: job.status,
        sample_status: sample?.status ?? "draft",
        job_type: job.job_type,
        attempts: job.attempts,
        max_attempts: job.max_attempts,
        retry_eligible: retryEligibility.eligible,
        retry_reason: retryEligibility.reason,
        last_error_code: job.last_error_code,
        last_error_message: job.last_error_message,
        duplicate_check: getExistingMetadataValue(job.metadata, "duplicate_check"),
        warnings: getExistingMetadataValue(job.metadata, "warnings"),
        asset_status: buildAssetStatusRows(assetsBySample.get(job.sample_id) ?? []),
        created_at: job.created_at,
        updated_at: job.updated_at,
        started_at: job.started_at,
        finished_at: job.finished_at,
      };
    }),
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

async function assertAlbumExists(supabase: SupabaseDatabaseClient, albumId: string) {
  const { data, error } = await supabase
    .from("albums")
    .select("id")
    .eq("id", albumId)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to validate the upload album.", "upload_album_lookup_failed", 500);
  }

  if (!data) {
    throw new AISUserSafeError("Upload album was not found.", "upload_album_not_found", 404);
  }
}

async function cleanupUploadSessionRows(supabase: SupabaseDatabaseClient, sampleId: string | string[]) {
  const sampleIds = Array.isArray(sampleId) ? sampleId : [sampleId];

  if (sampleIds.length === 0) {
    return;
  }

  await supabase.from("samples").delete().in("id", sampleIds);
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

function getExistingNumberMetadata(metadata: Json, key: string) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[key];
  return typeof value === "number" ? value : null;
}

function getExistingMetadataValue(metadata: Json, key: string): Json | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[key];
  return value === undefined ? null : value;
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

function normalizeUploadSessionFilePayload(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;

  return {
    client_file_id: record.client_file_id ?? record.clientFileId ?? null,
    filename: record.filename,
    content_type: record.content_type ?? record.contentType,
    file_size_bytes: record.file_size_bytes ?? record.fileSizeBytes,
  };
}

function normalizeUploadSessionsCreatePayload(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;

  if (Array.isArray(record.files)) {
    return {
      mode: record.mode,
      files: record.files,
      initial_category_slug: record.initial_category_slug ?? record.initialCategorySlug,
      initial_sample_type_slug: record.initial_sample_type_slug ?? record.initialSampleTypeSlug,
      initial_bpm: record.initial_bpm ?? record.initialBpm ?? null,
      album_id: record.album_id ?? record.albumId ?? null,
    };
  }

  if ("filename" in record) {
    return {
      mode: record.mode,
      files: [
        {
          filename: record.filename,
          content_type: record.content_type ?? record.contentType,
          file_size_bytes: record.file_size_bytes ?? record.fileSizeBytes,
        },
      ],
      initial_category_slug: record.category_slug ?? record.initial_category_slug ?? record.initialCategorySlug,
      initial_sample_type_slug: record.sample_type_slug ?? record.initial_sample_type_slug ?? record.initialSampleTypeSlug,
      initial_bpm: record.bpm ?? record.initial_bpm ?? record.initialBpm ?? null,
      album_id: record.album_id ?? record.albumId ?? null,
    };
  }

  return value;
}

function groupAssetsBySample(
  assets: Array<Pick<PublicTableRow<"sample_assets">, "sample_id" | "kind" | "access_level">>,
) {
  const grouped = new Map<string, Array<Pick<PublicTableRow<"sample_assets">, "kind" | "access_level">>>();

  for (const asset of assets) {
    const rows = grouped.get(asset.sample_id) ?? [];
    rows.push(asset);
    grouped.set(asset.sample_id, rows);
  }

  return grouped;
}

function buildAssetStatusRows(
  assets: Array<Pick<PublicTableRow<"sample_assets">, "kind" | "access_level">>,
) {
  const requiredKinds = ["original_wav", "preview_audio", "waveform_peaks"] as const;

  return requiredKinds.map((kind) => {
    const asset = assets.find((row) => row.kind === kind);

    return {
      kind,
      status: asset ? "present" as const : "missing_row" as const,
      access_level: asset?.access_level ?? null,
    };
  });
}

function getRetryEligibility(job: ProcessingJobRow) {
  const retryableStatuses = ["failed", "canceled", "timed_out"];
  const attemptsRemaining = Math.max(job.max_attempts - job.attempts, 0);

  if (!retryableStatuses.includes(job.status)) {
    return {
      eligible: false,
      reason: `Processing job is ${job.status}, not failed, canceled, or timed_out.`,
    };
  }

  if (attemptsRemaining <= 0) {
    return {
      eligible: false,
      reason: "Processing job has no attempts remaining.",
    };
  }

  if (job.status === "canceled") {
    return {
      eligible: true,
      reason: null,
    };
  }

  const definition = getPipelineErrorDefinition(job.last_error_code);

  return definition.adminRetryable
    ? { eligible: true, reason: null }
    : { eligible: false, reason: `${definition.code} is not retryable.` };
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
