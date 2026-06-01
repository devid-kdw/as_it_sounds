import "server-only";

import type { ProcessingJobStatusResponse } from "@/types/api";
import type { Json } from "@/types/database.types";
import {
  createSupabaseAdminClient,
  type PublicTableInsert,
  type PublicTableRow,
  type PublicTableUpdate,
  type SupabaseDatabaseClient,
} from "@/lib/supabase/admin";
import {
  AISUserSafeError,
  getPipelineErrorDefinition,
  type PipelineErrorInput,
  toSafePipelineError,
} from "@/lib/errors";
import { tryWriteAdminAuditLog } from "@/lib/admin-audit";

export type ProcessingJobRow = PublicTableRow<"processing_jobs">;
export type ProcessingJobStatus = ProcessingJobRow["status"];
export type ProcessingJobType = ProcessingJobRow["job_type"];
export type SampleProcessingStatus = PublicTableRow<"samples">["status"];

export type ProcessingJobSourceMetadata = {
  sha256: string;
  file_size_bytes: number;
  duration_seconds: number;
  sample_rate: number;
  bit_depth: number;
  channels: number;
  mime_type?: string | null;
};

export type ProcessingJobAssetPayload = {
  bucket: string;
  object_path: string;
  file_size_bytes: number;
  checksum_sha256: string | null;
};

export type ProcessingJobSuccessPayload = {
  source: ProcessingJobSourceMetadata;
  assets: {
    original_wav: ProcessingJobAssetPayload;
    preview_audio: ProcessingJobAssetPayload;
    waveform_peaks: ProcessingJobAssetPayload;
  };
  warnings?: Json;
  tool_versions?: Json;
  duplicate_check?: Json;
  processing_duration_ms?: number;
};

export type ProcessingJobRetryMode = "automatic" | "admin";

export type ProcessingJobRetryEligibility = {
  eligible: boolean;
  reason: string | null;
  mode: ProcessingJobRetryMode;
  attemptsRemaining: number;
  retryableError: boolean;
};

export type ProcessingJobClaimResult =
  | {
      claimed: true;
      status: "claimed";
      job: ProcessingJobRow;
      reason: null;
    }
  | {
      claimed: false;
      status: "already_succeeded" | "not_claimed" | "not_found";
      job: ProcessingJobRow | null;
      reason: string;
    };

type ProcessingJobServiceOptions = {
  supabase?: SupabaseDatabaseClient;
  now?: () => Date;
  actorUserId?: string | null;
};

const RETRYABLE_TERMINAL_STATUSES: ProcessingJobStatus[] = ["failed", "canceled", "timed_out"];
const RETRYABLE_JOB_TYPES: ProcessingJobType[] = [
  "initial_upload",
  "reprocess_preview",
  "reprocess_waveform",
  "reprocess_metadata",
];

export async function getProcessingJob(
  jobId: string,
  options: ProcessingJobServiceOptions = {},
) {
  const supabase = getSupabase(options);
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load the processing job.", "processing_job_lookup_failed", 500);
  }

  return data;
}

export async function getProcessingJobStatusSnapshot(
  jobId: string,
  options: ProcessingJobServiceOptions = {},
): Promise<ProcessingJobStatusResponse> {
  const supabase = getSupabase(options);
  const job = await getProcessingJob(jobId, { ...options, supabase });

  if (!job) {
    throw new AISUserSafeError("Processing job was not found.", "processing_job_not_found", 404);
  }

  const sampleStatus = job.sample_id
    ? await getSampleProcessingStatus(supabase, job.sample_id)
    : null;
  const assetStatus = job.sample_id
    ? await getProcessingAssetStatus(supabase, job.sample_id)
    : [];
  const retryEligibility = determineProcessingJobRetryEligibility(job, "admin");

  return {
    processing_job_id: job.id,
    sample_id: job.sample_id,
    job_type: job.job_type,
    processing_status: job.status,
    sample_processing_status: sampleStatus,
    attempts: job.attempts,
    max_attempts: job.max_attempts,
    retry_eligible: retryEligibility.eligible,
    retry_reason: retryEligibility.reason,
    last_error_code: job.last_error_code,
    last_error_message: job.last_error_message,
    started_at: job.started_at,
    finished_at: job.finished_at,
    created_at: job.created_at,
    updated_at: job.updated_at,
    warnings: getJobMetadataValue(job.metadata, "warnings"),
    duplicate_check: getJobMetadataValue(job.metadata, "duplicate_check"),
    asset_status: assetStatus,
  };
}

