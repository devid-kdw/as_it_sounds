import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function projectFile(filePath) {
  return readFile(path.join(root, filePath), "utf8");
}

async function assertProjectFile(filePath) {
  await assert.doesNotReject(
    () => access(path.join(root, filePath)),
    `${filePath} must exist for the Phase 6 admin curation workflow`,
  );
}

function assertContains(source, pattern, message) {
  assert.match(source, pattern, message);
}

test("Phase 6 admin sample route surface exists and is server-side admin guarded", async () => {
  const routes = [
    { path: "app/api/admin/samples/[sampleId]/route.ts", methods: ["GET", "PATCH"] },
    { path: "app/api/admin/samples/[sampleId]/publish-eligibility/route.ts", methods: ["GET"] },
    { path: "app/api/admin/samples/[sampleId]/publish/route.ts", methods: ["POST"] },
    { path: "app/api/admin/samples/[sampleId]/archive/route.ts", methods: ["POST"] },
    { path: "app/api/admin/samples/[sampleId]/restore/route.ts", methods: ["POST"] },
  ];

  for (const route of routes) {
    await assertProjectFile(route.path);
    const source = await projectFile(route.path);

    for (const method of route.methods) {
      assertContains(source, new RegExp(`export\\s+async\\s+function\\s+${method}\\b`), `${route.path} must export ${method}`);
    }

    assertContains(source, /requireAdminApi\(/, `${route.path} must verify admin server-side`);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|createClient<.*service_role/is, `${route.path} must not expose trusted credentials`);
  }
});

test("publish contract enforces blockers, publishes explicitly, refreshes search, and audits", async () => {
  const publishRoutePath = "app/api/admin/samples/[sampleId]/publish/route.ts";
  const eligibilityRoutePath = "app/api/admin/samples/[sampleId]/publish-eligibility/route.ts";
  await assertProjectFile(publishRoutePath);
  await assertProjectFile(eligibilityRoutePath);

  const source = [
    await projectFile(publishRoutePath),
    await projectFile(eligibilityRoutePath),
  ].join("\n");

  const requiredSignals = [
    [/license_status|licenseStatus|license/i, "verified license must block publishing"],
    [/preview_audio|previewAudio/i, "preview audio asset must block publishing when missing"],
    [/waveform_peaks|waveformPeaks/i, "waveform asset must block publishing when missing"],
    [/sample_moods|moods/i, "mood count must block publishing"],
    [/bpm/i, "loop samples must require BPM"],
    [/is_melodic|musical_key|unknown_key_confirmed|unknownKey/i, "melodic samples must require key or unknown-key confirmation"],
    [/duplicate/i, "duplicate warning acknowledgement must block publishing when required"],
    [/temporary|draft.*identity|identity.*draft/i, "temporary draft identity must require explicit confirmation or replacement"],
    [/status\s*:\s*["']published["']|status[^;]+published/i, "publish action must set status to published"],
    [/published_at|publishedAt/i, "publish action must stamp published_at"],
    [/sample_search_documents|refresh.*search|search.*refresh/i, "publish action must refresh the search document"],
    [/tryWriteAdminAuditLog|admin_audit_log/i, "publish and eligibility decisions must be auditable"],
  ];

  for (const [pattern, message] of requiredSignals) {
    assertContains(source, pattern, message);
  }
});

test("archive and restore contracts keep public visibility safe and append audit rows", async () => {
  const archiveRoutePath = "app/api/admin/samples/[sampleId]/archive/route.ts";
  const restoreRoutePath = "app/api/admin/samples/[sampleId]/restore/route.ts";
  await assertProjectFile(archiveRoutePath);
  await assertProjectFile(restoreRoutePath);

  const archiveSource = await projectFile(archiveRoutePath);
  const restoreSource = await projectFile(restoreRoutePath);

  assertContains(archiveSource, /status\s*:\s*["']archived["']|status[^;]+archived/i, "archive must set status archived");
  assertContains(archiveSource, /archived_at|archivedAt/i, "archive must stamp archived_at");
  assertContains(archiveSource, /tryWriteAdminAuditLog|admin_audit_log/i, "archive must write an admin audit row");

  assertContains(restoreSource, /status\s*:\s*["']needs_review["']|status[^;]+needs_review/i, "restore must return samples to needs_review");
  assert.doesNotMatch(restoreSource, /status\s*:\s*["']published["']/i, "restore must not republish archived samples");
  assertContains(restoreSource, /tryWriteAdminAuditLog|admin_audit_log/i, "restore must write an admin audit row");
});

test("admin review preview uses generated preview and waveform assets, never original WAV playback", async () => {
  const source = [
    await projectFile("app/admin/samples/[sampleId]/edit/page.tsx"),
    await projectFile("app/admin/samples/[sampleId]/edit/admin-sample-review-workspace.tsx"),
    await projectFile("lib/admin-samples.ts"),
  ].join("\n");

  assertContains(source, /preview_audio/, "admin review page must load generated preview audio");
  assertContains(source, /waveform_peaks/, "admin review page must load generated waveform peaks");
  assertContains(source, /kind\s*!==\s*["']original_wav["']|original_wav[\s\S]+public_?url:\s*null/i, "original WAV must not receive a playable public URL");
  const audioTags = source.match(/<audio\b[^>]*>/g) ?? [];

  assert.ok(audioTags.length > 0, "admin review page must render a preview audio element");
  for (const audioTag of audioTags) {
    assert.doesNotMatch(audioTag, /original_wav/i, "admin review audio element must not use original WAV");
  }
});
