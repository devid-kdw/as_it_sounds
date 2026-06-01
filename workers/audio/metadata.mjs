import { AudioProcessingError } from "./errors.mjs";
import { runAudioCommand } from "./commands.mjs";

export function buildFfprobeCommand(ffprobePath, inputFile) {
  return {
    command: ffprobePath,
    args: [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name,codec_type,sample_rate,channels,duration,bits_per_raw_sample,bits_per_sample,bit_rate:format=format_name,duration,size",
      "-of",
      "json",
      inputFile,
    ],
  };
}

export function buildDecodeTestCommand(ffmpegPath, inputFile) {
  return {
    command: ffmpegPath,
    args: ["-nostdin", "-v", "error", "-i", inputFile, "-f", "null", "-"],
  };
}

export function parseFfprobeMetadata(output, { fallbackFileSizeBytes = null } = {}) {
  let parsed;

  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new AudioProcessingError("METADATA_EXTRACTION_FAILED", "ffprobe returned invalid JSON.", {
      parser_error: error.message,
    });
  }

  const stream = parsed.streams?.find((entry) => entry.codec_type === "audio") ?? parsed.streams?.[0];

  if (!stream) {
    throw new AudioProcessingError("METADATA_EXTRACTION_FAILED", "ffprobe did not return an audio stream.");
  }

  const format = parsed.format ?? {};
  const formatName = typeof format.format_name === "string" ? format.format_name : null;
  const codecName = typeof stream.codec_name === "string" ? stream.codec_name : null;
  const durationSeconds = firstFiniteNumber(stream.duration, format.duration);
  const fileSizeBytes = firstFiniteInteger(format.size, fallbackFileSizeBytes);
  const sampleRate = firstFiniteInteger(stream.sample_rate);
  const bitDepth = deriveBitDepth(stream);
  const channels = firstFiniteInteger(stream.channels);

  return {
    durationSeconds,
    fileSizeBytes,
    sampleRate,
    bitDepth,
    channels,
    codecName,
    formatName,
    bitRate: firstFiniteInteger(stream.bit_rate),
    mimeType: formatName?.split(",").includes("wav") ? "audio/wav" : null,
    raw: parsed,
  };
}

export async function runFfprobeMetadata({
  ffprobePath,
  inputFile,
  timeoutMs = 30_000,
  spawnImpl,
}) {
  const { command, args } = buildFfprobeCommand(ffprobePath, inputFile);
  const result = await runAudioCommand({
    command,
    args,
    timeoutMs,
    spawnImpl,
    errorCode: "METADATA_EXTRACTION_FAILED",
    errorMessage: "ffprobe failed while reading audio metadata.",
  });

  if (result.exitCode !== 0) {
    throw new AudioProcessingError("METADATA_EXTRACTION_FAILED", "ffprobe failed while reading audio metadata.", {
      exit_code: result.exitCode,
      stderr: result.stderr,
    });
  }

  return parseFfprobeMetadata(result.stdout);
}

function deriveBitDepth(stream) {
  const explicit = firstFiniteInteger(stream.bits_per_raw_sample, stream.bits_per_sample);

  if (explicit) {
    return explicit;
  }

  const codecName = typeof stream.codec_name === "string" ? stream.codec_name : "";
  const match = codecName.match(/^pcm_[suf](\d+)/);
  return match ? Number(match[1]) : null;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "N/A") {
      continue;
    }

    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function firstFiniteInteger(...values) {
  for (const value of values) {
    const number = firstFiniteNumber(value);

    if (Number.isInteger(number)) {
      return number;
    }
  }

  return null;
}
