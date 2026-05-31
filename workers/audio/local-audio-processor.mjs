import path from "node:path";

import { buildPreviewCommand, buildPreviewObjectPath } from "./preview.mjs";
import { buildWaveformCommand, buildWaveformObjectPath } from "./peaks.mjs";

export function buildLocalProcessingPlan({
  sampleId,
  processingJobId,
  inputFile,
  outputDirectory,
  settings,
  binaries,
  metadata,
}) {
  const previewObjectPath = buildPreviewObjectPath({
    sampleId,
    processingJobId,
    format: settings.previewFormat,
  });
  const waveformObjectPath = buildWaveformObjectPath({ sampleId, processingJobId });
  const previewFile = path.join(outputDirectory, previewObjectPath);
  const waveformFile = path.join(outputDirectory, waveformObjectPath);

  return {
    preview: {
      objectPath: previewObjectPath,
      file: previewFile,
      command: buildPreviewCommand({
        ffmpegPath: binaries.ffmpeg.path,
        inputFile,
        outputFile: previewFile,
        settings,
        sourceSampleRate: metadata?.sampleRate ?? null,
      }),
    },
    waveform: {
      objectPath: waveformObjectPath,
      file: waveformFile,
      command: buildWaveformCommand({
        audiowaveformPath: binaries.audiowaveform.path,
        inputFile,
        outputFile: waveformFile,
        settings,
      }),
    },
  };
}
