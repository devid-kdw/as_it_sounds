import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function projectFile(filePath) {
  return readFile(path.join(root, filePath), "utf8");
}

async function assertProjectFile(filePath, reason) {
  await assert.doesNotReject(
    () => access(path.join(root, filePath)),
    `${filePath} must exist${reason ? ` for ${reason}` : ""}`,
  );
}

function assertContains(source, pattern, message) {
  assert.match(source, pattern, message);
}

async function collectFiles(dirPath, extensions, files = []) {
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

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

async function collectFilesIfPresent(relativePath, extensions) {
  try {
    return collectFiles(path.join(root, relativePath), extensions);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function combinedSource(relativePath, extensions = [".ts", ".tsx"]) {
  const files = await collectFilesIfPresent(relativePath, extensions);
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
  return sources.join("\n");
}

async function assertAdminRoute(filePath, methods) {
  await assertProjectFile(filePath, "the Phase 7 admin API surface");
  const source = await projectFile(filePath);

  for (const method of methods) {
    assertContains(source, new RegExp(`export\\s+async\\s+function\\s+${method}\\b`), `${filePath} must export ${method}`);
  }

  assertContains(source, /requireAdminApi\(/, `${filePath} must verify admin server-side`);
  assertContains(source, /NextResponse\.json|Response\.json/, `${filePath} must return typed JSON responses`);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role|signedUrl|signed_url/i, `${filePath} must not expose secrets or signed URLs`);
}

test("Phase 7 bulk upload session contract creates independent rows with shared batch metadata", async () => {
  const routeSource = await projectFile("app/api/admin/upload-sessions/route.ts");
  const serviceSource = await projectFile("lib/upload-sessions.ts");
  const apiTypeSource = await projectFile("types/api.ts");
  const source = [routeSource, serviceSource, apiTypeSource].join("\n");

  assertContains(source, /z\.enum\(\s*\[\s*["']single["']\s*,\s*["']bulk["']\s*\]\s*\)|mode\s*:\s*["']bulk["']|mode\s*===\s*["']bulk["']/i, "upload session input must support mode='bulk'");
  assert.doesNotMatch(routeSource, /Only single upload sessions are supported/i, "POST /api/admin/upload-sessions must not reject bulk mode");
  assertContains(source, /\bfiles\b[\s\S]{0,120}(?:z\.array|Array<|\[\]|map\(|forEach\()/i, "bulk upload must accept an array of files");
  assertContains(source, /initial_?category_?slug|initialCategorySlug/i, "bulk upload must use the Doc 07 initial category field");
  assertContains(source, /initial_?sample_?type_?slug|initialSampleTypeSlug/i, "bulk upload must use the Doc 07 initial sample type field");
  assertContains(source, /batch_id|batchId/i, "bulk upload must return and persist a shared batch ID");
  assertContains(source, /client_file_id|clientFileId/i, "bulk upload must preserve per-file client row identity");
  assertContains(source, /bulk_position|bulkPosition/i, "bulk upload must persist deterministic per-file ordering");
  assertContains(source, /files\.(?:map|forEach)|for\s*\([^)]*\bfiles\b|for\s+(?:const|let)\s+[^;]+\s+of\s+\w*files/i, "bulk upload must create rows by iterating the submitted files");
  assertContains(source, /from\(["']samples["']\)[\s\S]{0,240}\.insert|\.insert\([\s\S]{0,240}satisfies\s+PublicTableInsert<["']samples["']>/i, "bulk upload must create one sample row per file");
  assertContains(source, /from\(["']processing_jobs["']\)[\s\S]{0,240}\.insert|\.insert\([\s\S]{0,240}satisfies\s+PublicTableInsert<["']processing_jobs["']>/i, "bulk upload must create one processing job per file");
  assertContains(source, /metadata[\s\S]{0,260}(?:batch_id|batchId)[\s\S]{0,260}(?:client_file_id|clientFileId)[\s\S]{0,260}(?:bulk_position|bulkPosition)/i, "processing job metadata must include batch_id, client_file_id, and bulk_position");
  assertContains(source, /bulkIntakeUploadRef|bulkIntakeUploadObjectPath|intake\/batches\/\$\{?batch/i, "bulk sessions must use the bulk intake path convention");
});

test("Phase 7 bulk workspace exposes shared metadata, per-file overrides, partial publish, and failed rows", async () => {
  const source = await combinedSource("app/admin/bulk-upload");

  assertContains(source, /type=["']file["'][\s\S]{0,120}multiple|dropzone|DataTransfer|FileList/i, "bulk workspace must provide a multi-file WAV dropzone or picker");
  assertContains(source, /category|initialCategory|category_slug/i, "bulk workspace must expose shared initial category");
  assertContains(source, /sample type|sampleType|sample_type/i, "bulk workspace must expose shared initial sample type");
  assertContains(source, /shared metadata|sharedMetadata|bulk apply|apply.*selected/i, "bulk workspace must expose a shared metadata panel");
  assertContains(source, /fill empty|replace selected|append tags|clear selected/i, "shared metadata must expose explicit apply modes");
  assertContains(source, /album/i, "bulk workspace must support optional album assignment");
  assertContains(source, /source type|rights owner|commercial use|attribution|required|license/i, "bulk shared metadata must include source/license fields");
  assertContains(source, /poetic[_ ]?name|display[_ ]?title|short[_ ]?description|bpm|musical[_ ]?key|loopable/i, "bulk table must expose per-file override columns");
  assertContains(source, /upload progress|progress|bytes|processing status|validation|duplicate/i, "bulk rows must show upload, processing, validation, and duplicate states");
  assertContains(source, /partial publish|publish selected|selected.*publish|skip.*ineligible|blockers/i, "bulk workspace must support partial publish without forcing a whole batch");
  assertContains(source, /failed/i, "failed rows must remain visible and actionable");
  assertContains(source, /retry|reprocess preview|reprocess waveform|archive|open.*edit|save row|acknowledge duplicate/i, "bulk rows must expose required row actions");
});

test("Phase 7 admin sample management has filters, row actions, and a guarded list API", async () => {
  await assertAdminRoute("app/api/admin/samples/route.ts", ["GET"]);
  const apiSource = await projectFile("app/api/admin/samples/route.ts");
  const pageSource = await combinedSource("app/admin/samples");
  const source = [apiSource, pageSource].join("\n");

  for (const [pattern, label] of [
    [/lifecycle|status/i, "lifecycle status"],
    [/processing[_ ]?status|processing_jobs/i, "processing job status"],
    [/category/i, "category"],
    [/sample[_ ]?type|sampleType/i, "sample type"],
    [/\bmood\b|mood_slug|moods/i, "mood"],
    [/license[_ ]?status|licenseStatus/i, "license status"],
    [/featured/i, "featured flag"],
    [/duplicate/i, "duplicate warning"],
    [/missing[_ ]?asset|asset[_ ]?status|preview_audio|waveform_peaks/i, "missing asset"],
    [/album/i, "album"],
    [/search|query|\bq\b|poetic_name|display_title|original_filename/i, "admin search query"],
  ]) {
    assertContains(source, pattern, `admin sample management must filter by ${label}`);
  }

  for (const [pattern, label] of [
    [/open.*edit|edit workspace|adminSampleEditRoute/i, "open edit"],
    [/preview/i, "preview"],
    [/publish/i, "publish"],
    [/archive/i, "archive"],
    [/restore/i, "restore"],
    [/retry/i, "retry failed processing"],
    [/reprocess preview|reprocess-preview|reprocess_preview/i, "reprocess preview"],
    [/reprocess waveform|reprocess-waveform|reprocess_waveform/i, "reprocess waveform"],
    [/toggle featured|featured/i, "toggle featured"],
  ]) {
    assertContains(source, pattern, `admin sample rows must expose ${label}`);
  }
});

test("Phase 7 retry and processing monitor surface failed, timed-out, and batch-scoped recovery", async () => {
  const retryRoute = await projectFile("app/api/admin/processing-jobs/[jobId]/retry/route.ts");
  const processingSource = await projectFile("lib/processing-jobs.ts");
  const processingPage = await combinedSource("app/admin/processing");

  assertContains(retryRoute, /export\s+async\s+function\s+POST\b/, "retry route must accept POST");
  assertContains(retryRoute, /requireAdminApi\(/, "retry route must verify admin server-side");
  assertContains(retryRoute, /queueProcessingJobRetry/, "retry route must delegate retry eligibility and queuing");
  assertContains(processingSource, /failed[\s\S]{0,80}timed_out|timed_out[\s\S]{0,80}failed/i, "retry eligibility must include failed and timed-out jobs");
  assertContains(processingSource, /attempts[\s\S]{0,120}max_attempts|max_attempts[\s\S]{0,120}attempts/i, "retry eligibility must enforce attempt limits");
  assertContains(processingPage, /failed/i, "processing monitor must show failed jobs");
  assertContains(processingPage, /timed out|timed_out/i, "processing monitor must show timed-out jobs");
  assertContains(processingPage, /ProcessingRetryButton|retry/i, "processing monitor must expose retry actions");
  assertContains(processingPage, /batch_id|batchId|grouped by batch|filter.*batch/i, "processing monitor must support batch-scoped recovery");
});

test("Phase 7 reprocess preview and waveform routes queue jobs without replacing valid assets early", async () => {
  const routes = [
    {
      path: "app/api/admin/samples/[sampleId]/reprocess-preview/route.ts",
      jobType: "reprocess_preview",
      assetKind: "preview_audio",
      action: "sample.reprocess_preview_requested",
    },
    {
      path: "app/api/admin/samples/[sampleId]/reprocess-waveform/route.ts",
      jobType: "reprocess_waveform",
      assetKind: "waveform_peaks",
      action: "sample.reprocess_waveform_requested",
    },
  ];

  for (const route of routes) {
    await assertAdminRoute(route.path, ["POST"]);
    const source = await projectFile(route.path);

    assertContains(source, /original_wav/i, `${route.path} must require the original WAV asset before queuing reprocess`);
    assertContains(source, new RegExp(route.jobType, "i"), `${route.path} must create a ${route.jobType} processing job`);
    assertContains(source, /processing_jobs/i, `${route.path} must insert or queue a processing job`);
    assertContains(source, new RegExp(route.action.replace(".", "\\.")), `${route.path} must audit the requested action`);
    assert.doesNotMatch(source, /from\(["']sample_assets["']\)[\s\S]{0,180}\.(?:update|upsert)|\.from\(["']samples["']\)[\s\S]{0,180}\.update\([\s\S]{0,80}status\s*:\s*["']published/i, `${route.path} must not replace current assets or republish in the request handler`);
  }

  const processingSource = await projectFile("lib/processing-jobs.ts");
  assertContains(processingSource, /job\.job_type\s*===\s*["']reprocess_preview["']|case\s+["']reprocess_preview["']/i, "processing success handling must branch for preview reprocess jobs");
  assertContains(processingSource, /job\.job_type\s*===\s*["']reprocess_waveform["']|case\s+["']reprocess_waveform["']/i, "processing success handling must branch for waveform reprocess jobs");
  assertContains(processingSource, /sample_assets[\s\S]{0,300}preview_audio/i, "successful preview reprocess must update the preview asset only after validation");
  assertContains(processingSource, /sample_assets[\s\S]{0,300}waveform_peaks/i, "successful waveform reprocess must update the waveform asset only after validation");
});

test("Phase 7 album management supports draft, edit, assignment, reorder, publish, and archive", async () => {
  await assertAdminRoute("app/api/admin/albums/route.ts", ["GET", "POST"]);
  await assertAdminRoute("app/api/admin/albums/[albumId]/route.ts", ["GET", "PATCH"]);
  await assertAdminRoute("app/api/admin/albums/[albumId]/samples/route.ts", ["POST", "PATCH", "DELETE"]);
  await assertAdminRoute("app/api/admin/albums/[albumId]/publish/route.ts", ["POST"]);
  await assertAdminRoute("app/api/admin/albums/[albumId]/archive/route.ts", ["POST"]);

  const apiSource = await combinedSource("app/api/admin/albums");
  const pageSource = await combinedSource("app/admin/albums");
  const source = [apiSource, pageSource].join("\n");

  assertContains(source, /from\(["']albums["']\)|\balbums\b/i, "album routes must operate on albums");
  assertContains(source, /status\s*:\s*["']draft["']|draft/i, "album creation must produce draft albums");
  assertContains(source, /title/i, "album editor must support title");
  assertContains(source, /slug/i, "album editor must support unique slug");
  assertContains(source, /description/i, "album editor must support description");
  assertContains(source, /album_samples/i, "album routes must assign samples through album_samples");
  assertContains(source, /sort_order|reorder/i, "album sample membership must support ordering");
  assertContains(source, /status\s*:\s*["']published["']|published_at|publish/i, "album routes must publish albums");
  assertContains(source, /status\s*:\s*["']archived["']|archived_at|archive/i, "album routes must archive albums");
  assertContains(source, /tryWriteAdminAuditLog|admin_audit_log|album\.create|album\.update|album\.publish|album\.archive/i, "album actions must be audit logged");
});

test("Phase 7 admin API routes are independently guarded against normal users", async () => {
  const routeFiles = await collectFiles(path.join(root, "app/api/admin"), ["route.ts"]);
  assert.ok(routeFiles.length > 0, "admin API routes must exist");

  for (const routeFile of routeFiles) {
    const relativePath = path.relative(root, routeFile);
    const source = await readFile(routeFile, "utf8");

    assertContains(source, /requireAdminApi\(/, `${relativePath} must independently verify admin access`);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role|PRIVATE_KEY|WORKER_SECRET|STRIPE_SECRET/i, `${relativePath} must not expose privileged secrets`);
    assert.doesNotMatch(source, /original_wav[\s\S]{0,120}(?:signed|public|url)|signedUrl|signed_url/i, `${relativePath} must not return original WAV paths or signed URLs`);
  }
});
