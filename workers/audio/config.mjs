import { AudioWorkerConfigurationError } from "./errors.mjs";

export const DEFAULT_AUDIO_WORKER_SETTINGS = Object.freeze({
  previewFormat: "mp3",
  previewVbrQuality: 2,
  waveformPixelsPerSecond: 20,
  waveformBits: 8,
  waveformSplitChannels: true,
  maxUploadSizeMb: 500,
  maxDurationSeconds: 1800,
  allowedChannels: Object.freeze([1, 2]),
  allowedSampleRates: Object.freeze([44100, 48000, 88200, 96000, 176400, 192000]),
  allowedBitDepths: Object.freeze([16, 24, 32]),
  allowRf64: false,
});

const SETTING_ENV = Object.freeze({
  previewFormat: "AIS_PREVIEW_FORMAT",
  previewVbrQuality: "AIS_PREVIEW_VBR_QUALITY",
  waveformPixelsPerSecond: "AIS_WAVEFORM_PIXELS_PER_SECOND",
  waveformBits: "AIS_WAVEFORM_BITS",
  waveformSplitChannels: "AIS_WAVEFORM_SPLIT_CHANNELS",
  maxUploadSizeMb: "AIS_MAX_UPLOAD_SIZE_MB",
  maxDurationSeconds: "AIS_MAX_DURATION_SECONDS",
  allowedChannels: "AIS_ALLOWED_CHANNELS",
  allowedSampleRates: "AIS_ALLOWED_SAMPLE_RATES",
  allowedBitDepths: "AIS_ALLOWED_BIT_DEPTHS",
});

export function parseAudioWorkerSettings(input = {}, env = process.env) {
  const raw = {
    previewFormat: envValue(env, SETTING_ENV.previewFormat, input.preview_format ?? input.previewFormat),
    previewVbrQuality: envValue(env, SETTING_ENV.previewVbrQuality, input.preview_vbr_quality ?? input.previewVbrQuality),
    waveformPixelsPerSecond: envValue(
      env,
      SETTING_ENV.waveformPixelsPerSecond,
      input.waveform_pixels_per_second ?? input.waveformPixelsPerSecond,
    ),
    waveformBits: envValue(env, SETTING_ENV.waveformBits, input.waveform_bits ?? input.waveformBits),
    waveformSplitChannels: envValue(
      env,
      SETTING_ENV.waveformSplitChannels,
      input.waveform_split_channels ?? input.waveformSplitChannels,
    ),
    maxUploadSizeMb: envValue(env, SETTING_ENV.maxUploadSizeMb, input.max_upload_size_mb ?? input.maxUploadSizeMb),
    maxDurationSeconds: envValue(
      env,
      SETTING_ENV.maxDurationSeconds,
      input.max_duration_seconds ?? input.maxDurationSeconds,
    ),
    allowedChannels: envValue(env, SETTING_ENV.allowedChannels, input.allowed_channels ?? input.allowedChannels),
    allowedSampleRates: envValue(
      env,
      SETTING_ENV.allowedSampleRates,
      input.allowed_sample_rates ?? input.allowedSampleRates,
    ),
    allowedBitDepths: envValue(
      env,
      SETTING_ENV.allowedBitDepths,
      input.allowed_bit_depths ?? input.allowedBitDepths,
    ),
    allowRf64: input.allow_rf64 ?? input.allowRf64,
  };

  const settings = {
    previewFormat: parsePreviewFormat(raw.previewFormat ?? DEFAULT_AUDIO_WORKER_SETTINGS.previewFormat),
    previewVbrQuality: parseIntegerSetting(
      "preview_vbr_quality",
      raw.previewVbrQuality ?? DEFAULT_AUDIO_WORKER_SETTINGS.previewVbrQuality,
      { min: 0, max: 9 },
    ),
    waveformPixelsPerSecond: parseIntegerSetting(
      "waveform_pixels_per_second",
      raw.waveformPixelsPerSecond ?? DEFAULT_AUDIO_WORKER_SETTINGS.waveformPixelsPerSecond,
      { min: 1 },
    ),
    waveformBits: parseWaveformBits(raw.waveformBits ?? DEFAULT_AUDIO_WORKER_SETTINGS.waveformBits),
    waveformSplitChannels: parseBooleanSetting(
      "waveform_split_channels",
      raw.waveformSplitChannels ?? DEFAULT_AUDIO_WORKER_SETTINGS.waveformSplitChannels,
    ),
    maxUploadSizeMb: parseNumberSetting(
      "max_upload_size_mb",
      raw.maxUploadSizeMb ?? DEFAULT_AUDIO_WORKER_SETTINGS.maxUploadSizeMb,
      { minExclusive: 0 },
    ),
    maxDurationSeconds: parseNumberSetting(
      "max_duration_seconds",
      raw.maxDurationSeconds ?? DEFAULT_AUDIO_WORKER_SETTINGS.maxDurationSeconds,
      { minExclusive: 0 },
    ),
    allowedChannels: parseIntegerList(
      "allowed_channels",
      raw.allowedChannels ?? DEFAULT_AUDIO_WORKER_SETTINGS.allowedChannels,
      { min: 1 },
    ),
    allowedSampleRates: parseIntegerList(
      "allowed_sample_rates",
      raw.allowedSampleRates ?? DEFAULT_AUDIO_WORKER_SETTINGS.allowedSampleRates,
      { min: 1 },
    ),
    allowedBitDepths: parseIntegerList(
      "allowed_bit_depths",
      raw.allowedBitDepths ?? DEFAULT_AUDIO_WORKER_SETTINGS.allowedBitDepths,
      { min: 1 },
    ),
    allowRf64: parseBooleanSetting("allow_rf64", raw.allowRf64 ?? DEFAULT_AUDIO_WORKER_SETTINGS.allowRf64),
  };

  return Object.freeze({
    ...settings,
    maxUploadSizeBytes: Math.floor(settings.maxUploadSizeMb * 1024 * 1024),
  });
}