export async function claimQueuedProcessingJob(
  jobId: string,
  options: ProcessingJobServiceOptions = {},
): Promise<ProcessingJobClaimResult> {
  const job = await getProcessingJob(jobId, options);

  if (!job) {
    return {
      claimed: false,
      status: "not_found",
      job: null,
      reason: "Processing job was not found.",
    };
  }

  if (job.status === "succeeded") {
    return {
      claimed: false,
      status: "already_succeeded",
      job,
      reason: "Processing job already succeeded.",
    };
  }

  if (job.status !== "queued") {
    return {
      claimed: false,
      status: "not_claimed",
      job,
      reason: `Processing job is ${job.status}, not queued.`,
    };
  }

  const runningJob = await markProcessingJobRunning(job, options);

  if (!runningJob) {
    return {
      claimed: false,
      status: "not_claimed",
      job,
      reason: "Processing job was claimed by another worker.",
    };
  }

  return {
    claimed: true,
    status: "claimed",
    job: runningJob,
    reason: null,
  };
}

export async function markProcessingJobRunning(
  job: ProcessingJobRow,
  options: ProcessingJobServiceOptions = {},
) {
  if (job.status !== "queued") {
    return null;
  }

  const supabase = getSupabase(options);
  const now = getNowIso(options);
  const update: PublicTableUpdate<"processing_jobs"> = {
    status: "running",
    attempts: job.attempts + 1,
    started_at: now,
    finished_at: null,
    last_error_code: null,
    last_error_message: null,
  };
  const { data, error } = await supabase
    .from("processing_jobs")
    .update(update)
    .eq("id", job.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to mark the processing job as running.", "processing_job_update_failed", 500);
  }

  if (!data) {
    return null;
  }

  await updateInitialUploadSampleStatus(supabase, data, "processing", now);

  return data;
}

export async function markProcessingJobSucceeded(
  jobId: string,
  payload: ProcessingJobSuccessPayload,
  options: ProcessingJobServiceOptions = {},
) {
  const supabase = getSupabase(options);
  const job = await requireProcessingJob(jobId, options);
  const now = getNowIso(options);

  if (!job.sample_id) {
    throw new AISUserSafeError("Processing job has no sample to update.", "processing_job_sample_missing", 409);
  }

  const assetRows: PublicTableInsert<"sample_assets">[] = [
    {
      sample_id: job.sample_id,
      kind: "original_wav",
      bucket: payload.assets.original_wav.bucket,
      object_path: payload.assets.original_wav.object_path,
      mime_type: payload.source.mime_type ?? "audio/wav",
      file_size_bytes: payload.assets.original_wav.file_size_bytes,
      checksum_sha256: payload.assets.original_wav.checksum_sha256,
      access_level: "private",
    },
    {
      sample_id: job.sample_id,
      kind: "preview_audio",
      bucket: payload.assets.preview_audio.bucket,
      object_path: payload.assets.preview_audio.object_path,
      mime_type: "audio/mpeg",
      file_size_bytes: payload.assets.preview_audio.file_size_bytes,
      checksum_sha256: payload.assets.preview_audio.checksum_sha256,
      access_level: "public",
    },
    {
      sample_id: job.sample_id,
      kind: "waveform_peaks",
      bucket: payload.assets.waveform_peaks.bucket,
      object_path: payload.assets.waveform_peaks.object_path,
      mime_type: "application/json",
      file_size_bytes: payload.assets.waveform_peaks.file_size_bytes,
      checksum_sha256: payload.assets.waveform_peaks.checksum_sha256,
      access_level: "public",
    },
  ];

  const { error: assetsError } = await supabase
    .from("sample_assets")
    .upsert(assetRows, { onConflict: "sample_id,kind" });

  if (assetsError) {
    await markProcessingJobFailed(
      job.id,
      { code: "DB_UPDATE_FAILED" },
      { ...options, supabase },
    );
    throw new AISUserSafeError("Unable to save generated sample assets.", "processing_assets_update_failed", 500);
  }

  const jobUpdate: PublicTableUpdate<"processing_jobs"> = {
    status: "succeeded",
    output_preview_path: payload.assets.preview_audio.object_path,
    output_waveform_path: payload.assets.waveform_peaks.object_path,
    metadata: mergeJobMetadata(job.metadata, {
      warnings: payload.warnings,
      tool_versions: payload.tool_versions,
      duplicate_check: payload.duplicate_check,
      processing_duration_ms: payload.processing_duration_ms,
    }),
    finished_at: now,
    last_error_code: null,
    last_error_message: null,
  };
  const { data, error: jobError } = await supabase
    .from("processing_jobs")
    .update(jobUpdate)
    .eq("id", job.id)
    .select("*")
    .single();

  if (jobError) {
    throw new AISUserSafeError("Unable to mark the processing job as succeeded.", "processing_job_update_failed", 500);
  }

  const sampleSuccessUpdate: PublicTableUpdate<"samples"> = {
    status: "needs_review",
    file_hash_sha256: payload.source.sha256,
    file_size_bytes: payload.source.file_size_bytes,
    duration_seconds: payload.source.duration_seconds,
    sample_rate: payload.source.sample_rate,
    bit_depth: payload.source.bit_depth,
    channels: payload.source.channels,
    failed_at: null,
  };
  const { error: sampleError } = await supabase
    .from("samples")
    .update(sampleSuccessUpdate)
    .eq("id", job.sample_id);

  if (sampleError) {
    await markProcessingJobFailed(
      job.id,
      { code: "DB_UPDATE_FAILED" },
      { ...options, supabase },
    );
    throw new AISUserSafeError("Unable to save processing metadata.", "processing_sample_update_failed", 500);
  }

  return data;
}

