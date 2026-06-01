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

test("pipeline error catalog maps retryability to short safe messages", async () => {
  const errors = await loadProjectTsModule("lib/errors.ts");

  assert.equal(errors.toSafePipelineError({ code: "STORAGE_WRITE_FAILED" }).retryable, true);
  assert.equal(errors.toSafePipelineError({ code: "UNSUPPORTED_FORMAT" }).retryable, false);
  assert.equal(errors.toSafePipelineError({ code: "NOT_IN_CATALOG" }).code, "UNKNOWN_PROCESSING_ERROR");
  assert.doesNotMatch(
    errors.toSafePipelineError(new Error("stack should not leak")).message,
    /stack|at\s+\w+|Error:/i,
  );
});

test("processing job retry eligibility follows PIPE-10 and PIPE-21 terminal rules", async () => {
  const errors = await loadProjectTsModule("lib/errors.ts");
  const jobs = await loadProjectTsModule("lib/processing-jobs.ts", {
    "@/lib/errors": errors,
    "@/lib/admin-audit": {
      tryWriteAdminAuditLog: async () => true,
    },
    "@/lib/supabase/admin": {
      createSupabaseAdminClient() {
        throw new Error("database client should not be needed for pure eligibility tests");
      },
    },
    "@/lib/storage": {
      createStorageProvider() {
        return {
          exists: async () => true,
        };
      },
    },
  });
  const baseJob = {
    id: "job-id",
    sample_id: "sample-id",
    job_type: "initial_upload",
    status: "failed",
    attempts: 1,
    max_attempts: 3,
    last_error_code: "STORAGE_READ_FAILED",
  };

  assert.equal(jobs.determineProcessingJobRetryEligibility(baseJob).eligible, true);
  assert.equal(
    jobs.determineProcessingJobRetryEligibility({
      ...baseJob,
      last_error_code: "UNSUPPORTED_FORMAT",
    }).eligible,
    false,
  );
  assert.equal(
    jobs.determineProcessingJobRetryEligibility({
      ...baseJob,
      attempts: 3,
    }).eligible,
    false,
  );
  assert.equal(
    jobs.determineProcessingJobRetryEligibility({
      ...baseJob,
      status: "running",
    }).eligible,
    false,
  );
  assert.equal(
    jobs.determineProcessingJobRetryEligibility({
      ...baseJob,
      status: "canceled",
      last_error_code: null,
    }).eligible,
    false,
  );
  assert.equal(
    jobs.determineProcessingJobRetryEligibility(
      {
        ...baseJob,
        status: "canceled",
        last_error_code: null,
      },
      "admin",
    ).eligible,
    true,
  );
});

test("upload session contract rejects non-WAV and invalid draft sample inputs", async () => {
  const z = requireFromTest("zod");
  const errors = await loadProjectTsModule("lib/errors.ts");
  const uploadSessions = await loadProjectTsModule("lib/upload-sessions.ts", {
    "@/lib/errors": errors,
    "@/lib/admin-audit": {
      tryWriteAdminAuditLog: async () => true,
    },
    "@/lib/validators": {
      poeticNameSchema: z
        .string()
        .min(1)
        .max(120)
        .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
    },
    "@/lib/storage-paths": {
      bulkIntakeUploadRef: ({ batchId, sampleId }) => ({
        bucket: "ais-processing-temp",
        objectPath: `intake/batches/${batchId}/${sampleId}/source.wav`,
      }),
    },
  });
  const validRequest = {
    mode: "single",
    filename: "source.wav",
    content_type: "audio/wav",
    file_size_bytes: 12345,
    category_slug: "textures",
    sample_type_slug: "one_shot",
  };

  assert.deepEqual(uploadSessions.parseUploadSessionCreateRequest(validRequest), validRequest);
  assert.throws(
    () =>
      uploadSessions.parseUploadSessionCreateRequest({
        ...validRequest,
        filename: "source.mp3",
      }),
    /Only \.wav files are supported/,
  );
  assert.throws(
    () =>
      uploadSessions.parseUploadSessionCreateRequest({
        ...validRequest,
        content_type: "audio/mpeg",
      }),
    /Only WAV content types are supported/,
  );
  assert.throws(
    () =>
      uploadSessions.parseUploadSessionCreateRequest({
        ...validRequest,
        sample_type_slug: "loop",
      }),
    /Loop uploads require BPM/,
  );
});

test("admin upload and retry routes keep the server-side admin guard", async () => {
  const uploadRoute = await readProjectFile("app/api/admin/upload-sessions/route.ts");
  const retryRoute = await readProjectFile("app/api/admin/processing-jobs/[jobId]/retry/route.ts");

  assert.match(uploadRoute, /requireAdminApi\(\)/);
  assert.match(uploadRoute, /parseUploadSessionCreateRequest/);
  assert.ok(
    uploadRoute.indexOf("requireAdminApi") < uploadRoute.indexOf("parseUploadSessionCreateRequest"),
    "upload route must check admin before validating upload payloads",
  );
  assert.match(retryRoute, /requireAdminApi\(\)/);
  assert.match(retryRoute, /queueProcessingJobRetry/);
});