export function parseAudioWorkerConfig(env = process.env, input = {}) {
  const binaryMode = env.AIS_AUDIO_BINARY_MODE?.trim() || "pinned";

  if (!["explicit", "pinned", "system"].includes(binaryMode)) {
    throw new AudioWorkerConfigurationError("AIS_AUDIO_BINARY_MODE must be 'explicit', 'pinned', or 'system'.", {
      AIS_AUDIO_BINARY_MODE: binaryMode,
    });
  }

  const workerMode = env.AIS_AUDIO_WORKER_MODE?.trim() || "check";

  return Object.freeze({
    workerMode,
    binaryMode,
    stayAlive: parseBooleanSetting("AIS_AUDIO_WORKER_STAY_ALIVE", env.AIS_AUDIO_WORKER_STAY_ALIVE ?? false),
    settings: parseAudioWorkerSettings(input.settings ?? input, env),
  });
}

function envValue(env, name, fallback) {
  const value = env[name];
  return value === undefined || value === "" ? fallback : value;
}

function parsePreviewFormat(value) {
  const format = String(value).trim().toLowerCase();

  if (format !== "mp3") {
    throw new AudioWorkerConfigurationError("Only MP3 preview generation is supported in the MVP worker.", {
      preview_format: value,
    });
  }

  return format;
}

function parseWaveformBits(value) {
  const bits = parseIntegerSetting("waveform_bits", value, { min: 1 });

  if (![8, 16].includes(bits)) {
    throw new AudioWorkerConfigurationError("waveform_bits must be 8 or 16.", { waveform_bits: value });
  }

  return bits;
}

function parseNumberSetting(name, value, { minExclusive } = {}) {
  const number = Number(value);

  if (!Number.isFinite(number) || (minExclusive !== undefined && number <= minExclusive)) {
    throw new AudioWorkerConfigurationError(`${name} must be a number greater than ${minExclusive}.`, {
      [name]: value,
    });
  }

  return number;
}

function parseIntegerSetting(name, value, { min, max } = {}) {
  const number = Number(value);

  if (!Number.isInteger(number)) {
    throw new AudioWorkerConfigurationError(`${name} must be an integer.`, { [name]: value });
  }

  if (min !== undefined && number < min) {
    throw new AudioWorkerConfigurationError(`${name} must be at least ${min}.`, { [name]: value });
  }

  if (max !== undefined && number > max) {
    throw new AudioWorkerConfigurationError(`${name} must be at most ${max}.`, { [name]: value });
  }

  return number;
}

function parseIntegerList(name, value, { min } = {}) {
  const values = Array.isArray(value) ? value : String(value).split(",");
  const numbers = values.map((entry) => parseIntegerSetting(name, String(entry).trim(), { min }));

  if (numbers.length === 0) {
    throw new AudioWorkerConfigurationError(`${name} must include at least one value.`, { [name]: value });
  }

  return Object.freeze([...new Set(numbers)]);
}

function parseBooleanSetting(name, value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new AudioWorkerConfigurationError(`${name} must be a boolean value.`, { [name]: value });
}
