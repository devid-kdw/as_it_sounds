import { AudioWorkerConfigurationError } from "./errors.mjs";

const BROWSER_SAFE_MP3_SAMPLE_RATES = new Set([44100, 48000]);

export function buildPreviewObjectPath({ sampleId, processingJobId, format = "mp3" }) {
  return `samples/${sampleId}/preview/${processingJobId}.${format}`;
}

export function buildPreviewCommand({
  ffmpegPath,
  inputFile,
  outputFile,
  settings,
  sourceSampleRate = null,
}) {
  if (settings.previewFormat !== "mp3") {
    throw new AudioWorkerConfigurationError("Only MP3 preview command construction is supported.", {
      preview_format: settings.previewFormat,
    });
  }

  const args = [
    "-nostdin",
    "-hide_banner",
    "-y",
    "-i",
    inputFile,
    "-vn",
    "-codec:a",
    "libmp3lame",
    "-qscale:a",
    String(settings.previewVbrQuality),
  ];

  if (sourceSampleRate && !BROWSER_SAFE_MP3_SAMPLE_RATES.has(sourceSampleRate)) {
    args.push("-ar", "44100");
  }

  args.push(outputFile);

  return {
    command: ffmpegPath,
    args,
  };
}
