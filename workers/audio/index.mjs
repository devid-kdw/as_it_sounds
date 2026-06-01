import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseAudioWorkerConfig } from "./config.mjs";
import { AudioWorkerConfigurationError } from "./errors.mjs";
import { resolveAudioBinaries, toBinaryConfigurationLog } from "./audio-binaries.mjs";
import {
  createAudioWorkerSupabaseClient,
  processInitialUploadJob,
} from "./initial-upload-worker.mjs";

export async function runAudioWorkerCli({
  env = process.env,
  argv = process.argv.slice(2),
  projectRoot = process.cwd(),
  stdout = console.log,
  stderr = console.error,
} = {}) {
  try {
    await loadLocalEnvFiles({ env, projectRoot });
    const config = parseAudioWorkerConfig(env);
    const cli = parseAudioWorkerCliArgs({ argv, env, configuredMode: config.workerMode });
    logJson(stdout, "info", "audio_worker_starting", {
      worker_mode: cli.mode,
      settings: summarizeSettings(config.settings),
    });

    const resolution = await resolveAudioBinaries({ env, projectRoot, binaryMode: config.binaryMode });
    logJson(stdout, "info", "audio_worker_binary_configuration", toBinaryConfigurationLog(resolution));

    if (!resolution.ok) {
      throw new AudioWorkerConfigurationError("Audio worker startup blocked by missing required binaries.", {
        binary_configuration: toBinaryConfigurationLog(resolution),
      });
    }

    if (cli.mode === "check" || cli.mode === "disabled" || cli.mode === "idle") {
      logJson(stdout, "info", "audio_worker_foundation_ready", {
        message:
          "Binary checks, processing helpers, and local initial-upload job execution are available.",
      });

      if (config.stayAlive || cli.mode === "idle") {
        await keepAlive({ stdout });
      }

      return { ok: true, exitCode: 0, config, binaries: resolution.binaries };
    }

    const supabase = createAudioWorkerSupabaseClient(env);

    if (cli.mode === "process" || cli.mode === "once") {
      const result = await processInitialUploadJob({
        processingJobId: cli.processingJobId,
        supabase,
        settings: config.settings,
        binaries: resolution.binaries,
        keepTemp: cli.keepTemp,
        logger: (level, event, payload) => logJson(level === "error" ? stderr : stdout, level, event, payload),
      });
      logJson(result.ok ? stdout : stderr, result.ok ? "info" : "error", "audio_worker_job_result", result);

      return {
        ok: result.ok !== false,
        exitCode: result.ok === false ? 1 : 0,
        config,
        binaries: resolution.binaries,
        result,
      };
    }

    if (cli.mode === "poll") {
      const result = await pollAudioWorker({
        supabase,
        settings: config.settings,
        binaries: resolution.binaries,
        stdout,
        stderr,
        pollIntervalMs: cli.pollIntervalMs,
        keepTemp: cli.keepTemp,
      });

      return { ok: true, exitCode: 0, config, binaries: resolution.binaries, result };
    }

    throw new AudioWorkerConfigurationError("Unsupported AIS audio worker mode.", {
      worker_mode: cli.mode,
      supported_modes: ["check", "disabled", "idle", "process", "once", "poll"],
    });
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

async function pollAudioWorker({
  supabase,
  settings,
  binaries,
  stdout,
  stderr,
  pollIntervalMs,
  keepTemp,
}) {
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  logJson(stdout, "info", "audio_worker_polling", {
    poll_interval_ms: pollIntervalMs,
  });

  while (!stopping) {
    const result = await processInitialUploadJob({
      supabase,
      settings,
      binaries,
      keepTemp,
      logger: (level, event, payload) => logJson(level === "error" ? stderr : stdout, level, event, payload),
    });

    if (result.claimed === false) {
      await sleep(pollIntervalMs);
      continue;
    }

    logJson(result.ok ? stdout : stderr, result.ok ? "info" : "error", "audio_worker_job_result", result);
  }

  logJson(stdout, "info", "audio_worker_stopped", {
    message: "Audio worker polling stopped.",
  });

  return { stopped: true };
}

function parseAudioWorkerCliArgs({ argv, env, configuredMode }) {
  const args = [...argv];
  let mode = configuredMode || "check";
  let processingJobId = env.AIS_PROCESSING_JOB_ID || env.PROCESSING_JOB_ID || null;
  let keepTemp = parseLooseBoolean(env.AIS_AUDIO_WORKER_KEEP_TEMP);
  let pollIntervalMs = parsePositiveInteger(env.AIS_AUDIO_WORKER_POLL_INTERVAL_MS, 2000);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--check") {
      mode = "check";
    } else if (arg === "--once") {
      mode = "once";
    } else if (arg === "--poll") {
      mode = "poll";
    } else if (arg === "--process") {
      mode = "process";
    } else if (arg === "--keep-temp") {
      keepTemp = true;
    } else if (arg === "--job-id" || arg === "--job") {
      processingJobId = args[index + 1] ?? processingJobId;
      index += 1;
    } else if (arg.startsWith("--job-id=")) {
      processingJobId = arg.slice("--job-id=".length);
    } else if (arg.startsWith("--poll-interval-ms=")) {
      pollIntervalMs = parsePositiveInteger(arg.slice("--poll-interval-ms=".length), pollIntervalMs);
    } else if (!arg.startsWith("-") && !processingJobId) {
      processingJobId = arg;
      mode = "process";
    }
  }

  if (mode === "process" && !processingJobId) {
    throw new AudioWorkerConfigurationError("Processing mode requires a processing job ID.", {
      usage: "pnpm worker:audio -- --job-id <processing_job_id>",
    });
  }

  return { mode, processingJobId, keepTemp, pollIntervalMs };
}

async function loadLocalEnvFiles({ env, projectRoot }) {
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(projectRoot, filename);
    let contents;

    try {
      contents = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    for (const [key, value] of parseEnvFile(contents)) {
      if (env[key] === undefined) {
        env[key] = value;
      }
    }
  }
}

function parseEnvFile(contents) {
  const entries = [];

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    entries.push([key, unquoteEnvValue(rawValue)]);
  }

  return entries;
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  const commentIndex = value.search(/\s#/);
  return commentIndex === -1 ? value : value.slice(0, commentIndex).trim();
}

function parseLooseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function parsePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runAudioWorkerCli();
  process.exitCode = result.exitCode;
}
