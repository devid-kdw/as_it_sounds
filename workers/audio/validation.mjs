import path from "node:path";

import { parseAudioWorkerSettings } from "./config.mjs";
import { createProcessingError } from "./errors.mjs";
import { parseFfprobeMetadata } from "./metadata.mjs";

const WAV_MIME_TYPES = new Set(["audio/wav", "audio/wave", "audio/x-wav", "audio/vnd.wave"]);

export function validateSourceDescriptor(source, settings) {
  const normalizedSettings = normalizeSettings(settings);
  const errors = [];
  const extension = source.filePath ? path.extname(source.filePath).toLowerCase() : "";

  if (extension && extension !== ".wav" && extension !== ".wave") {
    errors.push(createProcessingError("UNSUPPORTED_FORMAT", "Source file must use a WAV extension.", { extension }));
  }

  if (source.mimeType && !WAV_MIME_TYPES.has(String(source.mimeType).toLowerCase())) {
    errors.push(createProcessingError("UNSUPPORTED_FORMAT", "Source MIME type must be WAV-compatible.", {
      mime_type: source.mimeType,
    }));
  }

  if (!Number.isFinite(source.fileSizeBytes) || source.fileSizeBytes <= 0) {
    errors.push(createProcessingError("FILE_TOO_LARGE", "Source file size must be greater than zero.", {
      file_size_bytes: source.fileSizeBytes,
    }));
  } else if (source.fileSizeBytes > normalizedSettings.maxUploadSizeBytes) {
    errors.push(createProcessingError("FILE_TOO_LARGE", "Source file exceeds configured max upload size.", {
      file_size_bytes: source.fileSizeBytes,
      max_upload_size_bytes: normalizedSettings.maxUploadSizeBytes,
    }));
  }

  return validationResult(errors);
}

export function validateWavMetadata(input, maybeSettings) {
  const { metadata, settings } = normalizeValidationInput(input, maybeSettings);
  const errors = [];

  if (!isSupportedWavContainer(metadata.formatName, settings.allowRf64)) {
    errors.push(createProcessingError("INVALID_WAV_CONTAINER", "Container must be RIFF/WAVE.", {
      format_name: metadata.formatName,
      allow_rf64: settings.allowRf64,
    }));
  }

  if (!isSupportedWavEncoding(metadata.codecName)) {
    errors.push(createProcessingError("UNSUPPORTED_WAV_ENCODING", "WAV codec must be PCM or IEEE float.", {
      codec_name: metadata.codecName,
    }));
  }

  if (!settings.allowedChannels.includes(metadata.channels)) {
    errors.push(createProcessingError("UNSUPPORTED_CHANNEL_COUNT", "Channel count is outside configured limits.", {
      channels: metadata.channels,
      allowed_channels: settings.allowedChannels,
    }));
  }

  if (!settings.allowedSampleRates.includes(metadata.sampleRate)) {
    errors.push(createProcessingError("UNSUPPORTED_SAMPLE_RATE", "Sample rate is outside configured limits.", {
      sample_rate: metadata.sampleRate,
      allowed_sample_rates: settings.allowedSampleRates,
    }));
  }

  if (!settings.allowedBitDepths.includes(metadata.bitDepth)) {
    errors.push(createProcessingError("UNSUPPORTED_BIT_DEPTH", "Bit depth is outside configured limits.", {
      bit_depth: metadata.bitDepth,
      allowed_bit_depths: settings.allowedBitDepths,
    }));
  }

  if (!Number.isFinite(metadata.durationSeconds) || metadata.durationSeconds <= 0) {
    errors.push(createProcessingError("INVALID_DURATION", "Duration must be greater than zero.", {
      duration_seconds: metadata.durationSeconds,
    }));
  } else if (metadata.durationSeconds > settings.maxDurationSeconds) {
    errors.push(createProcessingError("INVALID_DURATION", "Duration exceeds configured maximum.", {
      duration_seconds: metadata.durationSeconds,
      max_duration_seconds: settings.maxDurationSeconds,
    }));
  }

  if (!Number.isFinite(metadata.fileSizeBytes) || metadata.fileSizeBytes <= 0) {
    errors.push(createProcessingError("FILE_TOO_LARGE", "File size must be greater than zero.", {
      file_size_bytes: metadata.fileSizeBytes,
    }));
  } else if (metadata.fileSizeBytes > settings.maxUploadSizeBytes) {
    errors.push(createProcessingError("FILE_TOO_LARGE", "File exceeds configured max upload size.", {
      file_size_bytes: metadata.fileSizeBytes,
      max_upload_size_bytes: settings.maxUploadSizeBytes,
    }));
  }

  return validationResult(errors);
}

export function validateWavConstraints({ source, metadata }, settings) {
  const sourceResult = validateSourceDescriptor(source, settings);
  const metadataResult = validateWavMetadata(metadata, settings);
  return validationResult([...sourceResult.errors, ...metadataResult.errors]);
}

export function validateDecodeResult(result) {
  if (result?.ok === true || result?.exitCode === 0) {
    return validationResult([]);
  }

  return validationResult([
    createProcessingError("DECODE_FAILED", "Decoder failed to read WAV data.", {
      decode_error: result?.error ?? result?.stderr,
    }),
  ]);
}

export const validateWavDecodeResult = validateDecodeResult;

export function firstValidationError(result) {
  return result.errors[0] ?? null;
}

export function isSupportedWavContainer(formatName, allowRf64 = false) {
  const formats = String(formatName ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase());

  if (formats.includes("wav")) {
    return true;
  }

  return allowRf64 && formats.includes("rf64");
}

export function isSupportedWavEncoding(codecName) {
  return /^pcm_[suf]\d+/i.test(String(codecName ?? ""));
}

function validationResult(errors) {
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

function normalizeValidationInput(input, maybeSettings) {
  const rawMetadata = input?.metadata ?? input ?? {};
  const rawSettings = maybeSettings ?? input?.settings ?? rawMetadata?.settings ?? {};

  return {
    metadata: normalizeProbeMetadata(rawMetadata),
    settings: normalizeSettings(rawSettings),
  };
}

function normalizeSettings(settings = {}) {
  if (settings.maxUploadSizeBytes && settings.allowedChannels) {
    return settings;
  }

  return parseAudioWorkerSettings(settings, {});
}

function normalizeProbeMetadata(metadata) {
  if (metadata?.streams || metadata?.format) {
    const parsed = parseFfprobeMetadata(
      JSON.stringify({
        streams: metadata.streams ?? [],
        format: metadata.format ?? {},
      }),
      { fallbackFileSizeBytes: metadata.fileSizeBytes },
    );

    return {
      ...parsed,
      fileSizeBytes: metadata.fileSizeBytes ?? parsed.fileSizeBytes,
    };
  }

  return metadata;
}
