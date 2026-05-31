import assert from "node:assert/strict";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import test from "node:test";

const root = process.cwd();

const binaryExportNames = [
  "resolveAudioBinaries",
  "resolveRequiredAudioBinaries",
  "resolveAudioWorkerBinaries",
];

const validationExportNames = [
  "validateWavMetadata",
  "validateWavProbeMetadata",
  "validateWavFileMetadata",
  "validateWavSource",
];

const binaryModuleCandidates = [
  "workers/audio/audio-binaries.mjs",
  "workers/audio/audio-binaries.js",
  "scripts/audio-worker.mjs",
  "scripts/placeholders/audio-worker.mjs",
];

const validationModuleCandidates = [
  "workers/audio/validation.mjs",
  "workers/audio/validation.js",
  "workers/audio/wav-validation.mjs",
  "workers/audio/wav-validation.js",
  "workers/audio/audio-validation.mjs",
  "workers/audio/audio-validation.js",
  "scripts/audio-worker.mjs",
  "scripts/placeholders/audio-worker.mjs",
];

async function source(filePath) {
  return readFile(path.join(root, filePath), "utf8");
}

async function exists(filePath) {
  try {
    await access(path.join(root, filePath));
    return true;
  } catch {
    return false;
  }
}

function sourceExports(sourceText, exportName) {
  return new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let)\\s+${exportName}\\b`).test(sourceText)
    || new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`).test(sourceText);
}

async function findExportingModule(candidates, exportNames) {
  for (const candidate of candidates) {
    if (!(await exists(candidate))) {
      continue;
    }

    const sourceText = await source(candidate);
    const exportName = exportNames.find((name) => sourceExports(sourceText, name));

    if (exportName) {
      const loadedModule = await import(pathToFileURL(path.join(root, candidate)).href);
      return { candidate, exportName, fn: loadedModule[exportName] };
    }
  }

  return null;
}

