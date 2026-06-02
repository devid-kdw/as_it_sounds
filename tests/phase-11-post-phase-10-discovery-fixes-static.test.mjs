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

async function discoverySource() {
  return combinedSource([
    "lib/data/search.ts",
    "types/api.ts",
    "supabase/migrations",
  ]);
}

async function publicSearchShapeSource() {
  const apiTypes = await projectFile("types/api.ts");
  const searchResultShape = extractSourceRange(apiTypes, /export type SearchSampleResult\b/, /export type SuggestedCategory\b/);
  const searchResponseShape = extractSourceRange(apiTypes, /export type SearchResponse\b/, /export type SearchLogInput\b/);
  const searchData = await projectFile("lib/data/search.ts");
  const resultBuilder = extractSourceRange(searchData, /async function buildRpcSearchSampleResults\b/, /function buildRpcAssetRef\b/);
  const assetBuilder = extractSourceRange(searchData, /function buildRpcAssetRef\b/, /async function getMoodsForSamples\b/);
  const routeSource = await combinedSource(["app/api/search", "app/api/wander", "app/api/similar"], [".ts", ".tsx"]);

  return [searchResultShape, searchResponseShape, resultBuilder, assetBuilder, routeSource].join("\n");
}

test("Post-Phase-10 discovery routes are real endpoints rather than placeholders", async () => {
  await assertProjectFile("app/api/wander/route.ts", "Wander discovery API");
  await assertProjectFile("app/api/similar/[sampleId]/route.ts", "similar samples API");

  const wanderRoute = await projectFile("app/api/wander/route.ts");
  const similarRoute = await projectFile("app/api/similar/[sampleId]/route.ts");

  for (const [routeName, source] of [
    ["/api/wander", wanderRoute],
    ["/api/similar/[sampleId]", similarRoute],
  ]) {
    assertContains(source, /export\s+async\s+function\s+GET\b|export\s+function\s+GET\b/i, `${routeName} must expose GET`);
    assertNotContains(source, /notImplementedRoute|placeholder|reserved for a later/i, `${routeName} must not be a placeholder`);
    assertContains(source, /NextResponse\.json|Response\.json/i, `${routeName} must return a real JSON response`);
  }

  assertContains(wanderRoute, /getWanderSamples|wander/i, "/api/wander must delegate to Wander discovery logic");
  assertContains(similarRoute, /getSimilarSamples|similar/i, "/api/similar/[sampleId] must delegate to similar discovery logic");
});

test("Similar scoring includes DISC-17 metadata signals and album diversity", async () => {
  const source = await discoverySource();
  const similarHelper = extractSourceRange(source, /export\s+async\s+function\s+getSimilarSamples\b/, /export\s+async\s+function\s+getWanderSamples\b/);
  const similarRpc = extractSourceRange(source, /create\s+or\s+replace\s+function\s+public\.similar_samples\b/i, /create\s+or\s+replace\s+function\s+public\.wander_samples\b/i);
  const similarSource = [similarHelper, similarRpc].join("\n");

  assertContains(similarSource || source, /status[\s\S]{0,120}published|published[\s\S]{0,120}status/i, "similar results must be published-only");
  assertContains(similarSource || source, /sampleId|sample_id/i, "similar scoring must be anchored to the source sample");
  assertContains(similarSource || source, /moods?|sample_moods|mood_slug/i, "DISC-17 similar scoring must include mood overlap");
  assertContains(similarSource || source, /category|category_slug/i, "DISC-17 similar scoring must include category affinity");
  assertContains(similarSource || source, /sample_?type|sample_type_slug/i, "DISC-17 similar scoring must include sample type affinity");
  assertContains(similarSource || source, /hidden_?tags?|sample_hidden_tags|tag_slug/i, "DISC-17 similar scoring must include hidden-tag overlap");
  assertContains(similarSource || source, /\bbpm\b|tempo/i, "DISC-17 similar scoring must include BPM proximity");
  assertContains(similarSource || source, /album|album_samples|album_id/i, "DISC-17 similar scoring must include album context");
  assertContains(similarSource || source, /divers|sameAlbumPenalty|albumPenalty|distinct\s+on|partition\s+by\s+album/i, "similar results must protect album diversity instead of returning only same-album neighbors");
  assertContains(similarSource || source, /score|weight|rank/i, "similar results must use explicit weighted scoring");
});

test("Wander handles exclusions, recently played context, and wander event logging", async () => {
  const source = await discoverySource();
  const wanderHelper = extractSourceRange(source, /export\s+async\s+function\s+getWanderSamples\b/, /export\s+async\s+function\s+logSearchEvent\b/);
  const wanderRpc = extractSourceRange(source, /create\s+or\s+replace\s+function\s+public\.wander_samples\b/i, /\$\$;\s*$/i);
  const wanderSource = [wanderHelper, wanderRpc].join("\n");

  assertContains(wanderSource || source, /status[\s\S]{0,120}published|published[\s\S]{0,120}status/i, "Wander must return only published samples");
  assertContains(wanderSource || source, /exclude|excludedSampleIds|exclude_ids|not\(["']id["']|\.not\(\s*["']id["']/i, "Wander must accept or apply explicit sample exclusions");
  assertContains(wanderSource || source, /recently_played|recentlyPlayed|recent/i, "Wander must consider recently played samples for exclusion");
  assertContains(wanderSource || source, /wander_events|logWander|action[\s\S]{0,80}(?:shown|served|skipped|clicked)|mood_slug/i, "Wander must write or expose wander event logging");
  assertContains(wanderSource || source, /seed|random_seeded|random|shuffle/i, "Wander must keep seeded/randomized discovery behavior");
});

test("Public discovery responses do not expose original WAV assets", async () => {
  const source = await publicSearchShapeSource();

  assertContains(source, /SearchSampleResult|previewAsset|waveformAsset|previewAssetUrl|waveformPeaksUrl/i, "public response source must include safe preview and waveform payloads");
  assertNotContains(source, /original_wav|originalAsset|originalUrl|original_bucket|original_path|signedUrl|signed_url/i, "public discovery response shapes and routes must not expose original WAV assets, storage paths, or signed original URLs");
});

test("Stripe webhook is implemented with signature verification and idempotency ledger", async () => {
  await assertProjectFile("app/api/stripe/webhook/route.ts", "Stripe webhook route");
  const source = await projectFile("app/api/stripe/webhook/route.ts");

  assertContains(source, /export\s+async\s+function\s+POST\b/i, "Stripe webhook must expose POST");
  assertNotContains(source, /notImplementedRoute|reserved for a later/i, "Stripe webhook must not be a placeholder");
  assertContains(source, /stripe-signature|STRIPE_WEBHOOK_SECRET|verifyStripeSignature/i, "Stripe webhook must verify Stripe signatures");
  assertContains(source, /stripe_webhook_events[\s\S]{0,300}insert|insert[\s\S]{0,300}stripe_webhook_events/i, "Stripe webhook must write the idempotency ledger before processing");
  assertContains(source, /subscriptions[\s\S]{0,400}(?:upsert|update)|(?:upsert|update)[\s\S]{0,400}subscriptions/i, "Stripe webhook must update the local subscription mirror");
  assertContains(source, /entitlement_events/i, "Stripe webhook must write entitlement transition events");
});
