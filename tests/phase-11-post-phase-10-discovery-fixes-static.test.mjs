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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSqlFunction(source, functionName) {
  return extractSourceRange(
    source,
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${escapeRegExp(functionName)}\\s*\\(`, "i"),
    /\$\$;/i,
  );
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

async function playEventSource() {
  return combinedSource([
    "app/api/play-events/route.ts",
    "app/api/download",
    "app/api/local",
    "app/api/similar",
    "lib/data/analytics.ts",
    "lib/local-export.ts",
    "supabase/migrations",
  ]);
}

async function adminAnalyticsSource() {
  return combinedSource([
    "app/admin/layout.tsx",
    "app/admin/analytics/page.tsx",
    "app/api/admin/analytics",
    "lib/data/analytics.ts",
    "config/navigation.ts",
    "supabase/migrations",
  ]);
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
  assertContains(similarSource || source, /source_sample[\s\S]{0,180}status\s*=\s*'published'/i, "similar source sample must be published before scoring");
  assertContains(similarSource || source, /s\.id\s*<>\s*p_sample_id|sample_id\s*<>\s*p_sample_id|not\s+eq\(["']id["']/i, "similar results must exclude the current sample");
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

test("Wander handles published-only filtering, exclusions, mood/category context, and event logging", async () => {
  const source = await discoverySource();
  const wanderHelper = extractSourceRange(source, /export\s+async\s+function\s+getWanderSamples\b/, /export\s+async\s+function\s+logSearchEvent\b/);
  const wanderRpc = extractSourceRange(source, /create\s+or\s+replace\s+function\s+public\.wander_samples\b/i, /\$\$;\s*$/i);
  const wanderSource = [wanderHelper, wanderRpc].join("\n");

  assertContains(wanderSource || source, /status[\s\S]{0,120}published|published[\s\S]{0,120}status/i, "Wander must return only published samples");
  assertContains(wanderSource || source, /exclude|excludedSampleIds|exclude_ids|not\(["']id["']|\.not\(\s*["']id["']/i, "Wander must accept or apply explicit sample exclusions");
  assertContains(wanderSource || source, /recently_played|recentlyPlayed|recent/i, "Wander must consider recently played samples for exclusion");
  assertContains(wanderSource || source, /wander_events|logWander|action[\s\S]{0,80}(?:shown|served|skipped|clicked)|mood_slug/i, "Wander must write or expose wander event logging");
  assertContains(wanderSource || source, /mood_slug[\s\S]{0,360}sample_moods|sample_moods[\s\S]{0,360}mood_slug/i, "Wander mood filter must match sample moods");
  assertContains(wanderSource || source, /category_slug[\s\S]{0,160}category_slug/i, "Wander category filter must match sample category");
  assertContains(wanderSource || source, /seed|random_seeded|random|shuffle/i, "Wander must keep seeded/randomized discovery behavior");
});

test("Wander randomization is bounded to a candidate pool instead of naive full-table random", async () => {
  const source = await discoverySource();
  const wanderRpc = extractSourceRange(source, /create\s+or\s+replace\s+function\s+public\.wander_samples\b/i, /\$\$;\s*$/i);
  const wanderSource = wanderRpc || source;
  const eligibleIndex = wanderSource.search(/\beligible\s+as\s*\(/i);
  const poolIndex = wanderSource.search(/\bcandidate_pool\s+as\s*\(/i);
  const randomIndex = wanderSource.search(/\brandom\s*\(/i);
  const poolSource = extractSourceRange(wanderSource, /\bcandidate_pool\s+as\s*\(/i, /\),\s*picked\s+as\s*\(/i);

  assert.ok(eligibleIndex >= 0, "Wander must build an eligible published sample set before random selection");
  assert.ok(poolIndex > eligibleIndex, "Wander must rank or trim eligible samples into a candidate pool");
  assert.ok(randomIndex > poolIndex, "Wander random ordering must happen after candidate pool limiting");
  assertContains(poolSource, /\blimit\s+\d+\b/i, "Wander candidate pool must be explicitly bounded before random ordering");
  assertNotContains(wanderSource, /from\s+public\.samples[\s\S]{0,400}order\s+by\s+random\s*\(\s*\)/i, "Wander must not random-sort the full public.samples table");
});

test("Wander page is a mood-first client discovery surface, not a generic full grid", async () => {
  await assertProjectFile("components/discovery/wander-player.tsx", "Wander discovery player");
  await assertProjectFile("app/api/wander/events/route.ts", "Wander lifecycle event API");
  const wanderPage = await projectFile("app/wander/page.tsx");
  const wanderPlayer = await projectFile("components/discovery/wander-player.tsx");
  const wanderEventsRoute = await projectFile("app/api/wander/events/route.ts");
  const source = `${wanderPage}\n${wanderPlayer}\n${wanderEventsRoute}`;

  assertContains(source, /mood constellation|primaryMoods|activeMood|wandering through/i, "Wander must expose a mood-bias constellation");
  assertContains(source, /\/api\/wander|URLSearchParams|limit/i, "Wander must draw from /api/wander rather than static page-only data");
  assertContains(source, /\/api\/wander\/events/i, "Wander must expose best-effort lifecycle event logging");
  assertContains(source, /started/i, "Wander must log or expose started lifecycle events");
  assertContains(source, /skipped/i, "Wander must log or expose skipped lifecycle events");
  assertContains(source, /recentlyPlayedIds|skippedIds|exclude/i, "Wander must send safe recently played/skipped exclusions");
  assertContains(source, /WANDER_EXCLUSION_LIMIT\s*=\s*20|slice\(0,\s*20\)|limit:\s*20/i, "Wander client exclusions must be capped at 20");
  assertContains(source, /SkipForward|skipPrimary|skip/i, "Wander must support skipping the primary draw");
  assertContains(source, /SampleCard[\s\S]{0,200}sourceSurface="wander"/i, "Wander must keep play/favorite/collection/download actions on the SampleCard contract");
  assertContains(source, /No Wander candidates are published yet|unpublished fallback/i, "Wander must show a useful empty state without unpublished fallbacks");
  assertNotContains(wanderPage, /SampleGrid/i, "Wander page must not render the generic full SampleGrid queue");
});

test("Featured discovery only returns published samples explicitly marked featured", async () => {
  const source = await combinedSource([
    "lib/data/search.ts",
    "lib/data/samples.ts",
    "supabase/migrations/0011_search_samples_rpc.sql",
  ]);
  const searchFeaturedHelper = extractSourceRange(source, /export\s+async\s+function\s+getFeaturedSamples\b/, /export\s+async\s+function\s+getSimilarSamples\b/);
  const publicFeaturedHelper = extractSourceRange(source, /export\s+async\s+function\s+getFeaturedSamples\b/, /export\s+async\s+function\s+getAdminSamples\b/);
  const searchRpc = extractSourceRange(source, /create\s+or\s+replace\s+function\s+public\.search_samples\b/i, /\$\$;\s*$/i);

  assertContains(searchFeaturedHelper || source, /featuredOnly\s*:\s*true/i, "search featured helper must request the featured-only filter");
  assertContains(searchFeaturedHelper || source, /sort\s*:\s*["']featured["']/i, "search featured helper must use featured sorting");
  assertContains(publicFeaturedHelper || source, /featured\s*:\s*true/i, "public home featured rail must request featured samples");
  assertContains(source, /\.eq\(\s*["']status["']\s*,\s*["']published["']\s*\)|status\s*=\s*'published'/i, "featured queries must stay published-only");
  assertContains(searchRpc || source, /featured_only[\s\S]{0,260}s\.featured\s*=\s*true|s\.featured\s*=\s*true[\s\S]{0,260}featured_only/i, "search RPC must enforce p_featured_only against samples.featured");
});

test("Play events update recently_played and sample_stats play counters", async () => {
  await assertProjectFile("app/api/play-events/route.ts", "play event capture API");
  const source = await playEventSource();
  const route = await projectFile("app/api/play-events/route.ts");
  const analyticsHelper = await projectFile("lib/data/analytics.ts");

  assertContains(route, /export\s+async\s+function\s+POST\b/i, "play event route must expose POST");
  assertContains(route, /tryLogPlayEvent/i, "play event route must delegate event persistence to shared analytics code");
  assertContains(analyticsHelper, /sample_play_events[\s\S]{0,240}insert|insert[\s\S]{0,240}sample_play_events/i, "play events must insert sample_play_events rows");
  assertContains(analyticsHelper, /recently_played[\s\S]{0,260}upsert|upsert[\s\S]{0,260}recently_played/i, "play events must upsert recently_played for signed-in users");
  assertContains(analyticsHelper, /status[\s\S]{0,140}published|published[\s\S]{0,140}status/i, "play event logging must only count published samples");
  const triggerMatch = source.match(
    /create\s+trigger\s+[a-z0-9_]*play[a-z0-9_]*\s+after\s+insert\s+on\s+public\.sample_play_events\s+for\s+each\s+row\s+execute\s+function\s+public\.([a-z0-9_]+)\s*\(\s*\)/i,
  );

  assert.ok(triggerMatch, "play-count stats must be enforced by a database trigger on sample_play_events");
  const playStatsFunction = extractSqlFunction(source, triggerMatch[1]);

  assertContains(playStatsFunction, /sample_stats/i, "sample_play_events trigger function must update sample_stats");
  assertContains(playStatsFunction, /play_count[\s\S]{0,160}(?:\+|excluded|new\.)|(?:\+|excluded|new\.)[\s\S]{0,160}play_count/i, "sample_play_events trigger function must increment sample_stats.play_count");
  assertContains(playStatsFunction, /last_played_at/i, "play-count stats sync must update last_played_at");
  assertContains(route, /shouldLogPlayback/i, "pause and seek events must not inflate play counters");
  assertContains(route, /catch[\s\S]{0,240}logged:\s*false/i, "play logging failures must be accepted without breaking playback");
});

test("Persistent player emits non-blocking play analytics with source surface", async () => {
  const player = await projectFile("components/player/persistent-player-shell.tsx");
  const route = await projectFile("app/api/play-events/route.ts");
  const source = `${player}\n${route}`;

  assertContains(player, /navigator\.sendBeacon|keepalive:\s*true/i, "player analytics must be non-blocking");
  assertContains(player, /\/api\/play-events/i, "player must post playback events to /api/play-events");
  assertContains(source, /preview_start|eventType[\s\S]{0,80}play/i, "playback analytics must handle play/preview_start events");
  assertContains(source, /sourceSurface/i, "playback analytics must include sourceSurface context");
  assertContains(player, /loggedPreviewStartRef/i, "preview start logging should be deduped for the active sample");
  assertContains(player, /meaningfulPlayThreshold|durationSeconds\s*\*\s*0\.2|Math\.min\(\s*2/i, "playback analytics should wait for the DISC-19 meaningful play threshold");
  assertContains(player, /\/api\/wander\/events[\s\S]{0,240}played|played[\s\S]{0,240}\/api\/wander\/events/i, "Wander playback should emit played lifecycle events");
});

test("Successful downloads and similar clicks sync sample_stats safely", async () => {
  const source = await playEventSource();
  const downloadRoute = await projectFile("app/api/download/[sampleId]/route.ts");
  const downloadTriggerMatch = source.match(
    /create\s+trigger\s+[a-z0-9_]*downloads[a-z0-9_]*\s+after\s+insert\s+on\s+public\.downloads\s+for\s+each\s+row\s+execute\s+function\s+public\.([a-z0-9_]+)\s*\(\s*\)/i,
  );
  const similarTriggerMatch = source.match(
    /create\s+trigger\s+[a-z0-9_]*similar[a-z0-9_]*\s+after\s+insert\s+on\s+public\.similar_sample_events\s+for\s+each\s+row\s+execute\s+function\s+public\.([a-z0-9_]+)\s*\(\s*\)/i,
  );

  assert.ok(downloadTriggerMatch, "download-count stats must be enforced by a database trigger on downloads");
  assert.ok(similarTriggerMatch, "similar-click stats must be enforced by a database trigger on similar_sample_events");

  const downloadStatsFunction = extractSqlFunction(source, downloadTriggerMatch[1]);
  const similarStatsFunction = extractSqlFunction(source, similarTriggerMatch[1]);

  assertContains(downloadStatsFunction, /sample_stats/i, "downloads trigger function must update sample_stats");
  assertContains(downloadStatsFunction, /download_count[\s\S]{0,160}(?:\+|excluded|new\.)|(?:\+|excluded|new\.)[\s\S]{0,160}download_count/i, "downloads trigger function must increment sample_stats.download_count");
  assertContains(downloadStatsFunction, /last_downloaded_at/i, "download stats sync must update last_downloaded_at");
  assertContains(source, /logLocalExportDownload[\s\S]{0,500}\.from\(\s*["']downloads["']\s*\)[\s\S]{0,240}insert\(/i, "local exports must log successful downloads through the downloads table");
  assertContains(similarStatsFunction, /sample_stats/i, "similar_sample_events trigger function must update sample_stats");
  assertContains(similarStatsFunction, /similar_click_count[\s\S]{0,160}(?:\+|excluded|new\.)|(?:\+|excluded|new\.)[\s\S]{0,160}similar_click_count/i, "similar_sample_events trigger function must increment sample_stats.similar_click_count");
  assertContains(source, /\.from\(\s*["']samples["']\s*\)[\s\S]{0,240}\.eq\(\s*["']status["']\s*,\s*["']published["']\s*\)/i, "similar click logging must require published source and clicked samples");
  assertNotContains(downloadRoute, /objectPath\s*:|object_path\s*:|originalPath\s*:|original_path\s*:|bucket\s*:/i, "download responses must not leak original storage paths");
});

test("Admin analytics is admin-only and reads real analytics data through admin-owned surfaces", async () => {
  await assertProjectFile("app/admin/analytics/page.tsx", "admin analytics page");
  const source = await adminAnalyticsSource();
  const adminLayout = await projectFile("app/admin/layout.tsx");
  const analyticsPage = await projectFile("app/admin/analytics/page.tsx");

  assertContains(adminLayout, /requireAdmin\(/, "admin layout must gate nested analytics with requireAdmin");
  assertContains(source, /href:\s*["']\/admin\/analytics["']|\/admin\/analytics/i, "analytics must be reachable only under the admin route namespace");
  assertContains(source, /admin can read all play events|admin can read all downloads|admin can read search logs/i, "analytics backing tables must have admin-only read policies");
  assertContains(analyticsPage, /sample_play_events|downloads|search_logs|sample_stats|listAdminAnalytics|getAdminAnalytics|createSupabaseAdminClient/i, "admin analytics page must read real analytics data instead of placeholder numbers");
  assertNotContains(analyticsPage, /phase-gated|pending|No usage events are connected yet|must not invent dashboard numbers/i, "admin analytics page must not remain a placeholder once Phase 11 analytics is in scope");
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