async function withProcessEnv(overrides, callback) {
  const previous = new Map();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function callResolver(fn, env) {
  return withProcessEnv(env, async () => {
    const attempts = [
      () => fn({ env, allowSystem: false }),
      () => fn({ env }),
      () => fn(env),
      () => fn(),
    ];
    let lastError;

    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  });
}

async function createExecutableFixtures() {
  const dir = await mkdtemp(path.join(tmpdir(), "ais-audio-binaries-"));
  const files = {
    ffmpeg: path.join(dir, "ffmpeg"),
    ffprobe: path.join(dir, "ffprobe"),
    audiowaveform: path.join(dir, "audiowaveform"),
  };

  await Promise.all(Object.values(files).map(async (filePath) => {
    await writeFile(filePath, "#!/bin/sh\nexit 0\n");
    await chmod(filePath, 0o755);
  }));

  return {
    dir,
    files,
    async cleanup() {
      await rm(dir, { force: true, recursive: true });
    },
  };
}

function resultContainsAllPaths(result, files) {
  const text = inspect(result, { depth: 8 });
  return Object.values(files).every((filePath) => text.includes(filePath));
}

function validMetadata(overrides = {}) {
  return {
    formatName: "wav",
    codecName: "pcm_s24le",
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    durationSeconds: 1.25,
    fileSizeBytes: 1024 * 1024,
    ...overrides,
  };
}

function validationSettings(overrides = {}) {
  return {
    maxUploadSizeBytes: 500 * 1024 * 1024,
    maxDurationSeconds: 1800,
    allowedChannels: [1, 2],
    allowedSampleRates: [44100, 48000, 88200, 96000, 176400, 192000],
    allowedBitDepths: [16, 24, 32],
    allowRf64: false,
    ...overrides,
  };
}

function validSource(overrides = {}) {
  return {
    filePath: "valid-stereo-48k-24bit.wav",
    mimeType: "audio/wav",
    fileSizeBytes: 1024 * 1024,
    ...overrides,
  };
}

async function callValidator(fn, metadata, settings = validationSettings()) {
  const attempts = [
    () => fn(metadata, settings),
    () => fn({ metadata, settings }),
    () => fn({
      ...metadata,
      settings: {
        max_upload_size_mb: 500,
        max_duration_seconds: 1800,
        allowed_channels: settings.allowedChannels,
        allowed_sample_rates: settings.allowedSampleRates,
        allowed_bit_depths: settings.allowedBitDepths,
      },
    }),
  ];
  let lastError;

  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function isValidationOk(result) {
  return result === true || result?.ok === true || result?.valid === true;
}

function validationCode(result) {
  return result?.code
    ?? result?.errorCode
    ?? result?.failureCode
    ?? result?.error?.code
    ?? result?.errors?.[0]?.code;
}

test("audio worker does not contain fake accepted waveform output paths", async () => {
  const worker = await source("scripts/placeholders/audio-worker.mjs");

  assert.doesNotMatch(
    worker,
    /waveform[\s\S]{0,160}(fake|stub|\[\s*\]|fill\(0\))/i,
    "accepted waveform outputs must come from audiowaveform, not fake placeholders",
  );
});

test("binary resolver accepts explicit executable fixtures when implemented", async (t) => {
  const resolvedModule = await findExportingModule(binaryModuleCandidates, binaryExportNames);

  if (!resolvedModule) {
    t.skip("Audio binary resolver export is not implemented yet.");
    return;
  }

  const fixtures = await createExecutableFixtures();
  t.after(fixtures.cleanup);

  const result = await callResolver(resolvedModule.fn, {
    AIS_FFMPEG_PATH: fixtures.files.ffmpeg,
    AIS_FFPROBE_PATH: fixtures.files.ffprobe,
    AIS_AUDIOWAVEFORM_PATH: fixtures.files.audiowaveform,
    AIS_AUDIO_BINARY_MODE: "pinned",
  });

  assert.ok(
    resultContainsAllPaths(result, fixtures.files),
    `${resolvedModule.candidate} did not resolve all fixture binary paths`,
  );
});

test("binary resolver fails visibly for missing binaries when implemented", async (t) => {
  const resolvedModule = await findExportingModule(binaryModuleCandidates, binaryExportNames);

  if (!resolvedModule) {
    t.skip("Audio binary resolver export is not implemented yet.");
    return;
  }

  let result;
  let thrown;

  try {
    result = await callResolver(resolvedModule.fn, {
      AIS_FFMPEG_PATH: "/definitely/missing/ffmpeg",
      AIS_FFPROBE_PATH: "/definitely/missing/ffprobe",
      AIS_AUDIOWAVEFORM_PATH: "/definitely/missing/audiowaveform",
      AIS_AUDIO_BINARY_MODE: "pinned",
    });
  } catch (error) {
    thrown = error;
  }

  const visibleFailureText = inspect(thrown ?? result, { depth: 8 });
  assert.match(visibleFailureText, /ffmpeg|ffprobe|audiowaveform|binary|configuration|executable/i);
  assert.ok(thrown || result?.ok === false || result?.valid === false, "missing binaries must not resolve as success");
});

test("WAV metadata validator covers accepted and rejected fixture-like cases when implemented", async (t) => {
  const resolvedModule = await findExportingModule(validationModuleCandidates, validationExportNames);

  if (!resolvedModule) {
    t.skip("WAV validation export is not implemented yet.");
    return;
  }

  const accepted = await callValidator(resolvedModule.fn, validMetadata());
  assert.ok(isValidationOk(accepted), "valid stereo 48 kHz 24-bit WAV metadata should be accepted");

  const cases = [
    ["invalid container", validMetadata({ formatName: "matroska" }), "INVALID_WAV_CONTAINER"],
    ["unsupported sample rate", validMetadata({ sampleRate: 22050 }), "UNSUPPORTED_SAMPLE_RATE"],
    ["unsupported bit depth", validMetadata({ bitDepth: 20 }), "UNSUPPORTED_BIT_DEPTH"],
    ["unsupported channels", validMetadata({ channels: 6 }), "UNSUPPORTED_CHANNEL_COUNT"],
    ["zero duration", validMetadata({ durationSeconds: 0 }), "INVALID_DURATION"],
    ["too-large file", validMetadata({ fileSizeBytes: 501 * 1024 * 1024 }), "FILE_TOO_LARGE"],
  ];

  for (const [label, metadata, expectedCode] of cases) {
    const result = await callValidator(resolvedModule.fn, metadata);

    assert.ok(!isValidationOk(result), `${label} should be rejected`);
    assert.equal(validationCode(result), expectedCode, `${label} should map to ${expectedCode}`);
  }
});

test("WAV source descriptor validator covers extension and size checks when implemented", async (t) => {
  const resolvedModule = await findExportingModule(validationModuleCandidates, ["validateSourceDescriptor"]);

  if (!resolvedModule) {
    t.skip("WAV source descriptor validation export is not implemented yet.");
    return;
  }

  const accepted = await resolvedModule.fn(validSource(), validationSettings());
  assert.ok(isValidationOk(accepted), "valid WAV source descriptor should be accepted");

  const unsupportedExtension = await resolvedModule.fn(validSource({ filePath: "sample.aiff" }), validationSettings());
  assert.equal(validationCode(unsupportedExtension), "UNSUPPORTED_FORMAT");

  const tooLarge = await resolvedModule.fn(validSource({ fileSizeBytes: 501 * 1024 * 1024 }), validationSettings());
  assert.equal(validationCode(tooLarge), "FILE_TOO_LARGE");
});

test("decode failure validation is exposed when implemented", async (t) => {
  const resolvedModule = await findExportingModule(validationModuleCandidates, ["validateDecodeResult", "validateWavDecodeResult"]);

  if (!resolvedModule) {
    t.skip("Decode failure validation export is not implemented yet.");
    return;
  }

  const result = await resolvedModule.fn({ ok: false, error: "fixture decode failed" });
  assert.ok(!isValidationOk(result), "decode failure fixture should be rejected");
  assert.equal(validationCode(result), "DECODE_FAILED");
});
