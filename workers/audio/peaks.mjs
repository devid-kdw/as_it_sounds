export function buildWaveformObjectPath({ sampleId, processingJobId }) {
  return `samples/${sampleId}/waveform/${processingJobId}.json`;
}

export function buildWaveformCommand({ audiowaveformPath, inputFile, outputFile, settings }) {
  const args = [
    "-i",
    inputFile,
    "-o",
    outputFile,
    "--pixels-per-second",
    String(settings.waveformPixelsPerSecond),
    "--bits",
    String(settings.waveformBits),
  ];

  if (settings.waveformSplitChannels) {
    args.push("--split-channels");
  }

  return {
    command: audiowaveformPath,
    args,
  };
}

export function parseWaveformPeaksJson(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  const requiredKeys = ["version", "channels", "sample_rate", "samples_per_pixel", "bits", "length", "data"];

  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`Waveform peaks JSON is missing '${key}'.`);
    }
  }

  if (!Array.isArray(parsed.data)) {
    throw new Error("Waveform peaks JSON data must be an array.");
  }

  return parsed;
}
