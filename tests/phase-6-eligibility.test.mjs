import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const requireFromTest = createRequire(import.meta.url);

async function readProjectFile(filePath) {
  return readFile(path.join(root, filePath), "utf8");
}

async function loadProjectTsModule(filePath, mocks = {}) {
  const absolutePath = path.join(root, filePath);
  const source = await readProjectFile(filePath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  });
  const compiledModule = { exports: {} };

  function localRequire(specifier) {
    if (specifier in mocks) {
      return mocks[specifier];
    }

    if (specifier === "server-only") {
      return {};
    }

    return requireFromTest(specifier);
  }

  vm.runInNewContext(
    transpiled.outputText,
    {
      Date,
      Error,
      Math,
      RegExp,
      console,
      exports: compiledModule.exports,
      module: compiledModule,
      require: localRequire,
    },
    { filename: absolutePath },
  );

  return compiledModule.exports;
}

async function loadAdminSamplesModule() {
  const z = requireFromTest("zod");
  const errors = await loadProjectTsModule("lib/errors.ts");

  return loadProjectTsModule("lib/admin-samples.ts", {
    "@/lib/errors": errors,
    "@/lib/routes": {
      sampleDetailRoute: (poeticName) => `/samples/${poeticName}`,
    },
    "@/lib/storage": {
      createDefaultStorageProvider() {
        throw new Error("storage is not used by pure eligibility tests");
      },
    },
    "@/lib/supabase/admin": {
      createSupabaseAdminClient() {
        throw new Error("database is not used by pure eligibility tests");
      },
    },
    "@/lib/admin-audit": {
      writeAdminAuditLog: async () => undefined,
    },
    "@/lib/validators": {
      poeticNameSchema: z
        .string()
        .min(1)
        .max(120)
        .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
      uuidSchema: z.string().uuid(),
    },
  });
}

function baseContext(overrides = {}) {
  const { sample: sampleOverrides, ...contextOverrides } = overrides;
  const sample = {
    id: "sample-1",
    poetic_name: "cold_radio_in_empty_room",
    display_title: "Cold Radio in Empty Room",
    short_description: "A thin radio tone leaning into room air.",
    category_slug: "textures",
    sample_type_slug: "texture",
    bpm: null,
    musical_key: null,
    is_melodic: false,
    unknown_key_confirmed: false,
    duration_seconds: 12.5,
    loopable: false,
    sample_rate: 48000,
    channels: 2,
    status: "needs_review",
    license_status: "verified",
    source_type: "original_recording",
    rights_owner: "AIS",
    commercial_use_allowed: true,
    redistribution_allowed: false,
    license_confirmed_at: "2026-06-01T12:00:00.000Z",
    license_confirmed_by: "admin-1",
    featured: false,
    ...(sampleOverrides ?? {}),
  };

  return {
    sample,
    moodSlugs: ["cold"],
    hiddenTagSlugs: ["dark_ambience"],
    albumIds: ["album-1"],
    categoryActive: true,
    sampleTypeActive: true,
    poeticNameIsUnique: true,
    latestInitialUploadJob: { status: "succeeded" },
    assets: [
      { kind: "original_wav", label: "Original WAV", status: "present", access_level: "private", public_url: null },
      { kind: "preview_audio", label: "Preview audio", status: "present", access_level: "public", public_url: "https://example.test/preview.mp3" },
      { kind: "waveform_peaks", label: "Waveform peaks", status: "present", access_level: "public", public_url: "https://example.test/waveform.json" },
    ],
    duplicateWarning: { is_duplicate: false, acknowledged: false },
    ...contextOverrides,
  };
}

function blockerCodes(eligibility) {
  return eligibility.blockers.map((blocker) => blocker.code).sort();
}

test("Phase 6 publish eligibility succeeds when all curation gates are resolved", async () => {
  const { computePublishEligibility } = await loadAdminSamplesModule();
  const eligibility = computePublishEligibility(baseContext());

  assert.equal(eligibility.can_publish, true);
  assert.equal(eligibility.blockers.length, 0);
});

test("Phase 6 publish eligibility blocks unsafe license and missing generated assets", async () => {
  const { computePublishEligibility } = await loadAdminSamplesModule();
  const eligibility = computePublishEligibility(
    baseContext({
      sample: {
        license_status: "unverified",
        license_confirmed_at: null,
        license_confirmed_by: null,
      },
      assets: [
        { kind: "original_wav", label: "Original WAV", status: "present", access_level: "private", public_url: null },
        { kind: "preview_audio", label: "Preview audio", status: "missing_row", access_level: null, public_url: null },
        { kind: "waveform_peaks", label: "Waveform peaks", status: "missing_object", access_level: "public", public_url: null },
      ],
    }),
  );

  assert.equal(eligibility.can_publish, false);
  assert.equal(
    blockerCodes(eligibility).join(","),
    "license_not_confirmed,license_not_verified,missing_preview_asset,missing_waveform_asset",
  );
});

test("Phase 6 publish eligibility blocks mood count, loop BPM, and melodic key rules", async () => {
  const { computePublishEligibility } = await loadAdminSamplesModule();
  const loopEligibility = computePublishEligibility(
    baseContext({
      sample: { sample_type_slug: "loop", loopable: true, bpm: null, is_melodic: true, musical_key: null, unknown_key_confirmed: false },
      moodSlugs: [],
    }),
  );
  const loopableEligibility = computePublishEligibility(
    baseContext({
      sample: { sample_type_slug: "texture", loopable: true, bpm: null },
    }),
  );
  const tooManyMoodEligibility = computePublishEligibility(
    baseContext({
      moodSlugs: ["cold", "dark", "distant", "haunted"],
    }),
  );

  assert.equal(blockerCodes(loopEligibility).join(","), "loop_missing_bpm,melodic_missing_key,missing_mood");
  assert.equal(blockerCodes(loopableEligibility).join(","), "loop_missing_bpm");
  assert.equal(blockerCodes(tooManyMoodEligibility).join(","), "too_many_moods");
});

test("Phase 6 publish eligibility blocks temporary identity and unacknowledged duplicate warnings", async () => {
  const { computePublishEligibility } = await loadAdminSamplesModule();
  const eligibility = computePublishEligibility(
    baseContext({
      sample: { poetic_name: "draft_upload_abc123" },
      duplicateWarning: { is_duplicate: true, acknowledged: false },
    }),
  );

  assert.equal(blockerCodes(eligibility).join(","), "duplicate_not_acknowledged,temporary_poetic_name");
});
