import { createClient } from "@supabase/supabase-js";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { AudioProcessingError, AudioWorkerConfigurationError, normalizeProcessingError } from "./errors.mjs";
import { sha256Buffer, sha256File } from "./hashing.mjs";
import { buildDecodeTestCommand, runFfprobeMetadata } from "./metadata.mjs";
import { parseWaveformPeaksJson } from "./peaks.mjs";
import { buildLocalProcessingPlan } from "./local-audio-processor.mjs";
import {
  createAssetDescriptor,
  createDuplicateHashWarning,
  createWorkerFailurePayload,
  createWorkerSuccessPayload,
} from "./result-types.mjs";
import {
  firstValidationError,
  validateDecodeResult,
  validateSourceDescriptor,
  validateWavMetadata,
} from "./validation.mjs";
import { runAudioCommand, runCheckedAudioCommand, trimCommandOutput } from "./commands.mjs";

export const AUDIO_STORAGE_BUCKETS = Object.freeze({
  originals: "ais-originals",
  previews: "ais-previews",
  waveforms: "ais-waveforms",
  processingTemp: "ais-processing-temp",
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export function createAudioWorkerSupabaseClient(env = process.env) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new AudioWorkerConfigurationError("Audio worker requires Supabase URL and service role credentials.", {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(supabaseUrl),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceRoleKey),
    });
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function processInitialUploadJob({
  processingJobId = null,
  supabase,
  settings,
  binaries,
  logger = () => {},
  keepTemp = false,
  now = () => new Date(),
} = {}) {
  if (!supabase) {
    throw new AudioWorkerConfigurationError("Audio worker Supabase client is required.");
  }

  let job = null;
  let tempDirectory = null;

  try {
    const claimed = await claimQueuedInitialUploadJob({ supabase, processingJobId, now });

    if (!claimed.claimed) {
      return {
        ok: true,
        claimed: false,
        status: claimed.status,
        reason: claimed.reason,
        processing_job_id: claimed.job?.id ?? processingJobId ?? null,
        sample_id: claimed.job?.sample_id ?? null,
      };
    }

    job = claimed.job;
    await updateInitialUploadSampleStatus({ supabase, job, status: "processing", now });

    tempDirectory = await mkdtemp(path.join(tmpdir(), `ais-audio-${job.id}-`));
    const payload = await runInitialUploadPipeline({
      supabase,
      job,
      settings,
      binaries,
      tempDirectory,
      logger,
    });

    await markProcessingJobSucceeded({ supabase, job, payload, now });
    return payload;
  } catch (error) {
    const normalized = normalizeProcessingError(error);

    if (job) {
      try {
        await markProcessingJobFailed({ supabase, job, error: normalized, now });
      } catch (dbError) {
        logger("error", "audio_worker_failed_to_persist_failure", {
          processing_job_id: job.id,
          sample_id: job.sample_id,
          original_error: normalized,
          db_error: normalizeProcessingError(dbError),
        });
      }
    }

    return createWorkerFailurePayload({
      sampleId: job?.sample_id ?? null,
      processingJobId: job?.id ?? processingJobId ?? null,
      error: normalized,
    });
  } finally {
    if (tempDirectory && !keepTemp) {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }
}

export async function claimQueuedInitialUploadJob({ supabase, processingJobId = null, now = () => new Date() }) {
  const job = processingJobId
    ? await fetchProcessingJob({ supabase, processingJobId })
    : await fetchNextQueuedInitialUploadJob({ supabase });

  if (!job) {
    return {
      claimed: false,
      status: processingJobId ? "not_found" : "no_queued_jobs",
      job: null,
      reason: processingJobId ? "Processing job was not found." : "No queued initial upload jobs were found.",
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

  if (job.job_type !== "initial_upload") {
    return {
      claimed: false,
      status: "not_claimed",
      job,
      reason: `Processing job type ${job.job_type} is not handled by the initial upload worker.`,
    };
  }

  const startedAt = now().toISOString();
  const { data, error } = await supabase
    .from("processing_jobs")
    .update({
      status: "running",
      attempts: Number(job.attempts ?? 0) + 1,
      started_at: startedAt,
      finished_at: null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new AudioProcessingError("DB_UPDATE_FAILED", "Unable to claim the queued processing job.", {
      processing_job_id: job.id,
      db_error: error.message,
    });
  }

  if (!data) {
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
    job: data,
    reason: null,
  };
}

async function runInitialUploadPipeline({
  supabase,
  job,
  settings,
  binaries,
  tempDirectory,
  logger,
}) {
  const startMs = Date.now();
  const inputRef = inputRefFromJob(job);
  const sourceFile = path.join(tempDirectory, "source.wav");
  const outputsDirectory = path.join(tempDirectory, "outputs");
  await mkdir(outputsDirectory, { recursive: true });

  logger("info", "audio_worker_downloading_source", {
    processing_job_id: job.id,
    sample_id: job.sample_id,
    input: inputRef,
  });
  const source = await downloadSourceObject({ supabase, ref: inputRef, outputFile: sourceFile });

  validateWavHeader(source.buffer, settings);

  const sourceDescriptor = {
    filePath: inputRef.objectPath,
    mimeType: inputMimeTypeFromJob(job),
    fileSizeBytes: source.fileSizeBytes,
  };
  const sourceValidation = validateSourceDescriptor(sourceDescriptor, settings);
  throwFirstValidationError(sourceValidation);

  const metadata = await runFfprobeMetadata({
    ffprobePath: binaries.ffprobe.path,
    inputFile: sourceFile,
    timeoutMs: 30_000,
  });
  const normalizedMetadata = {
    ...metadata,
    fileSizeBytes: source.fileSizeBytes,
  };
  const metadataValidation = validateWavMetadata(normalizedMetadata, settings);
  throwFirstValidationError(metadataValidation);

  const decodeCommand = buildDecodeTestCommand(binaries.ffmpeg.path, sourceFile);
  const decodeResult = await runAudioCommand({
    ...decodeCommand,
    timeoutMs: commandTimeoutMs(settings),
    errorCode: "DECODE_FAILED",
    errorMessage: "Decoder failed to read WAV data.",
  });
  const decodeValidation = validateDecodeResult(decodeResult);
  throwFirstValidationError(decodeValidation);

  const sourceSha256 = await hashSourceFile(sourceFile);
  const duplicateSampleIds = await findDuplicateSampleIds({
    supabase,
    sampleId: job.sample_id,
    sha256: sourceSha256,
  });
  const duplicateCheck = {
    is_duplicate: duplicateSampleIds.length > 0,
    matching_sample_ids: duplicateSampleIds,
  };
  const warnings = duplicateSampleIds.length > 0
    ? [createDuplicateHashWarning(duplicateSampleIds)]
    : [];

  const originalRef = {
    bucket: AUDIO_STORAGE_BUCKETS.originals,
    objectPath: originalWavObjectPath({ sampleId: job.sample_id, sha256: sourceSha256 }),
  };
  await copyOriginalIfNeeded({
    supabase,
    sourceRef: inputRef,
    destinationRef: originalRef,
    expectedSha256: sourceSha256,
  });

  const plan = buildLocalProcessingPlan({
    sampleId: job.sample_id,
    processingJobId: job.id,
    inputFile: sourceFile,
    outputDirectory: outputsDirectory,
    settings,
    binaries,
    metadata: normalizedMetadata,
  });

  await mkdir(path.dirname(plan.preview.file), { recursive: true });
  await mkdir(path.dirname(plan.waveform.file), { recursive: true });

  await runCheckedAudioCommand({
    ...plan.preview.command,
    timeoutMs: commandTimeoutMs(settings),
    errorCode: "PREVIEW_GENERATION_FAILED",
    errorMessage: "Preview transcode failed.",
  });

  await runCheckedAudioCommand({
    ...plan.waveform.command,
    timeoutMs: commandTimeoutMs(settings),
    errorCode: "WAVEFORM_GENERATION_FAILED",
    errorMessage: "Peaks generation failed.",
  });

  await validateWaveformOutput(plan.waveform.file);

  const previewRef = {
    bucket: AUDIO_STORAGE_BUCKETS.previews,
    objectPath: plan.preview.objectPath,
  };
  const waveformRef = {
    bucket: AUDIO_STORAGE_BUCKETS.waveforms,
    objectPath: plan.waveform.objectPath,
  };
  const previewAsset = await uploadGeneratedAssetIfNeeded({
    supabase,
    ref: previewRef,
    filePath: plan.preview.file,
    contentType: "audio/mpeg",
  });
  const waveformAsset = await uploadGeneratedAssetIfNeeded({
    supabase,
    ref: waveformRef,
    filePath: plan.waveform.file,
    contentType: "application/json",
  });
  const toolVersions = await collectToolVersions(binaries);

  return createWorkerSuccessPayload({
    sampleId: job.sample_id,
    processingJobId: job.id,
    source: {
      sha256: sourceSha256,
      file_size_bytes: source.fileSizeBytes,
      duration_seconds: normalizedMetadata.durationSeconds,
      sample_rate: normalizedMetadata.sampleRate,
      bit_depth: normalizedMetadata.bitDepth,
      channels: normalizedMetadata.channels,
      mime_type: normalizedMetadata.mimeType ?? sourceDescriptor.mimeType ?? "audio/wav",
    },
    assets: {
      original_wav: createAssetDescriptor({
        bucket: originalRef.bucket,
        objectPath: originalRef.objectPath,
        fileSizeBytes: source.fileSizeBytes,
        checksumSha256: sourceSha256,
      }),
      preview_audio: previewAsset,
      waveform_peaks: waveformAsset,
    },
    warnings,
    toolVersions,
    duplicateCheck,
    processingDurationMs: Date.now() - startMs,
  });
}

async function markProcessingJobSucceeded({ supabase, job, payload, now = () => new Date() }) {
  if (!job.sample_id) {
    throw new AudioProcessingError("DB_UPDATE_FAILED", "Processing job has no sample to update.", {
      processing_job_id: job.id,
    });
  }

  const assetRows = [
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
    throw new AudioProcessingError("DB_UPDATE_FAILED", "Unable to save generated sample assets.", {
      processing_job_id: job.id,
      db_error: assetsError.message,
    });
  }

  const finishedAt = now().toISOString();
  const { error: jobError } = await supabase
    .from("processing_jobs")
    .update({
      status: "succeeded",
      output_preview_path: payload.assets.preview_audio.object_path,
      output_waveform_path: payload.assets.waveform_peaks.object_path,
      metadata: mergeJobMetadata(job.metadata, {
        warnings: payload.warnings,
        tool_versions: payload.tool_versions,
        duplicate_check: payload.duplicate_check,
        processing_duration_ms: payload.processing_duration_ms,
      }),
      finished_at: finishedAt,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("id", job.id);

  if (jobError) {
    throw new AudioProcessingError("DB_UPDATE_FAILED", "Unable to mark the processing job as succeeded.", {
      processing_job_id: job.id,
      db_error: jobError.message,
    });
  }

  const { error: sampleError } = await supabase
    .from("samples")
    .update({
      status: "needs_review",
      file_hash_sha256: payload.source.sha256,
      file_size_bytes: payload.source.file_size_bytes,
      duration_seconds: payload.source.duration_seconds,
      sample_rate: payload.source.sample_rate,
      bit_depth: payload.source.bit_depth,
      channels: payload.source.channels,
      failed_at: null,
    })
    .eq("id", job.sample_id);

  if (sampleError) {
    throw new AudioProcessingError("DB_UPDATE_FAILED", "Unable to save processing metadata.", {
      processing_job_id: job.id,
      sample_id: job.sample_id,
      db_error: sampleError.message,
    });
  }
}

async function markProcessingJobFailed({ supabase, job, error, now = () => new Date() }) {
  const safeError = normalizeProcessingError(error);
  const finishedAt = now().toISOString();
  const { data, error: jobError } = await supabase
    .from("processing_jobs")
    .update({
      status: "failed",
      last_error_code: safeError.code,
      last_error_message: safeError.message,
      finished_at: finishedAt,
    })
    .eq("id", job.id)
    .select("*")
    .single();

  if (jobError) {
    throw new AudioProcessingError("DB_UPDATE_FAILED", "Unable to update the processing failure.", {
      processing_job_id: job.id,
      db_error: jobError.message,
    });
  }

  await updateInitialUploadSampleStatus({ supabase, job: data, status: "failed", now });
}

async function updateInitialUploadSampleStatus({ supabase, job, status, now = () => new Date() }) {
  if (job.job_type !== "initial_upload" || !job.sample_id) {
    return;
  }

  const update = status === "failed"
    ? { status, failed_at: now().toISOString() }
    : { status, failed_at: null };
  const { error } = await supabase
    .from("samples")
    .update(update)
    .eq("id", job.sample_id);

  if (error) {
    throw new AudioProcessingError("DB_UPDATE_FAILED", "Unable to update the sample processing status.", {
      processing_job_id: job.id,
      sample_id: job.sample_id,
      db_error: error.message,
    });
  }
}

async function fetchProcessingJob({ supabase, processingJobId }) {
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("*")
    .eq("id", processingJobId)
    .maybeSingle();

  if (error) {
    throw new AudioProcessingError("DB_UPDATE_FAILED", "Unable to load the processing job.", {
      processing_job_id: processingJobId,
      db_error: error.message,
    });
  }

  return data;
}

async function fetchNextQueuedInitialUploadJob({ supabase }) {
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("*")
    .eq("job_type", "initial_upload")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AudioProcessingError("DB_UPDATE_FAILED", "Unable to load the next queued processing job.", {
      db_error: error.message,
    });
  }

  return data;
}

async function downloadSourceObject({ supabase, ref, outputFile }) {
  const buffer = await downloadStorageObjectBuffer({ supabase, ref, errorCode: "STORAGE_READ_FAILED" });

  if (!buffer) {
    throw new AudioProcessingError("SOURCE_NOT_FOUND", "Uploaded source file is missing.", {
      bucket: ref.bucket,
      object_path: ref.objectPath,
    });
  }

  await writeFile(outputFile, buffer);

  return {
    buffer,
    fileSizeBytes: buffer.byteLength,
  };
}

async function copyOriginalIfNeeded({ supabase, sourceRef, destinationRef, expectedSha256 }) {
  const existing = await downloadStorageObjectBuffer({
    supabase,
    ref: destinationRef,
    missingOk: true,
    errorCode: "STORAGE_WRITE_FAILED",
  });

  if (existing) {
    assertExistingChecksum({ ref: destinationRef, buffer: existing, expectedSha256 });
    return { copied: false, reused: true };
  }

  const { error } = await supabase.storage
    .from(sourceRef.bucket)
    .copy(sourceRef.objectPath, destinationRef.objectPath, {
      destinationBucket: destinationRef.bucket,
    });

  if (error) {
    const retryExisting = await downloadStorageObjectBuffer({
      supabase,
      ref: destinationRef,
      missingOk: true,
      errorCode: "STORAGE_WRITE_FAILED",
    });

    if (retryExisting) {
      assertExistingChecksum({ ref: destinationRef, buffer: retryExisting, expectedSha256 });
      return { copied: false, reused: true };
    }

    throw new AudioProcessingError("STORAGE_WRITE_FAILED", "Unable to copy original WAV to canonical storage.", {
      source_bucket: sourceRef.bucket,
      source_object_path: sourceRef.objectPath,
      destination_bucket: destinationRef.bucket,
      destination_object_path: destinationRef.objectPath,
      storage_error: error.message,
    });
  }

  return { copied: true, reused: false };
}

async function uploadGeneratedAssetIfNeeded({ supabase, ref, filePath, contentType }) {
  const body = await readFile(filePath);
  const checksumSha256 = sha256Buffer(body);
  const fileStats = await stat(filePath);
  const existing = await downloadStorageObjectBuffer({
    supabase,
    ref,
    missingOk: true,
    errorCode: "STORAGE_WRITE_FAILED",
  });

  if (existing) {
    assertExistingChecksum({ ref, buffer: existing, expectedSha256: checksumSha256 });
    return createAssetDescriptor({
      bucket: ref.bucket,
      objectPath: ref.objectPath,
      fileSizeBytes: fileStats.size,
      checksumSha256,
    });
  }

  const { error } = await supabase.storage
    .from(ref.bucket)
    .upload(ref.objectPath, body, {
      cacheControl: "31536000",
      contentType,
      upsert: false,
    });

  if (error) {
    const retryExisting = await downloadStorageObjectBuffer({
      supabase,
      ref,
      missingOk: true,
      errorCode: "STORAGE_WRITE_FAILED",
    });

    if (retryExisting) {
      assertExistingChecksum({ ref, buffer: retryExisting, expectedSha256: checksumSha256 });
      return createAssetDescriptor({
        bucket: ref.bucket,
        objectPath: ref.objectPath,
        fileSizeBytes: fileStats.size,
        checksumSha256,
      });
    }

    throw new AudioProcessingError("STORAGE_WRITE_FAILED", "Unable to upload generated audio asset.", {
      bucket: ref.bucket,
      object_path: ref.objectPath,
      storage_error: error.message,
    });
  }

  return createAssetDescriptor({
    bucket: ref.bucket,
    objectPath: ref.objectPath,
    fileSizeBytes: fileStats.size,
    checksumSha256,
  });
}

async function downloadStorageObjectBuffer({ supabase, ref, missingOk = false, errorCode = "STORAGE_READ_FAILED" }) {
  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .download(ref.objectPath);

  if (error) {
    if (missingOk || isStorageNotFoundError(error)) {
      return null;
    }

    throw new AudioProcessingError(errorCode, "Storage object download failed.", {
      bucket: ref.bucket,
      object_path: ref.objectPath,
      storage_error: error.message,
    });
  }

  return Buffer.from(await data.arrayBuffer());
}

async function findDuplicateSampleIds({ supabase, sampleId, sha256 }) {
  const { data, error } = await supabase
    .from("samples")
    .select("id")
    .eq("file_hash_sha256", sha256)
    .neq("id", sampleId)
    .limit(50);

  if (error) {
    throw new AudioProcessingError("DB_UPDATE_FAILED", "Unable to check duplicate sample hashes.", {
      sample_id: sampleId,
      sha256,
      db_error: error.message,
    });
  }

  return (data ?? []).map((sample) => sample.id);
}

async function hashSourceFile(filePath) {
  try {
    return await sha256File(filePath);
  } catch (error) {
    throw new AudioProcessingError("HASH_FAILED", "SHA-256 computation failed.", {
      source_file: filePath,
      system_error: error.message,
    });
  }
}

async function validateWaveformOutput(filePath) {
  try {
    parseWaveformPeaksJson(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new AudioProcessingError("WAVEFORM_GENERATION_FAILED", "Peaks generation produced invalid JSON.", {
      output_file: filePath,
      parser_error: error.message,
    });
  }
}

async function collectToolVersions(binaries) {
  const entries = await Promise.all([
    collectToolVersion("ffmpeg", binaries.ffmpeg?.path, ["-version"]),
    collectToolVersion("ffprobe", binaries.ffprobe?.path, ["-version"]),
    collectToolVersion("audiowaveform", binaries.audiowaveform?.path, ["--version"]),
  ]);
  const versions = {};

  for (const [name, version] of entries) {
    if (version) {
      versions[name] = version;
    }
  }

  return versions;
}

async function collectToolVersion(name, command, args) {
  if (!command) {
    return [name, null];
  }

  try {
    const result = await runAudioCommand({
      command,
      args,
      timeoutMs: 5000,
      errorCode: "UNKNOWN_PROCESSING_ERROR",
      errorMessage: `Unable to read ${name} version.`,
    });
    const versionText = trimCommandOutput(result.stdout || result.stderr, 240).split(/\r?\n/)[0]?.trim();
    return [name, versionText || command];
  } catch {
    return [name, command];
  }
}

function inputRefFromJob(job) {
  const metadata = objectMetadata(job.metadata);
  const inputMetadata = objectMetadata(metadata.input);
  const uploadSessionId = metadata.upload_session_id ?? metadata.uploadSessionId;
  const inferredPath = job.sample_id && uploadSessionId
    ? `intake/${job.sample_id}/${uploadSessionId}/source.wav`
    : null;
  const bucket = job.input_bucket
    ?? metadata.input_bucket
    ?? inputMetadata.bucket
    ?? AUDIO_STORAGE_BUCKETS.processingTemp;
  const objectPath = job.input_path
    ?? metadata.input_path
    ?? inputMetadata.path
    ?? inputMetadata.object_path
    ?? inferredPath;

  if (!bucket || !objectPath) {
    throw new AudioProcessingError("SOURCE_NOT_FOUND", "Processing job does not include an intake source path.", {
      processing_job_id: job.id,
      sample_id: job.sample_id,
    });
  }

  return { bucket, objectPath };
}

function inputMimeTypeFromJob(job) {
  const metadata = objectMetadata(job.metadata);
  const source = objectMetadata(metadata.source);
  const input = objectMetadata(metadata.input);
  const upload = objectMetadata(metadata.upload);

  return metadata.input_mime_type
    ?? metadata.content_type
    ?? source.mime_type
    ?? input.mime_type
    ?? upload.content_type
    ?? null;
}

function validateWavHeader(buffer, settings) {
  const riff = buffer.subarray(0, 4).toString("ascii");
  const wave = buffer.subarray(8, 12).toString("ascii");
  const isRiffWave = riff === "RIFF" && wave === "WAVE";
  const isRf64Wave = riff === "RF64" && wave === "WAVE";

  if (isRiffWave || (settings.allowRf64 && isRf64Wave)) {
    return;
  }

  throw new AudioProcessingError("INVALID_WAV_CONTAINER", "Container must be RIFF/WAVE.", {
    riff_header: riff,
    wave_header: wave,
    allow_rf64: settings.allowRf64,
  });
}

function throwFirstValidationError(result) {
  const error = firstValidationError(result);

  if (error) {
    throw new AudioProcessingError(error.code, error.message, error.details);
  }
}

function assertExistingChecksum({ ref, buffer, expectedSha256 }) {
  const existingSha256 = sha256Buffer(buffer);

  if (existingSha256 !== expectedSha256) {
    throw new AudioProcessingError("STORAGE_WRITE_FAILED", "Refusing to overwrite an existing storage object.", {
      bucket: ref.bucket,
      object_path: ref.objectPath,
      expected_sha256: expectedSha256,
      existing_sha256: existingSha256,
    });
  }
}

function originalWavObjectPath({ sampleId, sha256 }) {
  assertUuid(sampleId, "sampleId");
  assertSha256(sha256, "sha256");
  return `samples/${sampleId.toLowerCase()}/original/${sha256.toLowerCase()}.wav`;
}

function assertUuid(value, label) {
  if (!UUID_PATTERN.test(String(value ?? ""))) {
    throw new AudioProcessingError("DB_UPDATE_FAILED", `${label} must be a UUID.`, { [label]: value });
  }
}

function assertSha256(value, label) {
  if (!SHA256_PATTERN.test(String(value ?? ""))) {
    throw new AudioProcessingError("HASH_FAILED", `${label} must be a SHA-256 hex digest.`, { [label]: value });
  }
}

function objectMetadata(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function mergeJobMetadata(existingMetadata, metadataPatch) {
  const existing = objectMetadata(existingMetadata);
  const merged = {};

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

function commandTimeoutMs(settings) {
  return Math.max(60_000, Math.ceil(Number(settings.maxDurationSeconds ?? 1800) * 1000 * 1.5));
}

function isStorageNotFoundError(error) {
  return /not found|does not exist|404/i.test(`${error.message ?? ""} ${error.statusCode ?? ""} ${error.status ?? ""}`);
}
