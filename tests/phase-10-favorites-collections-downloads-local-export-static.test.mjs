import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
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

async function collectFiles(dirPath, extensions, files = []) {
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
      continue;
    }

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
  const fullPath = path.join(root, relativePath);

  try {
    const fileStat = await stat(fullPath);

    if (fileStat.isFile()) {
      return extensions.some((extension) => fullPath.endsWith(extension)) ? [fullPath] : [];
    }

    if (fileStat.isDirectory()) {
      return collectFiles(fullPath, extensions);
    }

    return [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function combinedSource(relativePaths, extensions = [".ts", ".tsx", ".sql"]) {
  const files = (
    await Promise.all(relativePaths.map((relativePath) => collectFilesIfPresent(relativePath, extensions)))
  ).flat();
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
  return sources.join("\n");
}

function assertContains(source, pattern, message) {
  assert.match(source, pattern, message);
}

function assertNotContains(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

function extractSourceRange(source, startPattern, endPattern) {
  const startMatch = source.match(startPattern);

  if (!startMatch || startMatch.index === undefined) {
    return "";
  }

  const afterStart = source.slice(startMatch.index);
  const endMatch = afterStart.slice(startMatch[0].length).match(endPattern);

  if (!endMatch || endMatch.index === undefined) {
    return afterStart;
  }

  return afterStart.slice(0, startMatch[0].length + endMatch.index);
}

async function userLibrarySource() {
  return combinedSource([
    "app/api/favorites",
    "app/api/collections",
    "lib/data/favorites.ts",
    "lib/data/collections.ts",
    "stores/collection-ui-store.ts",
    "types/api.ts",
    "types/sample.ts",
    "supabase/migrations",
  ]);
}

async function downloadSource() {
  return combinedSource([
    "app/api/download",
    "lib/data/downloads.ts",
    "lib/entitlement.ts",
    "lib/storage.ts",
    "types/api.ts",
    "supabase/migrations",
  ]);
}

async function localExportSource() {
  return combinedSource([
    "app/api/local",
    "app/api/export",
    "app/api/download",
    "lib/local-export.ts",
    "lib/local-paths.ts",
    "lib/data/local-events.ts",
    "types/api.ts",
    "supabase/migrations",
  ]);
}

test("Phase 10 authenticated users can favorite and unfavorite published samples", async () => {
  await assertProjectFile("lib/data/favorites.ts", "RLS-safe favorite mutations");
  const source = await userLibrarySource();

  assertContains(source, /export\s+(?:async\s+)?function\s+(?:toggleFavorite|favoriteSample|favoritePublishedSample|addFavorite|setPublishedSampleFavorite)\b|export\s+const\s+(?:toggleFavorite|favoriteSample|favoritePublishedSample|addFavorite|setPublishedSampleFavorite)\b/i, "favorites data layer must expose a favorite/toggle mutation");
  assertContains(source, /export\s+(?:async\s+)?function\s+(?:unfavoriteSample|removeFavorite|deleteFavorite)\b|delete\(\)[\s\S]{0,240}\.from\(\s*["']favorites["']\s*\)/i, "favorites data layer must expose an unfavorite/delete mutation");
  assertContains(source, /\.from\(\s*["']favorites["']\s*\)[\s\S]{0,260}(?:insert|upsert)\(/i, "favorite mutation must write to favorites");
  assertContains(source, /\.from\(\s*["']samples["']\s*\)[\s\S]{0,260}\.eq\(\s*["']status["']\s*,\s*["']published["']\s*\)|create policy ["'][^"']*favorites[^"']*published samples/i, "favorites must be limited to published samples");
  assertContains(source, /auth\.uid\(\)|requireCurrentUser|getCurrentUser|user_id\s*=\s*auth\.uid\(\)/i, "favorite mutations must bind the row to the authenticated user");
  assertNotContains(source, /user_id\s*:\s*(?:body|request|payload|input)\.userId|userId\s*:\s*(?:body|request|payload|input)\.userId/i, "favorite mutations must not trust a client-supplied user id");
});

test("Phase 10 favorites cannot be created for unpublished samples", async () => {
  const source = await userLibrarySource();
  const favoritePolicy = extractSourceRange(source, /create policy ["'][^"']*favorites[^"']*insert/i, /create policy|alter table|$/i);

  assertContains(source, /favorites/i, "favorite contract must be present");
  assertContains([source, favoritePolicy].join("\n"), /status\s*=\s*["']published["']|\.eq\(\s*["']status["']\s*,\s*["']published["']\s*\)/i, "favorite creation must require samples.status = published");

  for (const status of ["draft", "processing", "needs_review", "failed", "archived"]) {
    assertNotContains(
      favoritePolicy,
      new RegExp(`status\\s*=\\s*["']${status}["']|status\\s+in\\s*\\([^)]*["']${status}["']`, "i"),
      `favorite insert policy must not allow ${status} samples`,
    );
  }
});

test("Phase 10 users can create private collections and add, reorder, and remove samples", async () => {
  await assertProjectFile("lib/data/collections.ts", "private collection data access");
  await assertProjectFile("app/api/collections/route.ts", "collection list/create API");
  await assertProjectFile("app/api/collections/[collectionId]/route.ts", "collection detail/edit API");
  const source = await userLibrarySource();

  assertContains(source, /export\s+(?:async\s+)?function\s+(?:createCollection|createPrivateCollection)\b|\.from\(\s*["']collections["']\s*\)[\s\S]{0,220}insert\(/i, "collection layer must create collections");
  assertContains(source, /visibility\s*:\s*["']private["']|visibility[^;\n]*default ["']private["']|collection_visibility[^;\n]*["']private["']/i, "new collections must be private");
  assertContains(source, /export\s+(?:async\s+)?function\s+(?:addSampleToCollection|addCollectionItem)\b|\.from\(\s*["']collection_items["']\s*\)[\s\S]{0,220}(?:insert|upsert)\(/i, "collection layer must add samples");
  assertContains(source, /sort_order|sortOrder|reorderCollectionItems|PATCH[\s\S]{0,360}collection_items/i, "collection layer must support user-controlled reorder");
  assertContains(source, /export\s+(?:async\s+)?function\s+(?:removeSampleFromCollection|removeCollectionItem)\b|\.from\(\s*["']collection_items["']\s*\)[\s\S]{0,260}delete\(/i, "collection layer must remove samples");
  assertContains(source, /\.from\(\s*["']samples["']\s*\)[\s\S]{0,260}\.eq\(\s*["']status["']\s*,\s*["']published["']\s*\)|collection_items[\s\S]{0,500}status\s*=\s*["']published["']/i, "collection items must be limited to published samples");
});

test("Phase 10 users cannot read another user's collections", async () => {
  const source = await userLibrarySource();
  const collectionPolicy = extractSourceRange(source, /create policy ["'][^"']*collections/i, /create policy ["'][^"']*(?:collection_items|downloads|recently)|alter table|$/i);
  const collectionItemPolicy = extractSourceRange(source, /create policy ["'][^"']*collection items/i, /create policy ["'][^"']*(?:downloads|recently)|alter table|$/i);

  assertContains(source, /collections/i, "collection contract must be present");
  assertContains([source, collectionPolicy].join("\n"), /user_id\s*=\s*auth\.uid\(\)|\.eq\(\s*["']user_id["']\s*,\s*user\.id\s*\)|\.eq\(\s*["']user_id["']\s*,\s*userId\s*\)/i, "collections reads must be scoped to the current user");
  assertContains([source, collectionItemPolicy].join("\n"), /collection_items[\s\S]{0,600}collections[\s\S]{0,320}user_id\s*=\s*auth\.uid\(\)|collection_id[\s\S]{0,600}user_id\s*=\s*auth\.uid\(\)/i, "collection item reads/writes must verify ownership through collections.user_id");
  assertNotContains(source, /visibility\s*:\s*["']public["']|collection_visibility[^;\n]*["']public["']|public collection sharing/i, "Phase 10 collections must not add public collection sharing");
  assertNotContains(source, /userId\s*=\s*(?:request|body|payload|input)\.userId|\.eq\(\s*["']user_id["']\s*,\s*(?:request|body|payload|input)\.userId\s*\)/i, "collection reads must not trust client-supplied user ids");
});

test("Phase 10 anonymous download returns 401", async () => {
  await assertProjectFile("app/api/download/[sampleId]/route.ts", "entitlement-checked original download route");
  const source = await downloadSource();
  const routeSource = await projectFile("app/api/download/[sampleId]/route.ts");

  assertContains(routeSource, /export\s+async\s+function\s+GET\b/i, "download route must expose an async GET");
  assertContains(source, /getCurrentUser|getUser\(\)|auth\.getUser|getEntitlementForCurrentUser|read Supabase session/i, "download route must read session server-side");
  assertContains(source, /status\s*:\s*401|NextResponse\.json\([\s\S]{0,260}401|new Response\([\s\S]{0,260}401/i, "anonymous download must return HTTP 401");
  assertContains(source, /not_authenticated/i, "anonymous download must use AUTH-26 not_authenticated");
  assertNotContains(routeSource, /notImplementedRoute/i, "download route must not remain a placeholder");
});

test("Phase 10 non-entitled download returns 403", async () => {
  const source = await downloadSource();

  assertContains(source, /getEntitlementForCurrentUser|resolveEntitlementForUserState|canDownloadOriginal|has_download_entitlement/i, "download route must resolve the normalized entitlement state");
  assertContains(source, /canDownloadOriginal\s*===?\s*false|!entitlement\.canDownloadOriginal|has_download_entitlement[\s\S]{0,260}(?:false|not_entitled)/i, "download route must branch on denied download entitlement");
  assertContains(source, /status\s*:\s*403|NextResponse\.json\([\s\S]{0,260}403|new Response\([\s\S]{0,260}403/i, "non-entitled download must return HTTP 403");
  assertContains(source, /not_entitled/i, "non-entitled download must use AUTH-26 not_entitled");
  assertNotContains(source, /stripe\.(?:customers|subscriptions|checkout|billing)|new Stripe|\/v1\/subscriptions/i, "download entitlement must not call Stripe at request time");
});

test("Phase 10 entitled download returns a signed URL and never returns original paths", async () => {
  await assertProjectFile("app/api/download/[sampleId]/route.ts", "entitled original download response");
  const source = await downloadSource();
  const routeSource = await projectFile("app/api/download/[sampleId]/route.ts");

  assertContains(source, /\.from\(\s*["']samples["']\s*\)[\s\S]{0,360}\.eq\(\s*["']status["']\s*,\s*["']published["']\s*\)|status\s*=\s*["']published["']/i, "download route must require a published sample");
  assertContains(source, /\.from\(\s*["']sample_assets["']\s*\)[\s\S]{0,360}(?:kind|asset_kind)[\s\S]{0,120}original_wav/i, "download route must fetch the original_wav asset server-side");
  assertContains(source, /createSignedDownloadUrl\([\s\S]{0,240}(?:60|120|180|240|300)|createSignedUrl\([\s\S]{0,240}(?:60|120|180|240|300)/i, "download route must create a short-lived signed URL");
  assertContains(routeSource, /url\s*:|signedUrl|signed_url/i, "download response must return the signed URL");
  assertContains(routeSource, /expiresAt|expires_at/i, "download response must expose the signed URL expiry");
  assertNotContains(routeSource, /objectPath\s*:|object_path\s*:|originalPath\s*:|original_path\s*:|bucket\s*:/i, "download response must not include raw original path or bucket fields");
});

test("Phase 10 download inserts an event with the correct source", async () => {
  const source = await downloadSource();

  assertContains(source, /\.from\(\s*["']downloads["']\s*\)[\s\S]{0,260}insert\(/i, "successful download must insert a downloads event");
  assertContains(source, /source\s*:\s*(?:source\s*\?\?\s*)?["']web["']|source\s*=\s*["']web["']|download_source[^;\n]*["']web["']/i, "web download events must default to source = web");
  assertContains(source, /source\s*:\s*["']plugin["']|download_source[^;\n]*["']plugin["']|searchParams\.get\(\s*["']source["']\s*\)[\s\S]{0,120}plugin/i, "download logging must preserve plugin source when the plugin wrapper uses it");
  assertContains(source, /subscription_state_at_download|subscriptionStatus/i, "download event must record the entitlement/subscription state at download time");
  assertNotContains(source, /not_authenticated[\s\S]{0,260}\.from\(\s*["']downloads["']\s*\)[\s\S]{0,120}insert\(|not_entitled[\s\S]{0,260}\.from\(\s*["']downloads["']\s*\)[\s\S]{0,120}insert\(/i, "failed unauthorized downloads must not be logged as successful downloads");
});

test("Phase 10 local owner export writes a collision-safe file to the dropzone", async () => {
  await assertProjectFile("lib/local-export.ts", "local owner dropzone export service");
  await assertProjectFile("app/api/local/dropzone/export/route.ts", "local owner export route");
  const source = await localExportSource();

  assertContains(source, /AIS_ACCESS_MODE[\s\S]{0,180}local_owner|getAccessMode\(\)[\s\S]{0,180}local_owner|accessMode[\s\S]{0,180}local_owner/i, "local export must verify local_owner mode");
  assertContains(source, /AIS_LOCAL_DROPZONE_DIR|flDropzone|getLocalPaths\(\)[\s\S]{0,160}flDropzone/i, "local export must target the configured FL dropzone");
  assertContains(source, /resolveTokenizedPath\(|sourceWavTokenizedPath|server-side path/i, "local export must resolve the source WAV path server-side");
  assertContains(source, /copyFile\(|fs\.copyFile|writeFile\(|rename\(|downloadObject\([\s\S]{0,360}writeFile\(/i, "local export must physically materialize a WAV file");
  assertContains(source, /exists|access\(|stat\(|collisionSuffixApplied|while\s*\([\s\S]{0,160}exists/i, "local export must detect existing destination collisions");
  assertContains(source, /\(\d+\)|-\d+|_\d+|collisionSuffix|nextAvailable|append.*suffix/i, "local export must append a numeric suffix on collision");
});

test("Phase 10 exported filename preserves poetic identity and stable short sample ID", async () => {
  await assertProjectFile("lib/local-export.ts", "local export filename builder");
  const source = await projectFile("lib/local-export.ts");

  assertContains(source, /sanitizeFilename\(|buildExportFilename|formatExportFilename/i, "local export must build a sanitized export filename");
  assertContains(source, /poeticName|poetic_name/i, "export filename must preserve poetic identity");
  assertContains(source, /bpm|no_bpm/i, "export filename must include BPM or no_bpm");
  assertContains(source, /musicalKey|musical_key|no_key/i, "export filename must include key or no_key");
  assertContains(source, /sampleId(?:\.slice\(\s*0\s*,\s*8\s*\)|Short)|sample_id_short|shortSampleId|stable.*short/i, "export filename must include a stable short sample id");
  assertContains(source, /__ais\.wav|ais\.wav/i, "export filename must end with the AIS WAV marker");
  assertNotContains(source, /original_filename[\s\S]{0,180}(?:filename|export)|upload_filename[\s\S]{0,180}(?:filename|export)/i, "export filename must not use upload filename instead of poetic identity");
});

test("Phase 10 reveal and copy actions are local-owner-only and resolve server-side paths", async () => {
  await assertProjectFile("lib/local-export.ts", "local reveal/copy service");
  await assertProjectFile("app/api/local/path/reveal/route.ts", "server-side local reveal route");
  await assertProjectFile("app/api/local/path/copy/route.ts", "server-side local copy-path route");
  const source = await localExportSource();

  assertContains(source, /reveal|Reveal in Finder|open-local-path|finder/i, "local workflow must expose a reveal action");
  assertContains(source, /copyPath|copy path|Copy File Path|clipboard|local path/i, "local workflow must expose a copy path action");
  assertContains(source, /AIS_ACCESS_MODE[\s\S]{0,220}local_owner|getAccessMode\(\)[\s\S]{0,220}local_owner|accessMode[\s\S]{0,220}local_owner/i, "reveal/copy actions must be gated to local_owner mode");
  assertContains(source, /resolveTokenizedPath\(|tokenizedPath|exportedTokenizedPath/i, "reveal/copy actions must resolve tokenized paths server-side");
  assertContains(source, /assertInsideRoot|Path is outside AIS local root|path\.relative\(/i, "reveal/copy path resolution must keep paths inside the AIS local root");
  assertNotContains(source, /absolutePath\s*:\s*(?:body|request|payload|input)\.absolutePath|path\s*:\s*(?:body|request|payload|input)\.path/i, "reveal/copy actions must not trust arbitrary client-supplied absolute paths");
});

test("Phase 10 frontend local-only controls never appear ungated in public modes", async () => {
  const publicSource = await combinedSource([
    "app/page.tsx",
    "app/browse",
    "app/samples",
    "components/library",
    "components/discovery",
    "components/player",
    "components/sample-actions",
  ], [".ts", ".tsx"]);
  const publicLocalControls = /Export to FL Dropzone|Reveal in Finder|Copy File Path|open-local-path|flDropzone|AIS_LOCAL_DROPZONE_DIR/i;

  if (!publicLocalControls.test(publicSource)) {
    assertContains(
      publicSource,
      /canUseLocalActions|isLocalOwner|accessMode|local_owner|Export to FL Dropzone|Reveal in Finder|Copy File Path/i,
      "frontend must implement local-owner gated controls, not omit Phase 10 local action handling entirely",
    );
    return;
  }

  assertContains(publicSource, /accessMode\s*={2,3}\s*["']local_owner["']|accessMode\s*!==?\s*["']local_owner["']|isLocalOwner|canUseLocalActions/i, "public UI local-only controls must be guarded by local_owner access state");
  assertNotContains(publicSource, /Export to FL Dropzone[\s\S]{0,400}(?:return\s*\(|<button\b)(?![\s\S]{0,400}(?:local_owner|isLocalOwner|canUseLocalActions))/i, "Export to FL Dropzone must not render as an ungated public button");
  assertNotContains(publicSource, /Reveal in Finder[\s\S]{0,400}(?:return\s*\(|<button\b)(?![\s\S]{0,400}(?:local_owner|isLocalOwner|canUseLocalActions))/i, "Reveal in Finder must not render as an ungated public button");
  assertNotContains(publicSource, /Copy File Path[\s\S]{0,400}(?:return\s*\(|<button\b)(?![\s\S]{0,400}(?:local_owner|isLocalOwner|canUseLocalActions))/i, "Copy File Path must not render as an ungated public button");
});
