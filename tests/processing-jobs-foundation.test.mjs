import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = process.cwd();

const expectedStatuses = ["queued", "running", "succeeded", "failed", "canceled", "timed_out"];

const expectedTransitions = {
  queued: ["running", "canceled"],
  running: ["succeeded", "failed", "timed_out"],
  succeeded: [],
  failed: ["queued"],
  canceled: ["queued"],
  timed_out: ["queued"],
};

const transitionExportNames = [
  "getAllowedProcessingJobTransitions",
  "allowedProcessingJobTransitions",
  "getProcessingJobTransitions",
];

const retryExportNames = [
  "determineProcessingJobRetryEligibility",
  "canRetryProcessingJob",
  "isProcessingJobRetryEligible",
  "processingJobCanRetry",
];

const helperCandidates = [
  "lib/processing-jobs.mjs",
  "lib/processing-jobs.js",
  "workers/audio/processing-jobs.mjs",
  "workers/audio/processing-jobs.js",
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

function enumValues(sql, enumName) {
  const match = sql.match(new RegExp(`create type public\\.${enumName} as enum \\(([\\s\\S]+?)\\);`));
  assert.ok(match, `${enumName} enum must exist`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1]);
}

function sourceExports(sourceText, exportName) {
  return new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let)\\s+${exportName}\\b`).test(sourceText)
    || new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`).test(sourceText);
}

async function findExportingModule(exportNames) {
  for (const candidate of helperCandidates) {
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

function normalizeTransitionResult(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (result instanceof Set) {
    return [...result];
  }

  if (Array.isArray(result?.allowed)) {
    return result.allowed;
  }

  if (Array.isArray(result?.nextStatuses)) {
    return result.nextStatuses;
  }

  return [];
}

function retryJob(overrides = {}) {
  return {
    status: "failed",
    attempts: 1,
    max_attempts: 3,
    maxAttempts: 3,
    last_error_code: "STORAGE_WRITE_FAILED",
    lastErrorCode: "STORAGE_WRITE_FAILED",
    ...overrides,
  };
}

test("processing_jobs schema exposes the documented state machine columns", async () => {
  const types = await source("supabase/migrations/0001_extensions_and_types.sql");
  const table = await source("supabase/migrations/0006_events_analytics_search_processing_audit_tables.sql");
  const policies = await source("supabase/migrations/0008_rls_helpers_and_policies.sql");

  assert.deepEqual(enumValues(types, "processing_job_status"), expectedStatuses);
  assert.match(table, /status\s+public\.processing_job_status not null default 'queued'/);
  assert.match(table, /attempts\s+integer not null default 0/);
  assert.match(table, /max_attempts\s+integer not null default 3/);
  assert.match(table, /last_error_code\s+text/);
  assert.match(table, /last_error_message\s+text/);
  assert.match(table, /constraint processing_jobs_attempts_nonnegative/);
  assert.match(table, /constraint processing_jobs_finished_consistency/);
  assert.match(policies, /admin can manage processing jobs/);
});

test("processing job retry route is admin-only and does not leak trusted credentials", async () => {
  const route = await source("app/api/admin/processing-jobs/[jobId]/retry/route.ts");

  assert.match(route, /requireAdmin/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /service[_ -]?role/i);
});

test("processing job transition helper matches Doc 03 when implemented", async (t) => {
  const sourceText = await source("lib/processing-jobs.ts").catch(() => "");

  if (sourceText.includes("markProcessingJobRunning")) {
    assert.match(sourceText, /markProcessingJobRunning/);
    assert.match(sourceText, /job\.status !== "queued"/);
    assert.match(sourceText, /status:\s*"running"/);
    assert.match(sourceText, /attempts:\s*job\.attempts \+ 1/);
    assert.match(sourceText, /markProcessingJobSucceeded/);
    assert.match(sourceText, /status:\s*"succeeded"/);
    assert.match(sourceText, /status:\s*"needs_review"/);
    assert.match(sourceText, /markProcessingJobFailed/);
    assert.match(sourceText, /markProcessingJobTimedOut/);
    assert.match(sourceText, /markProcessingJobTerminal\(jobId,\s*"timed_out"/);
    assert.match(sourceText, /queueProcessingJobRetry/);
    assert.match(sourceText, /status:\s*"queued"/);
    return;
  }

  const resolvedModule = await findExportingModule(transitionExportNames);

  if (!resolvedModule) {
    t.skip("Processing job transition helper export is not implemented yet.");
    return;
  }

  for (const [status, expectedNext] of Object.entries(expectedTransitions)) {
    const result = await resolvedModule.fn(status);
    assert.deepEqual(
      normalizeTransitionResult(result).sort(),
      expectedNext.sort(),
      `${resolvedModule.exportName}(${status}) should match Doc 03 transitions`,
    );
  }
});

test("processing job retry eligibility helper handles terminal and exhausted jobs when implemented", async (t) => {
  const sourceText = await source("lib/processing-jobs.ts").catch(() => "");

  if (sourceText.includes("determineProcessingJobRetryEligibility")) {
    assert.match(sourceText, /RETRYABLE_TERMINAL_STATUSES[\s\S]+failed[\s\S]+canceled[\s\S]+timed_out/);
    assert.match(sourceText, /attemptsRemaining\s*=\s*Math\.max\(job\.max_attempts - job\.attempts,\s*0\)/);
    assert.match(sourceText, /job\.attempts >= job\.max_attempts/);
    assert.match(sourceText, /getPipelineErrorDefinition\(job\.last_error_code\)/);
    assert.match(sourceText, /mode === "admin" \? definition\.adminRetryable : definition\.retryable/);
    assert.match(sourceText, /eligible:\s*true/);
    assert.match(sourceText, /eligible:\s*false/);
    return;
  }

  const resolvedModule = await findExportingModule(retryExportNames);

  if (!resolvedModule) {
    t.skip("Processing job retry eligibility helper export is not implemented yet.");
    return;
  }

  assert.equal(await resolvedModule.fn(retryJob({ status: "failed", attempts: 1, max_attempts: 3, maxAttempts: 3 })), true);
  assert.equal(await resolvedModule.fn(retryJob({ status: "timed_out", attempts: 2, max_attempts: 3, maxAttempts: 3 })), true);
  assert.equal(await resolvedModule.fn(retryJob({ status: "canceled", attempts: 0, max_attempts: 3, maxAttempts: 3 })), true);
  assert.equal(await resolvedModule.fn(retryJob({ status: "running", attempts: 1, max_attempts: 3, maxAttempts: 3 })), false);
  assert.equal(await resolvedModule.fn(retryJob({ status: "succeeded", attempts: 1, max_attempts: 3, maxAttempts: 3 })), false);
  assert.equal(await resolvedModule.fn(retryJob({ status: "failed", attempts: 3, max_attempts: 3, maxAttempts: 3 })), false);
  assert.equal(
    await resolvedModule.fn(
      retryJob({ status: "failed", last_error_code: "UNSUPPORTED_FORMAT", lastErrorCode: "UNSUPPORTED_FORMAT" }),
    ),
    false,
  );
});
