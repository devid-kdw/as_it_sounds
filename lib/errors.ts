export class AISUserSafeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AISUserSafeError";
  }
}

export function toUserSafeMessage(error: unknown) {
  if (error instanceof AISUserSafeError) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

export type PipelineErrorCode =
  | "SOURCE_NOT_FOUND"
  | "STORAGE_READ_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "UNSUPPORTED_FORMAT"
  | "INVALID_WAV_CONTAINER"
  | "UNSUPPORTED_WAV_ENCODING"
  | "UNSUPPORTED_CHANNEL_COUNT"
  | "UNSUPPORTED_SAMPLE_RATE"
  | "UNSUPPORTED_BIT_DEPTH"
  | "FILE_TOO_LARGE"
  | "INVALID_DURATION"
  | "DECODE_FAILED"
  | "HASH_FAILED"
  | "METADATA_EXTRACTION_FAILED"
  | "PREVIEW_GENERATION_FAILED"
  | "WAVEFORM_GENERATION_FAILED"
  | "DB_UPDATE_FAILED"
  | "WORKER_TIMEOUT"
  | "WORKER_UNAVAILABLE"
  | "UNKNOWN_PROCESSING_ERROR";

export type PipelineErrorDefinition = {
  code: PipelineErrorCode;
  retryable: boolean;
  adminRetryable: boolean;
  publicMessage: string;
  adminMessage: string;
};

export type PipelineErrorInput = {
  code?: string | null;
  message?: string | null;
  retryable?: boolean | null;
};

export type SafePipelineError = {
  code: PipelineErrorCode;
  message: string;
  retryable: boolean;
  adminRetryable: boolean;
};

export const PIPELINE_ERROR_CATALOG = {
  SOURCE_NOT_FOUND: {
    code: "SOURCE_NOT_FOUND",
    retryable: true,
    adminRetryable: true,
    publicMessage: "The uploaded file could not be found.",
    adminMessage: "Uploaded source file is missing or not readable.",
  },
  STORAGE_READ_FAILED: {
    code: "STORAGE_READ_FAILED",
    retryable: true,
    adminRetryable: true,
    publicMessage: "The uploaded file could not be read.",
    adminMessage: "Storage read failed while downloading the source file.",
  },
  STORAGE_WRITE_FAILED: {
    code: "STORAGE_WRITE_FAILED",
    retryable: true,
    adminRetryable: true,
    publicMessage: "Generated audio assets could not be saved.",
    adminMessage: "Storage write failed while saving generated assets.",
  },
  UNSUPPORTED_FORMAT: {
    code: "UNSUPPORTED_FORMAT",
    retryable: false,
    adminRetryable: false,
    publicMessage: "Only WAV uploads are supported.",
    adminMessage: "Uploaded file is not a supported WAV file.",
  },
  INVALID_WAV_CONTAINER: {
    code: "INVALID_WAV_CONTAINER",
    retryable: false,
    adminRetryable: false,
    publicMessage: "The WAV file is malformed.",
    adminMessage: "WAV container is malformed.",
  },
  UNSUPPORTED_WAV_ENCODING: {
    code: "UNSUPPORTED_WAV_ENCODING",
    retryable: false,
    adminRetryable: false,
    publicMessage: "The WAV encoding is not supported.",
    adminMessage: "WAV encoding is not supported.",
  },
  UNSUPPORTED_CHANNEL_COUNT: {
    code: "UNSUPPORTED_CHANNEL_COUNT",
    retryable: false,
    adminRetryable: false,
    publicMessage: "The WAV channel count is not supported.",
    adminMessage: "WAV channel count is outside the supported range.",
  },
  UNSUPPORTED_SAMPLE_RATE: {
    code: "UNSUPPORTED_SAMPLE_RATE",
    retryable: false,
    adminRetryable: false,
    publicMessage: "The WAV sample rate is not supported.",
    adminMessage: "WAV sample rate is outside the supported list.",
  },
  UNSUPPORTED_BIT_DEPTH: {
    code: "UNSUPPORTED_BIT_DEPTH",
    retryable: false,
    adminRetryable: false,
    publicMessage: "The WAV bit depth is not supported.",
    adminMessage: "WAV bit depth is outside the supported list.",
  },
  FILE_TOO_LARGE: {
    code: "FILE_TOO_LARGE",
    retryable: false,
    adminRetryable: false,
    publicMessage: "The upload is too large.",
    adminMessage: "Uploaded file exceeds the configured size limit.",
  },
  INVALID_DURATION: {
    code: "INVALID_DURATION",
    retryable: false,
    adminRetryable: false,
    publicMessage: "The WAV duration is invalid.",
    adminMessage: "Duration is missing, zero, or invalid.",
  },
  DECODE_FAILED: {
    code: "DECODE_FAILED",
    retryable: false,
    adminRetryable: false,
    publicMessage: "The WAV file could not be decoded.",
    adminMessage: "Decoder failed to process the WAV data.",
  },
  HASH_FAILED: {
    code: "HASH_FAILED",
    retryable: true,
    adminRetryable: true,
    publicMessage: "The uploaded file could not be verified.",
    adminMessage: "SHA-256 computation failed.",
  },
  METADATA_EXTRACTION_FAILED: {
    code: "METADATA_EXTRACTION_FAILED",
    retryable: true,
    adminRetryable: true,
    publicMessage: "Audio metadata could not be extracted.",
    adminMessage: "ffprobe metadata extraction failed unexpectedly.",
  },
  PREVIEW_GENERATION_FAILED: {
    code: "PREVIEW_GENERATION_FAILED",
    retryable: true,
    adminRetryable: true,
    publicMessage: "Preview audio could not be generated.",
    adminMessage: "Preview transcode failed.",
  },
  WAVEFORM_GENERATION_FAILED: {
    code: "WAVEFORM_GENERATION_FAILED",
    retryable: true,
    adminRetryable: true,
    publicMessage: "Waveform data could not be generated.",
    adminMessage: "Waveform peaks generation failed.",
  },
  DB_UPDATE_FAILED: {
    code: "DB_UPDATE_FAILED",
    retryable: true,
    adminRetryable: true,
    publicMessage: "Processing results could not be saved.",
    adminMessage: "Database update failed while persisting processing results.",
  },
  WORKER_TIMEOUT: {
    code: "WORKER_TIMEOUT",
    retryable: true,
    adminRetryable: true,
    publicMessage: "Audio processing timed out.",
    adminMessage: "Audio worker exceeded the allowed runtime.",
  },
  WORKER_UNAVAILABLE: {
    code: "WORKER_UNAVAILABLE",
    retryable: true,
    adminRetryable: true,
    publicMessage: "Audio processing is temporarily unavailable.",
    adminMessage: "Audio worker endpoint is unavailable.",
  },
  UNKNOWN_PROCESSING_ERROR: {
    code: "UNKNOWN_PROCESSING_ERROR",
    retryable: true,
    adminRetryable: true,
    publicMessage: "Audio processing failed unexpectedly.",
    adminMessage: "Unexpected processing failure.",
  },
} satisfies Record<PipelineErrorCode, PipelineErrorDefinition>;

export function isPipelineErrorCode(code: string | null | undefined): code is PipelineErrorCode {
  return Boolean(code && code in PIPELINE_ERROR_CATALOG);
}

export function getPipelineErrorDefinition(code: string | null | undefined) {
  return isPipelineErrorCode(code)
    ? PIPELINE_ERROR_CATALOG[code]
    : PIPELINE_ERROR_CATALOG.UNKNOWN_PROCESSING_ERROR;
}

export function toSafePipelineError(error: PipelineErrorInput | unknown): SafePipelineError {
  if (isPipelineErrorInput(error)) {
    const definition = getPipelineErrorDefinition(error.code);
    const retryable = error.retryable ?? definition.retryable;

    return {
      code: definition.code,
      message: definition.adminMessage,
      retryable,
      adminRetryable: definition.adminRetryable,
    };
  }

  const definition = PIPELINE_ERROR_CATALOG.UNKNOWN_PROCESSING_ERROR;

  return {
    code: definition.code,
    message: definition.adminMessage,
    retryable: definition.retryable,
    adminRetryable: definition.adminRetryable,
  };
}

export function getPipelineErrorSafeMessage(code: string | null | undefined, audience = "admin") {
  const definition = getPipelineErrorDefinition(code);
  return audience === "public" ? definition.publicMessage : definition.adminMessage;
}

function isPipelineErrorInput(error: unknown): error is PipelineErrorInput {
  return typeof error === "object" && error !== null && ("code" in error || "retryable" in error);
}
