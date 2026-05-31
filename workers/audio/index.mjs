import { pathToFileURL } from "node:url";

import { parseAudioWorkerConfig } from "./config.mjs";
import { AudioWorkerConfigurationError } from "./errors.mjs";
import { resolveAudioBinaries, toBinaryConfigurationLog } from "./audio-binaries.mjs";

export async function runAudioWorkerCli({
  env = process.env,
  projectRoot = process.cwd(),
  stdout = console.log,
  stderr = console.error,
} = {}) {
  try {
    const config = parseAudioWorkerConfig(env);
    logJson(stdout, "info", "audio_worker_starting", {
      worker_mode: config.workerMode,
      settings: summarizeSettings(config.settings),
    });

    const resolution = await resolveAudioBinaries({ env, projectRoot, binaryMode: config.binaryMode });
    logJson(stdout, "info", "audio_worker_binary_configuration", toBinaryConfigurationLog(resolution));

    if (!resolution.ok) {
      throw new AudioWorkerConfigurationError("Audio worker startup blocked by missing required binaries.", {
        binary_configuration: toBinaryConfigurationLog(resolution),
      });
    }

    logJson(stdout, "info", "audio_worker_foundation_ready", {
      message:
        "Binary checks and pure processing helpers are ready. Job polling and storage mutation are intentionally not enabled in this foundation phase.",
    });

    if (config.stayAlive || config.workerMode === "idle") {
      await keepAlive({ stdout });
    }

    return { ok: true, exitCode: 0, config, binaries: resolution.binaries };
  } catch (error) {
    const details = error instanceof AudioWorkerConfigurationError ? error.details : {};
    logJson(stderr, "error", "audio_worker_configuration_error", {
      message: error.message,
      details,
    });

    return { ok: false, exitCode: 1, error };
  }
}

function summarizeSettings(settings) {
  return {
    preview_format: settings.previewFormat,
    preview_vbr_quality: settings.previewVbrQuality,
    waveform_pixels_per_second: settings.waveformPixelsPerSecond,
    waveform_bits: settings.waveformBits,
    waveform_split_channels: settings.waveformSplitChannels,
    max_upload_size_mb: settings.maxUploadSizeMb,
    max_duration_seconds: settings.maxDurationSeconds,
    allowed_channels: settings.allowedChannels,
    allowed_sample_rates: settings.allowedSampleRates,
    allowed_bit_depths: settings.allowedBitDepths,
  };
}

function logJson(write, level, event, payload) {
  write(JSON.stringify({ level, event, ...payload }));
}

async function keepAlive({ stdout }) {
  logJson(stdout, "info", "audio_worker_idle", {
    message: "Worker is staying alive for local supervision; no processing jobs are claimed by this foundation runner.",
  });

  await new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runAudioWorkerCli();
  process.exitCode = result.exitCode;
}