export async function markProcessingJobFailed(
  jobId: string,
  errorInput: PipelineErrorInput | unknown,
  options: ProcessingJobServiceOptions = {},
) {
  return markProcessingJobTerminal(jobId, "failed", errorInput, options);
}

export async function markProcessingJobTimedOut(
  jobId: string,
  errorInput: PipelineErrorInput = { code: "WORKER_TIMEOUT" },
  options: ProcessingJobServiceOptions = {},
) {
  return markProcessingJobTerminal(jobId, "timed_out", errorInput, options);
}

export function determineProcessingJobRetryEligibility(
  job: ProcessingJobRow,
  mode: ProcessingJobRetryMode = "automatic",
): ProcessingJobRetryEligibility {
  const attemptsRemaining = Math.max(job.max_attempts - job.attempts, 0);

  if (!RETRYABLE_TERMINAL_STATUSES.includes(job.status)) {
    return {
      eligible: false,
      reason: `Processing job is ${job.status}, not failed, canceled, or timed_out.`,
      mode,
      attemptsRemaining,
      retryableError: false,
    };
  }

  if (!RETRYABLE_JOB_TYPES.includes(job.job_type)) {
    return {
      eligible: false,
      reason: `Processing job type ${job.job_type} does not allow retry.`,
      mode,
      attemptsRemaining,
      retryableError: false,
    };
  }

  if (job.attempts >= job.max_attempts) {
    return {
      eligible: false,
      reason: "Processing job has no attempts remaining.",
      mode,
      attemptsRemaining,
      retryableError: false,
    };
  }

  if (job.status === "canceled" && mode !== "admin") {
    return {
      eligible: false,
      reason: "Canceled processing jobs require an admin retry.",
      mode,
      attemptsRemaining,
      retryableError: false,
    };
  }

  if (job.status === "canceled" && mode === "admin") {
    return {
      eligible: true,
      reason: null,
      mode,
      attemptsRemaining,
      retryableError: true,
    };
  }

  const definition = getPipelineErrorDefinition(job.last_error_code);
  const retryableError = mode === "admin" ? definition.adminRetryable : definition.retryable;

  if (!retryableError) {
    return {
      eligible: false,
      reason: `${definition.code} is not retryable.`,
      mode,
      attemptsRemaining,
      retryableError,
    };
  }

  return {
    eligible: true,
    reason: null,
    mode,
    attemptsRemaining,
    retryableError,
  };
}

