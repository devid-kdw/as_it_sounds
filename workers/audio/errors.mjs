export const AUDIO_ERROR_CATALOG = Object.freeze({
  SOURCE_NOT_FOUND: { retryable: true, message: "Uploaded file missing or storage read failed." },
  STORAGE_READ_FAILED: { retryable: true, message: "Could not download input." },
  STORAGE_WRITE_FAILED: { retryable: true, message: "Could not upload generated asset." },
  UNSUPPORTED_FORMAT: { retryable: false, message: "Input is not a WAV file." },
  INVALID_WAV_CONTAINER: { retryable: false, message: "WAV container is malformed or unsupported." },
  UNSUPPORTED_WAV_ENCODING: { retryable: false, message: "WAV encoding is not PCM or IEEE float." },
  UNSUPPORTED_CHANNEL_COUNT: { retryable: false, message: "Channel count is not supported." },
  UNSUPPORTED_SAMPLE_RATE: { retryable: false, message: "Sample rate is not supported." },
  UNSUPPORTED_BIT_DEPTH: { retryable: false, message: "Bit depth is not supported." },
  FILE_TOO_LARGE: { retryable: false, message: "File exceeds configured limits." },
  INVALID_DURATION: { retryable: false, message: "Duration is missing, zero, or over the configured limit." },
  DECODE_FAILED: { retryable: false, message: "Decoder failed to read WAV data." },
  HASH_FAILED: { retryable: true, message: "SHA-256 computation failed." },
  METADATA_EXTRACTION_FAILED: { retryable: true, message: "ffprobe failed unexpectedly." },
  PREVIEW_GENERATION_FAILED: { retryable: true, message: "Preview transcode failed." },
  WAVEFORM_GENERATION_FAILED: { retryable: true, message: "Peaks generation failed." },
  DB_UPDATE_FAILED: { retryable: true, message: "Database update failed." },
  WORKER_TIMEOUT: { retryable: true, message: "Worker exceeded allowed runtime." },
  WORKER_UNAVAILABLE: { retryable: true, message: "Worker endpoint unavailable." },
  UNKNOWN_PROCESSING_ERROR: { retryable: true, message: "Unexpected processing failure." },
});

export class AudioWorkerConfigurationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AudioWorkerConfigurationError";
    this.details = details;
  }
}

export class AudioProcessingError extends Error {
  constructor(code, message, details = {}) {
    const definition = AUDIO_ERROR_CATALOG[code] ?? AUDIO_ERROR_CATALOG.UNKNOWN_PROCESSING_ERROR;
    super(message ?? definition.message);
    this.name = "AudioProcessingError";
    this.code = AUDIO_ERROR_CATALOG[code] ? code : "UNKNOWN_PROCESSING_ERROR";
    this.retryable = definition.retryable;
    this.details = details;
  }
}

export function createProcessingError(code, message, details = {}) {
  const definition = AUDIO_ERROR_CATALOG[code] ?? AUDIO_ERROR_CATALOG.UNKNOWN_PROCESSING_ERROR;
  const normalizedCode = AUDIO_ERROR_CATALOG[code] ? code : "UNKNOWN_PROCESSING_ERROR";

  return {
    code: normalizedCode,
    message: message ?? definition.message,
    retryable: definition.retryable,
    details,
  };
}

export function normalizeProcessingError(error) {
  if (!error) {
    return createProcessingError("UNKNOWN_PROCESSING_ERROR");
  }

  if (error instanceof AudioProcessingError) {
    return createProcessingError(error.code, error.message, error.details);
  }

  if (typeof error === "object" && typeof error.code === "string") {
    return createProcessingError(error.code, error.message, error.details ?? {});
  }

  return createProcessingError("UNKNOWN_PROCESSING_ERROR", error.message);
}
