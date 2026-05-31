import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

const expectedBuckets = {
  originals: "ais-originals",
  previews: "ais-previews",
  waveforms: "ais-waveforms",
  albumArtwork: "ais-album-artwork",
  processingTemp: "ais-processing-temp",
};

async function source(filePath) {
  return readFile(path.join(root, filePath), "utf8");
}

function assertNoServiceRoleLeak(sourceText, label) {
  assert.doesNotMatch(sourceText, /SUPABASE_SERVICE_ROLE_KEY/, `${label} must not expose the service role env name`);
  assert.doesNotMatch(sourceText, /service[_ -]?role/i, `${label} must not include service role data in responses`);
}

test("storage public asset guard rejects original WAV exposure", async () => {
  const storage = await source("lib/storage.ts");

  assert.match(storage, /import\s+"server-only"/, "storage helpers must stay server-only");
  assert.match(storage, /original_wav/, "storage helpers must know original_wav is sensitive");
  assert.match(storage, /assertPublicAssetKind/, "storage helpers should expose a public asset guard");
  assert.match(storage, /throw new Error/, "original_wav exposure must fail visibly");
  assert.match(storage, /must never be exposed/i);
});

test("public database asset policy cannot reveal original WAV object paths", async () => {
  const schema = await source("supabase/migrations/0003_core_content_tables.sql");
  const policies = await source("supabase/migrations/0008_rls_helpers_and_policies.sql");

  assert.match(schema, /kind\s+<> 'original_wav'[\s\S]+access_level in \('private', 'entitlement_required'\)/);
  assert.match(policies, /kind in \('preview_audio', 'waveform_peaks'\)/);
  assert.doesNotMatch(
    policies.match(/create policy "public can read published preview and waveform assets"[\s\S]+?;\n/)?.[0] ?? "",
    /original_wav/,
    "public sample_assets policy must not include original_wav",
  );
});

test("bucket configuration uses documented stable storage bucket names when implemented", async (t) => {
  const storage = await source("lib/storage.ts");
  const storagePaths = await source("lib/storage-paths.ts").catch(() => "");
  const uploadRoute = await source("app/api/admin/upload-sessions/route.ts");
  const combined = `${storage}\n${storagePaths}\n${uploadRoute}`;
  const configuredBuckets = Object.values(expectedBuckets).filter((bucket) => combined.includes(bucket));

  if (configuredBuckets.length === 0) {
    t.skip("Storage bucket constants/helpers are not implemented yet.");
    return;
  }

  assert.deepEqual(new Set(configuredBuckets), new Set(Object.values(expectedBuckets)));
  assert.match(combined, /AIS_PRIVATE_STORAGE_BUCKETS[\s\S]+AIS_STORAGE_BUCKETS\.originals/);
  assert.match(combined, /AIS_PRIVATE_STORAGE_BUCKETS[\s\S]+AIS_STORAGE_BUCKETS\.processingTemp/);
  assert.match(combined, /AIS_PUBLIC_STORAGE_BUCKETS[\s\S]+AIS_STORAGE_BUCKETS\.previews/);
  assert.match(combined, /AIS_PUBLIC_STORAGE_BUCKETS[\s\S]+AIS_STORAGE_BUCKETS\.waveforms/);
  assert.match(combined, /AIS_PUBLIC_STORAGE_BUCKETS[\s\S]+AIS_STORAGE_BUCKETS\.albumArtwork/);
});

test("storage path helpers emit documented object paths when implemented", async (t) => {
  const storage = `${await source("lib/storage.ts")}\n${await source("lib/storage-paths.ts").catch(() => "")}`;
  const hasPathHelpers = /original.*Path|preview.*Path|waveform.*Path|intake.*Path|build.*Storage.*Path/i.test(storage);

  if (!hasPathHelpers) {
    t.skip("Storage path helper implementation is not present yet.");
    return;
  }

  assert.match(storage, /samples\/.+\/original\/.+\.wav|`samples\/\$\{[^}]+}\/original\/\$\{[^}]+}\.wav`/);
  assert.match(storage, /intake\/.+\/.+\/source\.wav|`intake\/\$\{[^}]+}\/\$\{[^}]+}\/source\.wav`/);
  assert.match(storage, /samples\/.+\/preview\/.+\.mp3|`samples\/\$\{[^}]+}\/preview\/\$\{[^}]+}\.mp3`/);
  assert.match(storage, /samples\/.+\/waveform\/.+\.json|`samples\/\$\{[^}]+}\/waveform\/\$\{[^}]+}\.json`/);
});

test("signed upload session responses are scoped and never include service role material", async (t) => {
  const route = await source("app/api/admin/upload-sessions/route.ts");
  const uploadSessions = await source("lib/upload-sessions.ts").catch(() => "");
  const combined = `${route}\n${uploadSessions}`;

  assert.match(route, /requireAdmin/);
  assertNoServiceRoleLeak(combined, "admin upload session route/helpers");

  if (uploadSessions) {
    assert.match(uploadSessions, /UPLOAD_SESSION_BUCKET\s*=\s*"ais-processing-temp"/);
    assert.match(uploadSessions, /UPLOAD_SESSION_URL_TTL_SECONDS\s*=\s*15 \* 60/);
    assert.match(uploadSessions, /intake\/\$\{sampleId\}\/\$\{uploadSessionId\}\/source\.wav/);
    assert.match(uploadSessions, /Only \.wav files are supported|isWavFilename/);
  }

  if (!/signed_upload|createSignedUploadUrl|upload_bucket|upload_path/.test(route)) {
    t.skip("Signed upload session implementation is not present yet.");
    return;
  }

  assert.match(route, /upload_bucket/);
  assert.match(route, /upload_path/);
  assert.match(route, /signed_upload/);
  assert.match(route, /expires_at|expiresIn|expires_in/i);
  assert.doesNotMatch(route, /original_wav[\s\S]{0,120}upload_bucket/);
});
