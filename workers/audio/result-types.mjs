import { normalizeProcessingError } from "./errors.mjs";

/**
 * @typedef {Object} AudioWorkerWarning
 * @property {string} code
 * @property {string} message
 * @property {Record<string, unknown>} metadata
 */

/**
 * @typedef {Object} AudioWorkerSuccessPayload
 * @property {true} ok
 * @property {string} sample_id
 * @property {string} processing_job_id
 * @property {Record<string, unknown>} source
 * @property {Record<string, unknown>} assets
 * @property {AudioWorkerWarning[]} warnings
 * @property {Record<string, string>} tool_versions
 */

/**
 * @typedef {Object} AudioWorkerFailurePayload
 * @property {false} ok
 * @property {string} sample_id
 * @property {string} processing_job_id
 * @property {Record<string, unknown>} error
 */

export function createWorkerWarning(code, message, metadata = {}) {
  return { code, message, metadata };
}

export function createDuplicateHashWarning(matchingSampleIds) {
  return createWorkerWarning("DUPLICATE_HASH_FOUND", "Matching hash exists on another sample.", {
    matching_sample_ids: matchingSampleIds,
  });
}

export function createAssetDescriptor({ bucket, objectPath, fileSizeBytes, checksumSha256 }) {
  return {
    bucket,
    object_path: objectPath,
    file_size_bytes: fileSizeBytes,
    checksum_sha256: checksumSha256,
  };
}

export function createWorkerSuccessPayload({
  sampleId,
  processingJobId,
  source,
  assets,
  warnings = [],
  toolVersions = {},
}) {
  return {
    ok: true,
    sample_id: sampleId,
    processing_job_id: processingJobId,
    source,
    assets,
    warnings,
    tool_versions: toolVersions,
  };
}

export function createWorkerFailurePayload({ sampleId, processingJobId, error }) {
  return {
    ok: false,
    sample_id: sampleId,
    processing_job_id: processingJobId,
    error: normalizeProcessingError(error),
  };
}
