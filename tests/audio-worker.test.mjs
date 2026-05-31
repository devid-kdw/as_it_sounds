import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveAudioBinaries } from "../workers/audio/audio-binaries.mjs";
import { parseAudioWorkerSettings } from "../workers/audio/config.mjs";
import { createProcessingError } from "../workers/audio/errors.mjs";
import { sha256Buffer } from "../workers/audio/hashing.mjs";
import { buildFfprobeCommand, parseFfprobeMetadata } from "../workers/audio/metadata.mjs";
import { buildWaveformCommand } from "../workers/audio/peaks.mjs";
import { buildPreviewCommand } from "../workers/audio/preview.mjs";
import { createWorkerFailurePayload, createWorkerSuccessPayload } from "../workers/audio/result-types.mjs";
import { validateWavMetadata } from "../workers/audio/validation.mjs";

test("audio worker settings parse Doc 03 defaults and env overrides", () => {
  const defaults = parseAudioWorkerSettings({}, {});

  assert.equal(defaults.previewFormat, "mp3");
  assert.equal(defaults.previewVbrQuality, 2);
  assert.equal(defaults.waveformPixelsPerSecond, 20);
  assert.equal(defaults.waveformBits, 8);
  assert.equal(defaults.waveformSplitChannels, true);
  assert.equal(defaults.maxUploadSizeMb, 500);
  assert.equal(defaults.maxDurationSeconds, 1800);
  assert.deepEqual(defaults.allowedChannels, [1, 2]);
  assert.deepEqual(defaults.allowedSampleRates, [44100, 48000, 88200, 96000, 176400, 192000]);
  assert.deepEqual(defaults.allowedBitDepths, [16, 24, 32]);

  const customized = parseAudioWorkerSettings(
    {},
    {
      AIS_PREVIEW_VBR_QUALITY: "3",
      AIS_WAVEFORM_PIXELS_PER_SECOND: "30",
      AIS_WAVEFORM_SPLIT_CHANNELS: "false",
      AIS_ALLOWED_SAMPLE_RATES: "44100,48000",
    },
  );

  assert.equal(customized.previewVbrQuality, 3);
  assert.equal(customized.waveformPixelsPerSecond, 30);
  assert.equal(customized.waveformSplitChannels, false);
  assert.deepEqual(customized.allowedSampleRates, [44100, 48000]);
});

test("binary resolution uses project-pinned tools before system fallback", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ais-audio-bins-"));
  const binDir = path.join(projectRoot, "workers/audio/bin");
  await mkdir(binDir, { recursive: true });

  for (const binary of ["ffmpeg", "ffprobe", "audiowaveform"]) {
    const filePath = path.join(binDir, binary);
    await writeFile(filePath, "#!/bin/sh\nexit 0\n");
    await chmod(filePath, 0o755);
  }

  const resolution = await resolveAudioBinaries({
    env: { PATH: "" },
    projectRoot,
    binaryMode: "pinned",
  });

  assert.equal(resolution.ok, true);
  assert.equal(resolution.binaries.ffmpeg.source, "project-pinned");
  assert.equal(resolution.binaries.ffprobe.source, "project-pinned");
  assert.equal(resolution.binaries.audiowaveform.source, "project-pinned");
});

test("binary resolution only searches PATH when AIS_AUDIO_BINARY_MODE is system", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ais-audio-no-pinned-"));
  const systemDir = path.join(projectRoot, "system");
  await mkdir(systemDir, { recursive: true });

  for (const binary of ["ffmpeg", "ffprobe", "audiowaveform"]) {
    const filePath = path.join(systemDir, binary);
    await writeFile(filePath, "#!/bin/sh\nexit 0\n");
    await chmod(filePath, 0o755);
  }

  const pinnedOnly = await resolveAudioBinaries({
    env: { PATH: systemDir },
    projectRoot,
    binaryMode: "pinned",
  });

  assert.equal(pinnedOnly.ok, false);
  assert.equal(pinnedOnly.missing.length, 3);

  const system = await resolveAudioBinaries({
    env: { PATH: systemDir },
    projectRoot,
    binaryMode: "system",
  });

  assert.equal(system.ok, true);
  assert.equal(system.binaries.ffmpeg.source, "system");
});

