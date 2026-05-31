import { parseAudioWorkerSettings } from "./config.mjs";
import { createProcessingError } from "./errors.mjs";
import { parseFfprobeMetadata } from "./metadata.mjs";
import {
  validateSourceDescriptor,
  validateWavMetadata as validateNormalizedWavMetadata,
} from "./validation.mjs";

export function validateWavProbeMetadata(input, maybeSettings) {
  return validateWavMetadata(input, maybeSettings);
}

export function validateWavFileMetadata(input, maybeSettings) {
  return validateWavMetadata(input, maybeSettings);
}

export function validateWavSource(input, maybeSettings) {
  return validateWavMetadata(input, maybeSettings);
}

export function validateWavMetadata(input, maybeSettings) {
  const { metadata, settings } = unwrapValidationInput(input, maybeSettings);
  const normalizedSettings = normalizeSettings(settings);
  const source = normalizeSourceDescriptor(metadata);
  const normalizedMetadata = normalizeMetadata(metadata);
  const sourceResult = validateSourceDescriptor(source, normalizedSettings);
  const metadataResult = validateNormalizedWavMetadata(normalizedMetadata, normalizedSettings);
  const errors = [...sourceResult.errors, ...metadataResult.errors];

  if (metadata.decodeOk === false) {
    errors.push(createProcessingError("DECODE_FAILED", "Decoder failed to read WAV data.", {
      decode_error: metadata.decodeError,
    }));
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

function unwrapValidationInput(input, maybeSettings) {
  if (input?.metadata) {
    return {
      metadata: input.metadata,
      settings: maybeSettings ?? input.settings ?? input.metadata.settings,
    };
  }

  return {
    metadata: input,
    settings: maybeSettings ?? input?.settings,
  };
}

function normalizeSettings(settings = {}) {
  if (settings.maxUploadSizeBytes && settings.allowedChannels) {
    return settings;
  }

  return parseAudioWorkerSettings(settings, {});
}

function normalizeSourceDescriptor(metadata) {
  return {
    filePath: metadata.filePath ?? metadata.filename,
    mimeType: metadata.mimeType,
    fileSizeBytes: metadata.fileSizeBytes ?? numberOrNull(metadata.format?.size),
  };
}

function normalizeMetadata(metadata) {
  if (metadata.streams || metadata.format) {
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

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
