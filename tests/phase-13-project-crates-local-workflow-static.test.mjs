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
    if (["node_modules", ".next", ".git", ".turbo", "coverage"].includes(entry.name)) {
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

async function combinedSource(relativePaths, extensions = [".ts", ".tsx", ".sql", ".json"]) {
  const files = (
    await Promise.all(relativePaths.map((relativePath) => collectFilesIfPresent(relativePath, extensions)))
  ).flat();
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));

  return sources.join("\n");
}

async function crateSource() {
  return combinedSource([
    "app/api/local/crate",
    "lib/local-crates.ts",
    "lib/local-events.ts",
    "lib/local-paths.ts",
    "components/local-crates",
    "types/api.ts",
  ]);
}

function assertContains(source, pattern, message) {
  assert.match(source, pattern, message);
}

function assertNotContains(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

test("Phase 13 crate creation writes tokenized manifests with atomic temp-to-rename behavior", async () => {
  await assertProjectFile("app/api/local/crate/sync/route.ts", "LOCAL-10.6 crate sync route");
  await assertProjectFile("lib/local-crates.ts", "Project Crate manifest service");
  const source = await crateSource();

  assertContains(source, /export\s+async\s+function\s+POST\b/i, "crate sync must expose a POST route");
  assertContains(source, /CRATE_MANIFEST_FILENAME\s*=\s*["']crate\.json["']|crate\.json/i, "crate sync must write crate.json");
  assertContains(source, /getLocalPaths\(\)\.projectCrates|projectCrates/i, "crate sync must resolve crate folders through lib/local-paths.ts");
  assertContains(source, /tokenizePath\(|AIS_LOCAL_ROOT_TOKEN|\{\{AIS_LOCAL_ROOT\}\}/i, "crate manifests and responses must use tokenized paths");
  assertContains(source, /resolveTokenizedPath\(|normalizeTokenizedPath/i, "exported crate paths must be validated through server-side token resolution");
  assertContains(source, /writeFile\([\s\S]{0,220}(?:\.tmp|temp)[\s\S]{0,220}flag:\s*["']wx["'][\s\S]{0,260}rename\(|const\s+temp[\s\S]{0,260}writeFile\([\s\S]{0,260}rename\(/i, "crate manifest writes must use an exclusive temp file followed by rename");
  assertNotContains(source, /writeFile\([\s\S]{0,180}crate\.json(?![\s\S]{0,260}rename\()/i, "crate sync must not write crate.json directly without atomic rename");
});

test("Phase 13 manifest sync is collision and duplicate safe with considered to exported to used transitions", async () => {
  const source = await projectFile("lib/local-crates.ts");

  assertContains(source, /samples:\s*ProjectCrateSampleEntry\[\]|samples:\s*Record<string,\s*ProjectCrateSampleEntry>|samples:\s*z\.record\([\s\S]{0,120}sample/i, "manifest must model one sample list or map per crate");
  assertContains(source, /find\([\s\S]{0,160}sample_id[\s\S]{0,80}sampleId|manifest\.samples\[[^\]]*sampleId/i, "crate sync must find existing entries by sample_id");
  assertContains(source, /filter\([\s\S]{0,160}sample_id[\s\S]{0,80}sampleId[\s\S]{0,220}push\(entry\)|manifest\.samples\[[^\]]*sampleId\]\s*=\s*entry/i, "crate sync must replace or upsert by sample_id instead of creating duplicates");
  assertContains(source, /(?:STATUS_RANK|rank)[\s\S]{0,180}considered\s*:\s*(?:0|1)[\s\S]{0,80}exported\s*:\s*(?:1|2)[\s\S]{0,80}used\s*:\s*(?:2|3)/i, "crate sync must rank considered before exported before used");
  assertContains(source, /strongerStatus|strongestStatus|rank\[existing\]\s*>\s*rank\[next\]/i, "crate sync must prevent status downgrades during transitions");
  assertContains(source, /first_added_at:\s*existing\?\.first_added_at\s*\?\?|first_added_at/i, "crate sync must preserve first_added_at");
  assertContains(source, /last_updated_at:\s*now|last_updated_at/i, "crate sync must update last_updated_at");
  assertContains(source, /used_in_project:\s*(?:status|nextStatus)\s*={2,3}\s*["']used["']/i, "used transitions must mark used_in_project");
  assertContains(source, /notes:[\s\S]{0,160}existing\?\.notes|hasOwnProperty\.call\([\s\S]{0,120}notes/i, "crate sync must preserve notes when a transition payload omits notes");
});

test("Phase 13 local crate endpoints reject non-local modes and anonymous or non-owner users", async () => {
  await assertProjectFile("app/api/local/crate/sync/route.ts", "local-only crate sync route");
  const source = await crateSource();

  assertContains(source, /requireLocalOwnerWorkflowEntitlement|requireLocalOwnerProjectCrateEntitlement|requireLocalOwnerCrateAccess/i, "crate routes must delegate to a local owner entitlement guard");
  assertContains(source, /getAccessMode\(\)\s*={2,3}\s*["']local_owner["']|accessMode[\s\S]{0,120}local_owner/i, "crate endpoints must reject non-local access modes");
  assertContains(source, /local_owner_only/i, "non-local or non-owner crate requests must use local_owner_only");
  assertContains(source, /isAuthenticated|not_authenticated|getEntitlementForCurrentUser/i, "crate endpoints must require an authenticated user");
  assertContains(source, /status:\s*error\.status|status\s*:\s*401|not_authenticated/i, "anonymous crate requests must return authentication failure semantics");
  assertContains(source, /isAdmin|lifetime_granted|canUsePlugin|local owner/i, "crate endpoints must restrict access to owner-capable local users");
  assertContains(source, /status:\s*error\.status|status\s*:\s*403|not_entitled|local_owner_only/i, "non-owner or non-local crate requests must fail closed with HTTP 403 semantics");
  assertNotContains(source, /bypass.*RLS|disable.*RLS|service_role[\s\S]{0,200}(?:auth|user)/i, "crate endpoints must not bypass ownership or RLS globally");
});

test("Phase 13 considered, exported, and used transitions are recorded locally", async () => {
  const source = await crateSource();

  assertContains(source, /sample_added_to_project_crate/i, "considered crate additions must be logged");
  assertContains(source, /sample_exported_to_dropzone|sync_exported_path|status[\s\S]{0,80}exported/i, "exported transitions must be recorded");
  assertContains(source, /sample_marked_used|mark_used|used_in_project/i, "used transitions must be recorded");
  assertContains(source, /logLocalUsageEvent|appendFile\([\s\S]{0,220}local-usage-events|writeManifestAtomically/i, "crate transitions must be written to local usage state");
  assertContains(source, /sourceSurface:\s*["']local-crate["']|local-crate/i, "crate usage logs must be identified as local crate usage");
  assertNotContains(source, /\.from\(\s*["']recently_played["']\s*\)[\s\S]{0,260}(?:project|crate|used_in_project)/i, "recently_played must not be overloaded as project usage state");
});

test("Phase 13 crate UI is hidden outside authenticated local owner mode", async () => {
  const sampleActions = await projectFile("components/sample-actions/sample-actions.tsx");
  const crateUi = await combinedSource(["components/local-crates"], [".ts", ".tsx"]);

  assertContains(crateUi, /Active Project Crate|Create Project Crate|local crate/i, "frontend must provide Project Crate controls");
  assertContains(sampleActions, /LocalCrateSelector|syncLocalCrateEntry|upsertLocalCrateEntry/i, "sample actions must wire Project Crate controls into sample cards/details");
  assertContains(sampleActions, /Add [^"']*Project Crate|Add to Project Crate/i, "sample actions must expose add-to-crate behavior");
  assertContains(sampleActions, /Mark [^"']*used|Mark used/i, "sample actions must expose mark-used behavior");
  assertContains(sampleActions, /isLocalOwnerSurface[\s\S]{0,260}accessMode\s*={2,3}\s*["']local_owner["']/i, "crate controls must be gated by local_owner access mode");
  assertContains(sampleActions, /isLocalOwnerSurface[\s\S]{0,260}isAuthenticated/i, "crate controls must require an authenticated user");
  assertContains(sampleActions, /isAdmin|lifetime_granted|canUsePlugin/i, "crate controls must require owner-capable local entitlement");
  assertNotContains(sampleActions, /(?:Add to Project Crate|Mark used)[\s\S]{0,420}(?:return\s*\(|<button\b)(?![\s\S]{0,420}(?:isLocalOwnerSurface|local_owner|isAuthenticated|isAdmin|lifetime_granted|canUsePlugin))/i, "crate action buttons must not render ungated in public UI");
});

test("Phase 13 export and crate usage events are logged locally", async () => {
  const source = await combinedSource([
    "app/api/local",
    "lib/local-export.ts",
    "lib/local-events.ts",
    "lib/local-crates.ts",
    "types/api.ts",
  ], [".ts", ".tsx"]);

  assertContains(source, /sample_exported_to_dropzone/i, "dropzone exports must have a local event name");
  assertContains(source, /sample_added_to_project_crate/i, "crate consideration events must have a local event name");
  assertContains(source, /sample_marked_used/i, "crate used events must have a local event name");
  assertContains(source, /appendFile\([\s\S]{0,260}local-usage-events|logLocalUsageEvent|tryLogLocalUsageEvent/i, "local workflow events must be persisted locally");
  assertContains(source, /tokenizedPath|tokenized_path|tokenizePath\(/i, "event payloads must preserve tokenized local paths");
});

test("Phase 13 committed manifests and public payloads do not contain machine-specific absolute paths", async () => {
  const productionSource = await combinedSource([
    "app",
    "components",
    "lib",
    "types",
    "supabase",
    "public",
  ], [".ts", ".tsx", ".sql", ".json", ".md"]);

  assertNotContains(productionSource, /\/Users\/[^"'`\s)]+/i, "production-facing source must not contain machine-specific /Users paths");
  assertNotContains(productionSource, /exported_path\s*:\s*absolutePath|local_path\s*:\s*absolutePath|path\s*:\s*absolutePath(?![\s\S]{0,120}copy)/i, "public rows and payloads must not store absolute local paths");
  assertContains(productionSource, /\{\{AIS_LOCAL_ROOT\}\}|AIS_LOCAL_ROOT_TOKEN|tokenizePath\(/i, "local path handling must use {{AIS_LOCAL_ROOT}} tokenization");

  const crateManifestFiles = (await collectFiles(root, [".json"])).filter((filePath) => path.basename(filePath) === "crate.json");

  for (const filePath of crateManifestFiles) {
    const manifest = await readFile(filePath, "utf8");
    assertNotContains(manifest, /\/Users\/[^"'`\s)]+/i, `${path.relative(root, filePath)} must not contain machine-specific /Users paths`);
  }
});
