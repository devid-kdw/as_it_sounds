import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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

async function collectFiles(dir, extensions, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(fullPath, extensions, files);
      continue;
    }

    if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function collectFilesIfPresent(dir, extensions) {
  try {
    return collectFiles(dir, extensions);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
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

async function loadErrorsModule() {
  return loadProjectTsModule("lib/errors.ts");
}

async function loadUploadSessionsModule() {
  const z = requireFromTest("zod");
  const errors = await loadErrorsModule();

  return loadProjectTsModule("lib/upload-sessions.ts", {
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
  });
}

async function loadProcessingJobsModule() {
  const errors = await loadErrorsModule();

  return loadProjectTsModule("lib/processing-jobs.ts", {
    "@/lib/errors": errors,
    "@/lib/admin-audit": {
      tryWriteAdminAuditLog: async () => true,
    },
    "@/lib/supabase/admin": {
      createSupabaseAdminClient() {
        throw new Error("tests inject a recording Supabase client");
      },
    },
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRecordingSupabase({
  job = null,
  sample = null,
  categories = [{ slug: "textures", is_active: true }],
  sampleTypes = [{ slug: "one_shot", is_active: true }],
} = {}) {
  const calls = [];
  const state = {
    processing_jobs: new Map(job ? [[job.id, clone(job)]] : []),
    samples: new Map(sample ? [[sample.id, clone(sample)]] : []),
    sample_assets: [],
    categories: new Map(categories.map((row) => [row.slug, clone(row)])),
    sample_types: new Map(sampleTypes.map((row) => [row.slug, clone(row)])),
  };

  function rowsFor(table) {
    const rows = state[table];

    if (rows instanceof Map) {
      return [...rows.values()];
    }

    return rows;
  }

  function rowMatches(row, filters) {
    return filters.every(([column, value]) => row[column] === value);
  }

  function findRows(table, filters) {
    return rowsFor(table).filter((row) => rowMatches(row, filters));
  }

  function applyUpdate(table, filters, payload) {
    const rows = findRows(table, filters);

    for (const row of rows) {
      Object.assign(row, clone(payload));
    }

    return rows;
  }

  function applyInsert(table, payload) {
    const rows = Array.isArray(payload) ? payload : [payload];
    calls.push({ method: "insert", table, rows: clone(rows) });

    if (state[table] instanceof Map) {
      for (const row of rows) {
        state[table].set(row.id ?? row.slug, clone(row));
      }
    }

    return rows;
  }

  function from(table) {
    const query = {
      table,
      filters: [],
      updatePayload: null,
      selectColumns: null,
    };

    const builder = {
      select(columns) {
        query.selectColumns = columns;
        return builder;
      },
      eq(column, value) {
        query.filters.push([column, value]);
        return builder;
      },
      update(payload) {
        query.updatePayload = clone(payload);
        return builder;
      },
      async insert(payload) {
        applyInsert(table, payload);
        return { data: null, error: null };
      },
      async upsert(rows, options) {
        calls.push({ method: "upsert", table, rows: clone(rows), options: clone(options) });
        state.sample_assets = clone(rows);
        return { data: clone(rows), error: null };
      },
      async maybeSingle() {
        const { data, error } = execute();
        return { data: Array.isArray(data) ? data[0] ?? null : data, error };
      },
      async single() {
        const { data, error } = execute();
        const row = Array.isArray(data) ? data[0] ?? null : data;

        if (!row) {
          return { data: null, error: error ?? new Error(`No ${table} row matched the test query.`) };
        }

        return { data: row, error };
      },
      then(resolve, reject) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };

    function execute() {
      if (query.updatePayload) {
        const rows = applyUpdate(table, query.filters, query.updatePayload);
        calls.push({
          method: "update",
          table,
          filters: clone(query.filters),
          payload: clone(query.updatePayload),
        });
        return { data: clone(rows), error: null };
      }

      return { data: clone(findRows(table, query.filters)), error: null };
    }

    return builder;
  }

  return { from, calls, state };
}

function createRecordingStorage({ uploadExists = true } = {}) {
  const calls = [];

  return {
    calls,
    async createSignedUploadUrl(ref, expiresInSeconds, options) {
      calls.push({
        method: "createSignedUploadUrl",
        ref: clone(ref),
        expiresInSeconds,
        options: clone(options),
      });

      return {
        bucket: ref.bucket,
        objectPath: ref.objectPath,
        url: `https://storage.test/upload/${encodeURIComponent(ref.objectPath)}`,
        token: "signed-upload-token",
        expiresAt: "2026-05-31T12:15:00.000Z",
      };
    },
    async exists(ref) {
      calls.push({ method: "exists", ref: clone(ref) });
      return uploadExists;
    },
  };
}

function initialUploadJob(overrides = {}) {
  return {
    id: "job-1",
    sample_id: "sample-1",
    job_type: "initial_upload",
    status: "running",
    attempts: 1,
    max_attempts: 3,
    input_bucket: "ais-processing-temp",
    input_path: "intake/sample-1/upload-1/source.wav",
    output_preview_path: null,
    output_waveform_path: null,
    metadata: { existing: "kept" },
    last_error_code: null,
    last_error_message: null,
    started_at: "2026-05-31T10:00:00.000Z",
    finished_at: null,
    ...overrides,
  };
}

function draftSample(overrides = {}) {
  return {
    id: "sample-1",
    status: "processing",
    failed_at: null,
    ...overrides,
  };
}

function successPayload(overrides = {}) {
  return {
    source: {
      sha256: "a".repeat(64),
      file_size_bytes: 123456,
      duration_seconds: 2.5,
      sample_rate: 48000,
      bit_depth: 24,
      channels: 2,
      mime_type: "audio/wav",
    },
    assets: {
      original_wav: {
        bucket: "ais-originals",
        object_path: "samples/sample-1/original/aaaaaaaa.wav",
        file_size_bytes: 123456,
        checksum_sha256: "a".repeat(64),
      },
      preview_audio: {
        bucket: "ais-previews",
        object_path: "samples/sample-1/preview/job-1.mp3",
        file_size_bytes: 23456,
        checksum_sha256: "b".repeat(64),
      },
      waveform_peaks: {
        bucket: "ais-waveforms",
        object_path: "samples/sample-1/waveform/job-1.json",
        file_size_bytes: 3456,
        checksum_sha256: "c".repeat(64),
      },
    },
    tool_versions: { ffmpeg: "test", audiowaveform: "test" },
    ...overrides,
  };
}

function fixedNow() {
  return new Date("2026-05-31T12:00:00.000Z");
}

test("non-admin users cannot create upload sessions", async () => {
  const route = await readProjectFile("app/api/admin/upload-sessions/route.ts");
  const postBody = route.slice(route.indexOf("export async function POST"));
  const adminGuardIndex = postBody.indexOf("requireAdminApi");
  const firstPrivilegedWorkIndex = [
    postBody.indexOf("createSingleUploadSession"),
    postBody.indexOf("createUploadSession"),
    postBody.indexOf("createSupabaseAdminClient"),
    postBody.indexOf(".from(\"samples\")"),
    postBody.indexOf("createSignedUploadUrl"),
    postBody.indexOf("signed_upload"),
  ].filter((index) => index >= 0).sort((a, b) => a - b)[0];

  assert.match(postBody, /await\s+requireAdminApi\(\)/);
  assert.ok(adminGuardIndex >= 0, "upload session route must verify admin access");

  if (firstPrivilegedWorkIndex !== undefined) {
    assert.ok(
      adminGuardIndex < firstPrivilegedWorkIndex,
      "admin verification must happen before draft rows or signed upload URLs are created",
    );
  }
});

test("invalid file metadata is rejected before signed upload URL creation", async () => {
  const route = await readProjectFile("app/api/admin/upload-sessions/route.ts");
  const uploadSessions = await loadUploadSessionsModule();
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
    () => uploadSessions.parseUploadSessionCreateRequest({ ...validRequest, filename: "source.mp3" }),
    /Only \.wav files are supported/,
  );
  assert.throws(
    () => uploadSessions.parseUploadSessionCreateRequest({ ...validRequest, content_type: "audio\/mpeg" }),
    /Only WAV content types are supported/,
  );
  assert.throws(
    () => uploadSessions.parseUploadSessionCreateRequest({ ...validRequest, file_size_bytes: 0 }),
    /Invalid upload session request|Number must be greater than 0|Too small/i,
  );

  const postBody = route.slice(route.indexOf("export async function POST"));
  const validationIndex = postBody.indexOf("parseUploadSessionCreateRequest");
  const signedUrlIndex = postBody.search(/createSingleUploadSession|createSignedUploadUrl|signed_upload|createSignedUpload/i);

  assert.ok(validationIndex >= 0, "upload route must validate request metadata");

  if (signedUrlIndex >= 0) {
    assert.ok(validationIndex < signedUrlIndex, "metadata validation must happen before signed URL creation");
  }
});

test("upload session creation creates one draft sample and one queued initial upload job", async () => {
  const uploadSessions = await loadUploadSessionsModule();
  const supabase = createRecordingSupabase();
  const storage = createRecordingStorage();
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ];

  const result = await uploadSessions.createSingleUploadSession(
    {
      mode: "single",
      filename: "source.wav",
      content_type: "audio/wav",
      file_size_bytes: 12345,
      category_slug: "textures",
      sample_type_slug: "one_shot",
    },
    { userId: "admin-user" },
    {
      supabase,
      storage,
      now: fixedNow,
      idFactory: () => ids.shift(),
    },
  );
  const sampleInserts = supabase.calls.filter((call) => call.table === "samples" && call.method === "insert");
  const jobInserts = supabase.calls.filter((call) => call.table === "processing_jobs" && call.method === "insert");

  assert.equal(sampleInserts.length, 1);
  assert.equal(jobInserts.length, 1);
  assert.equal(sampleInserts[0].rows[0].status, "draft");
  assert.equal(sampleInserts[0].rows[0].uploaded_by, "admin-user");
  assert.equal(jobInserts[0].rows[0].job_type, "initial_upload");
  assert.equal(jobInserts[0].rows[0].status, "queued");
  assert.equal(jobInserts[0].rows[0].input_bucket, "ais-processing-temp");
  assert.equal(storage.calls.length, 1);
  assert.equal(storage.calls[0].method, "createSignedUploadUrl");
  assert.equal(storage.calls[0].options.upsert, false);
  assert.deepEqual(clone(result), {
    sample_id: "00000000-0000-4000-8000-000000000001",
    processing_job_id: "00000000-0000-4000-8000-000000000002",
    upload_bucket: "ais-processing-temp",
    upload_path: "intake/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/source.wav",
    signed_upload: {
      url: "https://storage.test/upload/intake%2F00000000-0000-4000-8000-000000000001%2F00000000-0000-4000-8000-000000000002%2Fsource.wav",
      token: "signed-upload-token",
      expires_at: "2026-05-31T12:15:00.000Z",
    },
  });
});

test("upload finalize is idempotent", async () => {
  const route = await readProjectFile("app/api/admin/upload-sessions/[processingJobId]/finalize/route.ts");
  const uploadSessions = await loadUploadSessionsModule();
  const supabase = createRecordingSupabase({
    job: initialUploadJob({
      id: "00000000-0000-4000-8000-000000000002",
      sample_id: "00000000-0000-4000-8000-000000000001",
      status: "queued",
      metadata: {},
      input_path: "intake/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/source.wav",
    }),
    sample: draftSample({
      id: "00000000-0000-4000-8000-000000000001",
      status: "draft",
    }),
  });
  const storage = createRecordingStorage();
  let nowCallCount = 0;
  const now = () => {
    nowCallCount += 1;
    return new Date(nowCallCount === 1 ? "2026-05-31T12:00:00.000Z" : "2026-05-31T13:00:00.000Z");
  };
  const request = {
    mode: "single",
    sample_id: "00000000-0000-4000-8000-000000000001",
    processing_job_id: "00000000-0000-4000-8000-000000000002",
  };

  assert.match(route, /await\s+requireAdminApi\(\)/);
  assert.match(await readProjectFile("app/admin/upload/page.tsx"), /\/api\/admin\/upload-sessions\/\$\{encodeURIComponent\(session\.processing_job_id\)\}\/finalize/);

  const first = await uploadSessions.finalizeSingleUploadSession(request, { userId: "admin-user" }, { supabase, storage, now });
  const second = await uploadSessions.finalizeSingleUploadSession(request, { userId: "admin-user" }, { supabase, storage, now });
  const finalizedJob = supabase.state.processing_jobs.get("00000000-0000-4000-8000-000000000002");

  assert.deepEqual(clone(first), {
    sample_id: "00000000-0000-4000-8000-000000000001",
    processing_job_id: "00000000-0000-4000-8000-000000000002",
    processing_status: "queued",
    sample_processing_status: "draft",
    finalized: true,
  });
  assert.deepEqual(clone(second), clone(first));
  assert.equal(finalizedJob.metadata.upload_finalized_at, "2026-05-31T12:00:00.000Z");
  assert.equal(finalizedJob.metadata.upload_finalized_by, "admin-user");
  assert.equal(storage.calls.filter((call) => call.method === "exists").length, 2);
});

test("valid WAV processing creates original, preview, and waveform asset rows", async () => {
  const jobs = await loadProcessingJobsModule();
  const supabase = createRecordingSupabase({ job: initialUploadJob(), sample: draftSample() });

  await jobs.markProcessingJobSucceeded("job-1", successPayload(), { supabase, now: fixedNow });

  const assetWrite = supabase.calls.find((call) => call.table === "sample_assets" && call.method === "upsert");
  assert.ok(assetWrite, "processing success must upsert sample asset rows");
  assert.deepEqual(
    assetWrite.rows.map((row) => row.kind),
    ["original_wav", "preview_audio", "waveform_peaks"],
  );
  assert.deepEqual(
    assetWrite.rows.map((row) => row.bucket),
    ["ais-originals", "ais-previews", "ais-waveforms"],
  );
  assert.equal(assetWrite.options.onConflict, "sample_id,kind");
  assert.equal(assetWrite.rows.find((row) => row.kind === "original_wav").access_level, "private");
  assert.equal(assetWrite.rows.find((row) => row.kind === "waveform_peaks").access_level, "public");
});

test("successful processing moves the sample to needs_review", async () => {
  const jobs = await loadProcessingJobsModule();
  const supabase = createRecordingSupabase({ job: initialUploadJob(), sample: draftSample() });

  const updatedJob = await jobs.markProcessingJobSucceeded("job-1", successPayload(), { supabase, now: fixedNow });
  const sampleUpdates = supabase.calls.filter((call) => call.table === "samples" && call.method === "update");

  assert.equal(updatedJob.status, "succeeded");
  assert.equal(updatedJob.output_preview_path, "samples/sample-1/preview/job-1.mp3");
  assert.equal(updatedJob.output_waveform_path, "samples/sample-1/waveform/job-1.json");
  assert.equal(sampleUpdates.at(-1).payload.status, "needs_review");
  assert.equal(supabase.state.samples.get("sample-1").status, "needs_review");
});

test("failed initial upload processing marks the sample failed", async () => {
  const jobs = await loadProcessingJobsModule();
  const supabase = createRecordingSupabase({ job: initialUploadJob(), sample: draftSample() });

  const failedJob = await jobs.markProcessingJobFailed(
    "job-1",
    { code: "DECODE_FAILED", message: "Unable to decode WAV data." },
    { supabase, now: fixedNow },
  );
  const failedSample = supabase.state.samples.get("sample-1");

  assert.equal(failedJob.status, "failed");
  assert.equal(failedJob.last_error_code, "DECODE_FAILED");
  assert.equal(failedSample.status, "failed");
  assert.equal(failedSample.failed_at, "2026-05-31T12:00:00.000Z");
});

test("duplicate hash creates warning metadata without blocking processing", async () => {
  const jobs = await loadProcessingJobsModule();
  const supabase = createRecordingSupabase({ job: initialUploadJob(), sample: draftSample() });

  const updatedJob = await jobs.markProcessingJobSucceeded(
    "job-1",
    successPayload({
      warnings: [{ code: "duplicate_hash", message: "A matching file already exists." }],
      duplicate_check: {
        is_duplicate: true,
        matching_sample_ids: ["existing-sample"],
      },
    }),
    { supabase, now: fixedNow },
  );

  assert.equal(updatedJob.status, "succeeded");
  assert.equal(supabase.state.samples.get("sample-1").status, "needs_review");
  assert.deepEqual(updatedJob.metadata.duplicate_check, {
    is_duplicate: true,
    matching_sample_ids: ["existing-sample"],
  });
  assert.deepEqual(updatedJob.metadata.warnings, [
    { code: "duplicate_hash", message: "A matching file already exists." },
  ]);
});

test("browser-adjacent upload code never receives service role keys or original storage paths", async () => {
  const browserFiles = [
    ...(await collectFilesIfPresent(path.join(root, "app"), [".tsx"])),
    ...(await collectFilesIfPresent(path.join(root, "components"), [".tsx"])),
    ...(await collectFilesIfPresent(path.join(root, "stores"), [".ts"])),
    path.join(root, "lib/supabase/browser.ts"),
  ].filter((file) => !file.includes(`${path.sep}app${path.sep}api${path.sep}`));

  for (const file of browserFiles) {
    const relativePath = path.relative(root, file);
    const source = await readFile(file, "utf8");
    const isClientSurface =
      source.includes('"use client"') ||
      source.includes("'use client'") ||
      relativePath.includes(`${path.sep}stores${path.sep}`) ||
      relativePath === path.join("lib", "supabase", "browser.ts");

    if (!isClientSurface) {
      continue;
    }

    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role_key/i, `${relativePath} exposes service role material`);
    assert.doesNotMatch(source, /ais-originals|original_wav|\/original\/|input_path/i, `${relativePath} exposes original storage paths`);
  }

  const uploadRoute = await readProjectFile("app/api/admin/upload-sessions/route.ts");

  assert.doesNotMatch(uploadRoute, /SUPABASE_SERVICE_ROLE_KEY|service_role_key/i);
  assert.doesNotMatch(uploadRoute, /ais-originals|original_wav|\/original\//i);
});

test("admin UI surfaces failed jobs without requiring worker logs", async () => {
  const adminLayout = await readProjectFile("app/admin/layout.tsx");
  const processingPage = await readProjectFile("app/admin/processing/page.tsx");
  const combined = `${adminLayout}\n${processingPage}`;

  assert.match(combined, /processing_jobs/);
  assert.match(combined, /\.eq\("status",\s*"failed"\)|\.in\("status",\s*\[[^\]]*"failed"/);
  assert.match(combined, /failed job|failed processing|processing failed/i);
  assert.doesNotMatch(processingPage, /worker logs|server logs|read logs|logs required|check logs/i);
});