export async function queueProcessingJobRetry(
  jobId: string,
  mode: ProcessingJobRetryMode = "admin",
  options: ProcessingJobServiceOptions = {},
) {
  const supabase = getSupabase(options);
  const job = await requireProcessingJob(jobId, options);
  const eligibility = determineProcessingJobRetryEligibility(job, mode);

  if (!eligibility.eligible) {
    return {
      queued: false,
      job,
      eligibility,
    };
  }

  const update: PublicTableUpdate<"processing_jobs"> = {
    status: "queued",
    started_at: null,
    finished_at: null,
  };
  const { data, error } = await supabase
    .from("processing_jobs")
    .update(update)
    .eq("id", job.id)
    .select("*")
    .single();

  if (error) {
    throw new AISUserSafeError("Unable to queue the processing retry.", "processing_job_retry_failed", 500);
  }

  await updateInitialUploadSampleStatus(supabase, data, "draft", getNowIso(options));
  await tryWriteAdminAuditLog(supabase, {
    actorUserId: options.actorUserId ?? null,
    action: "processing_job.retry",
    entityType: "processing_job",
    entityId: job.id,
    beforeData: {
      status: job.status,
      attempts: job.attempts,
      last_error_code: job.last_error_code,
    },
    afterData: {
      status: data.status,
      attempts: data.attempts,
      sample_id: data.sample_id,
    },
  });

  return {
    queued: true,
    job: data,
    eligibility: determineProcessingJobRetryEligibility(data, mode),
  };
}

async function markProcessingJobTerminal(
  jobId: string,
  status: "failed" | "timed_out",
  errorInput: PipelineErrorInput | unknown,
  options: ProcessingJobServiceOptions = {},
) {
  const supabase = getSupabase(options);
  const job = await requireProcessingJob(jobId, options);
  const safeError = toSafePipelineError(errorInput);
  const now = getNowIso(options);
  const update: PublicTableUpdate<"processing_jobs"> = {
    status,
    last_error_code: safeError.code,
    last_error_message: safeError.message,
    finished_at: now,
  };
  const { data, error } = await supabase
    .from("processing_jobs")
    .update(update)
    .eq("id", job.id)
    .select("*")
    .single();

  if (error) {
    throw new AISUserSafeError("Unable to update the processing failure.", "processing_job_update_failed", 500);
  }

  await updateInitialUploadSampleStatus(supabase, data, "failed", now);

  return data;
}

async function requireProcessingJob(
  jobId: string,
  options: ProcessingJobServiceOptions = {},
) {
  const job = await getProcessingJob(jobId, options);

  if (!job) {
    throw new AISUserSafeError("Processing job was not found.", "processing_job_not_found", 404);
  }

  return job;
}

async function getSampleProcessingStatus(
  supabase: SupabaseDatabaseClient,
  sampleId: string,
): Promise<SampleProcessingStatus> {
  const { data, error } = await supabase
    .from("samples")
    .select("status")
    .eq("id", sampleId)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load the sample processing status.", "processing_sample_lookup_failed", 500);
  }

  if (!data) {
    throw new AISUserSafeError("Processing sample was not found.", "processing_sample_not_found", 404);
  }

  return data.status;
}

async function getProcessingAssetStatus(
  supabase: SupabaseDatabaseClient,
  sampleId: string,
) {
  const requiredKinds = ["original_wav", "preview_audio", "waveform_peaks"] as const;
  const { data, error } = await supabase
    .from("sample_assets")
    .select("kind,access_level")
    .eq("sample_id", sampleId);

  if (error) {
    throw new AISUserSafeError("Unable to load generated asset status.", "processing_asset_status_failed", 500);
  }

  const rowsByKind = new Map((data ?? []).map((asset) => [asset.kind, asset]));

  return requiredKinds.map((kind) => {
    const asset = rowsByKind.get(kind);

    return {
      kind,
      status: asset ? "present" as const : "missing_row" as const,
      access_level: asset?.access_level ?? null,
    };
  });
}

async function updateInitialUploadSampleStatus(
  supabase: SupabaseDatabaseClient,
  job: Pick<ProcessingJobRow, "job_type" | "sample_id">,
  status: "draft" | "processing" | "failed",
  now: string,
) {
  if (job.job_type !== "initial_upload" || !job.sample_id) {
    return;
  }

  const update: PublicTableUpdate<"samples"> =
    status === "failed"
      ? { status, failed_at: now }
      : { status, failed_at: null };
  const { error } = await supabase.from("samples").update(update).eq("id", job.sample_id);

  if (error) {
    throw new AISUserSafeError("Unable to update the sample processing status.", "processing_sample_update_failed", 500);
  }
}

function mergeJobMetadata(
  existingMetadata: Json,
  metadataPatch: Record<string, Json | undefined>,
): Json {
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

function getJobMetadataValue(metadata: Json, key: string): Json | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[key];
  return value === undefined ? null : value;
}

function getSupabase(options: ProcessingJobServiceOptions) {
  return options.supabase ?? createSupabaseAdminClient();
}

function getNowIso(options: ProcessingJobServiceOptions) {
  return (options.now?.() ?? new Date()).toISOString();
}