test("ffprobe metadata parsing and WAV validation accept supported PCM WAV", () => {
  const metadata = parseFfprobeMetadata(
    JSON.stringify({
      streams: [
        {
          codec_type: "audio",
          codec_name: "pcm_s24le",
          sample_rate: "48000",
          channels: 2,
          duration: "12.345",
          bits_per_raw_sample: "24",
          bit_rate: "2304000",
        },
      ],
      format: {
        format_name: "wav",
        duration: "12.345",
        size: "12345678",
      },
    }),
  );
  const settings = parseAudioWorkerSettings({}, {});
  const result = validateWavMetadata(metadata, settings);

  assert.equal(metadata.durationSeconds, 12.345);
  assert.equal(metadata.fileSizeBytes, 12345678);
  assert.equal(metadata.sampleRate, 48000);
  assert.equal(metadata.bitDepth, 24);
  assert.equal(metadata.channels, 2);
  assert.equal(metadata.mimeType, "audio/wav");
  assert.equal(result.ok, true);
});

test("WAV validation reports Doc 03 failure codes for unsupported files", () => {
  const settings = parseAudioWorkerSettings({}, {});
  const result = validateWavMetadata(
    {
      formatName: "mp3",
      codecName: "mp3",
      sampleRate: 22050,
      bitDepth: 8,
      channels: 6,
      durationSeconds: 0,
      fileSizeBytes: settings.maxUploadSizeBytes + 1,
    },
    settings,
  );

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.code),
    [
      "INVALID_WAV_CONTAINER",
      "UNSUPPORTED_WAV_ENCODING",
      "UNSUPPORTED_CHANNEL_COUNT",
      "UNSUPPORTED_SAMPLE_RATE",
      "UNSUPPORTED_BIT_DEPTH",
      "INVALID_DURATION",
      "FILE_TOO_LARGE",
    ],
  );
});

test("command builders construct ffprobe, preview, and audiowaveform invocations", () => {
  const settings = parseAudioWorkerSettings({}, {});
  const ffprobe = buildFfprobeCommand("/tools/ffprobe", "/tmp/source.wav");
  const preview = buildPreviewCommand({
    ffmpegPath: "/tools/ffmpeg",
    inputFile: "/tmp/source.wav",
    outputFile: "/tmp/preview.mp3",
    settings,
    sourceSampleRate: 96000,
  });
  const waveform = buildWaveformCommand({
    audiowaveformPath: "/tools/audiowaveform",
    inputFile: "/tmp/source.wav",
    outputFile: "/tmp/peaks.json",
    settings,
  });

  assert.equal(ffprobe.command, "/tools/ffprobe");
  assert.match(ffprobe.args.join(" "), /-of json/);
  assert.deepEqual(preview.args.slice(-3), ["-ar", "44100", "/tmp/preview.mp3"]);
  assert.match(preview.args.join(" "), /-codec:a libmp3lame -qscale:a 2/);
  assert.match(waveform.args.join(" "), /--pixels-per-second 20 --bits 8 --split-channels/);
});

test("hashing and structured result helpers are deterministic", () => {
  const hash = sha256Buffer(Buffer.from("ais"));
  const error = createProcessingError("DECODE_FAILED", "Decoder failed to read WAV data.");
  const failure = createWorkerFailurePayload({
    sampleId: "sample",
    processingJobId: "job",
    error,
  });
  const success = createWorkerSuccessPayload({
    sampleId: "sample",
    processingJobId: "job",
    source: { sha256: hash },
    assets: {},
  });

  assert.equal(hash, "0823962774e7e15603838e01a0ba8b0a59ba43a7cf76eb4c02971c29ac8089f6");
  assert.equal(failure.ok, false);
  assert.equal(failure.error.code, "DECODE_FAILED");
  assert.equal(failure.error.retryable, false);
  assert.equal(success.ok, true);
  assert.equal(success.tool_versions.constructor, Object);
});
