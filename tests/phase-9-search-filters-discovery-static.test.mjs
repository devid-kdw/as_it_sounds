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

function assertContains(source, pattern, message) {
  assert.ok(pattern.test(source), message);
}

function assertNotContains(source, pattern, message) {
  assert.ok(!pattern.test(source), message);
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

async function searchContractSource() {
  return combinedSource([
    "lib/data/search.ts",
    "app/api/search/route.ts",
    "types/search.ts",
    "types/sample.ts",
    "types/api.ts",
    "supabase/migrations",
  ]);
}

test("Phase 9 shared search entry point and safe web/plugin response shape exist", async () => {
  await assertProjectFile("lib/data/search.ts", "the Phase 9 stable search integration point");
  await assertProjectFile("app/api/search/route.ts", "the Phase 9 browser/plugin route boundary");
  const source = await searchContractSource();
  const apiSource = await projectFile("app/api/search/route.ts");

  assertContains(source, /export\s+(?:async\s+)?function\s+searchSamples\b|export\s+const\s+searchSamples\b/i, "lib/data/search.ts must export searchSamples as the shared web/plugin entry point");
  assertContains(apiSource, /export\s+async\s+function\s+GET\b/i, "/api/search must expose GET");
  assertContains(apiSource, /searchSamples\(/, "/api/search must delegate to lib/data/search.ts");
  assertContains(source, /SearchInput/i, "search contract must define or consume SearchInput");
  assertContains(source, /SearchResponse/i, "search contract must define or consume SearchResponse");
  assertContains(source, /SearchSampleResult/i, "search contract must define or consume SearchSampleResult");
  assertContains(source, /source\??\s*:\s*["']web["']\s*\|\s*["']plugin["']|z\.enum\(\s*\[\s*["']web["']\s*,\s*["']plugin["']\s*\]\s*\)|search_source/i, "search input/logging must support both web and plugin source values");
  assertContains(source, /previewAsset|previewAssetUrl|preview_bucket|preview_object_path/i, "search results must include only safe preview asset data");
  assertContains(source, /waveformAsset|waveformPeaksUrl|waveform_bucket|waveform_object_path/i, "search results must include only safe waveform asset data");
  assertContains(source, /stats\??\s*:|playCount|downloadCount|favoriteCount|play_count|download_count|favorite_count/i, "shared result shape must expose optional safe stats for web and plugin consumers");
  assertNotContains(source, /SearchSampleResult[\s\S]{0,900}original_wav|SearchResponse[\s\S]{0,1200}original_wav|previewAsset[\s\S]{0,500}original_wav|waveformAsset[\s\S]{0,500}original_wav/i, "public search result types must not include original WAV assets");
});

test("Phase 9 search ranking implements DISC-08 poetic identity, FTS, trigram, field, curation, freshness, and popularity signals", async () => {
  const source = await searchContractSource();

  assertContains(source, /search_samples|sample_search_documents|combined_fts|search_vector/i, "search must use the approved RPC or server-side search document query layer");
  assertContains(source, /poetic_name|poeticName/i, "ranking must include poetic identity");
  assertContains(source, /8\.0|exactSlugScore|exact_slug_score/i, "exact poetic slug match must carry the DISC-08 8.0 priority");
  assertContains(source, /6\.0|startsWith|starts_with|like\s+[^;]*\|\|\s*['"]%?['"]|prefix/i, "poetic slug prefix matches must receive the secondary exact-slug priority");
  assertContains(source, /ts_rank_cd|ts_rank|plainto_tsquery|websearch_to_tsquery|combined_fts|fullTextScore|fts_score/i, "full-text score must be part of ranking");
  assertContains(source, /least\([\s\S]{0,220}(?:10[\s\S]{0,220}6\.0|6\.0[\s\S]{0,220}10)|fts_score|fullTextScore/i, "full-text rank must be bounded so it cannot dominate poetic identity");
  assertContains(source, /similarity\(|trigram|pg_trgm|trigramScore|trigram_score/i, "fuzzy typo search must use trigram behavior");
  assertContains(source, /0\.12|trigramThreshold|similarityThreshold/i, "trigram candidates must use the DISC-08 threshold behavior");

  for (const [pattern, label] of [
    [/poetic_name_text|poeticNameText|poetic_name[\s\S]{0,80}5\.0/i, "poetic-name field match scoring"],
    [/display_title_text|displayTitleText|display_title[\s\S]{0,80}4\.0/i, "display-title field match scoring"],
    [/mood_text|moodText|mood_tags|sample_moods[\s\S]{0,140}3\.0/i, "mood field match scoring"],
    [/hidden_tag_text|hiddenTagText|hidden_search_tags|sample_hidden_tags[\s\S]{0,160}2\.0/i, "hidden tag field match scoring"],
    [/description_text|short_description|descriptionText[\s\S]{0,160}1\.75/i, "short-description field match scoring"],
    [/category_text|categoryText|category_slug[\s\S]{0,160}1\.5/i, "category field match scoring"],
    [/sample_type_text|sampleTypeText|sample_type_slug[\s\S]{0,160}1\.5/i, "sample type field match scoring"],
    [/album_text|albumText|album_title[\s\S]{0,160}0\.75/i, "album field match scoring"],
  ]) {
    assertContains(source, pattern, `ranking must include ${label}`);
  }

  assertContains(source, /featured[\s\S]{0,120}1\.0|curation_boost|curationBoost/i, "featured curation boost must be included");
  assertContains(source, /published_at[\s\S]{0,240}(?:7 days|30 days|0\.5|0\.25)|freshness_boost|freshnessBoost/i, "freshness boost must be small and decay by age");
  assertContains(source, /play_count|favorite_count|light_popularity_boost|popularityBoost|Math\.log|ln\(/i, "empty/browse ranking must include only a light popularity tie-breaker");
  assertNotContains(source, /embedding|pgvector|semantic|openai|\bvector\s*\(/i, "Phase 9 MVP search tests guard metadata search from drifting into semantic/vector search");
});

test("Phase 9 search filters cover every DISC-10 filter and enforce published-only eligibility", async () => {
  const source = await searchContractSource();

  assertContains(source, /\bsearchSamples\b|public\.search_samples|search_samples\s*\(/i, "filter assertions must be anchored to the Phase 9 search implementation");
  assertContains(source, /\.eq\(\s*["']status["']\s*,\s*["']published["']\s*\)|status\s*=\s*['"]published['"]|s\.status\s*=\s*['"]published['"]/i, "public search must hard-filter samples.status = 'published'");
  assertNotContains(source, /status\s+in\s*\([^)]*(?:draft|processing|needs_review|failed|archived)|\.in\(\s*["']status["'][\s\S]{0,180}(?:draft|processing|needs_review|failed|archived)/i, "public search must not include unpublished lifecycle states");

  for (const [pattern, label] of [
    [/moods|p_moods|sample_moods|mood_slug/i, "mood"],
    [/categories|p_categories|category_slug|\bcat\b/i, "category"],
    [/sampleTypes|sample_types|p_sample_types|sample_type_slug|\btype\b/i, "sample type"],
    [/bpmMin|bpm_min|p_bpm_min|bpm\s*>=/i, "BPM minimum"],
    [/bpmMax|bpm_max|p_bpm_max|bpm\s*<=/i, "BPM maximum"],
    [/musicalKey|musical_key|p_musical_key|\bkey\b/i, "musical key"],
    [/loopable|p_loopable/i, "loopable"],
    [/featuredOnly|featured_only|p_featured_only|featured/i, "featured-only"],
    [/albumId|album_id|p_album_id|album_samples/i, "album"],
  ]) {
    assertContains(source, pattern, `search must implement the ${label} filter`);
  }

  assertContains(source, /mood[\s\S]{0,240}(?:any\(|\.in\(|exists|OR|some\()|sample_moods[\s\S]{0,240}(?:any\(|\.in\(|exists|OR)/i, "multiple mood filters must use OR semantics");
  assertContains(source, /bpm[\s\S]{0,240}(?:is\s+null|!=\s*null|not\(["']bpm["']|exclude|null)/i, "BPM filters must exclude null BPM rows when a range is active");
  assertContains(source, /musical_key[\s\S]{0,240}(?:is\s+null|!=\s*null|not\(["']musical_key["']|exclude|null)|musicalKey[\s\S]{0,240}(?:null|exclude)/i, "key filter must exclude null key rows");
  assertContains(source, /loopable[\s\S]{0,240}sample_type|sample_type[\s\S]{0,240}loopable|Loopable filter is not identical/i, "loopable filtering must remain independent from sample type");
});

test("Phase 9 URL params parse and serialize the canonical browse search state", async () => {
  const source = await combinedSource([
    "lib/data/search.ts",
    "stores/filter-store.ts",
    "app/browse",
    "components/discovery",
    "components/library",
  ]);

  assertContains(source, /URLSearchParams|searchParams/i, "browse/search state must be read from URLSearchParams");
  assertContains(source, /parseSearch|parse.*Url|hydrateFromUrl|fromUrl|searchParams\.get/i, "URL search params must be parsed into search input");
  assertContains(source, /serializeSearch|toUrl|hrefWith|URLSearchParams[\s\S]{0,240}\.set|router\.(?:push|replace)/i, "search input must serialize back into URL params");

  for (const param of ["q", "mood", "cat", "type", "bpm_min", "bpm_max", "key", "loopable", "featured", "album", "sort", "page", "size", "seed"]) {
    assertContains(source, new RegExp(`["']${param}["']`), `canonical URL param ${param} must be parsed or serialized`);
  }

  assertContains(source, /split\(\s*["'],["']\s*\)|join\(\s*["'],["']\s*\)|comma/i, "multi-select mood/category/type URL params must parse or serialize comma-separated slugs");
  assertContains(source, /Number\(|parseInt|parseFloat|z\.coerce\.number|bounded|clamp/i, "numeric URL params must be normalized instead of trusted as strings");
  assertContains(source, /true|false|boolean|z\.coerce\.boolean/i, "boolean URL params must be normalized");
  assertContains(source, /pageSize|page_size|\bsize\b[\s\S]{0,160}(?:60|MAX)|MAX_SEARCH_PAGE_SIZE|maximum\s+60/i, "URL page size must clamp to the DISC-05 maximum of 60");
});

test("Phase 9 no-result searches are logged without breaking search responses", async () => {
  const source = await searchContractSource();
  const apiSource = await projectFile("app/api/search/route.ts");
  const searchDataSource = await projectFile("lib/data/search.ts");
  const loggingSource = [apiSource, searchDataSource].join("\n");

  assertContains(source, /export\s+(?:async\s+)?function\s+logSearchEvent\b|search_logs|logSearchEvent/i, "search layer must expose or implement logSearchEvent");
  assertContains(source, /from\(["']search_logs["']\)|insert\([\s\S]{0,240}search_logs|rpc\(["'][^"']*search.*log/i, "search logging must write to search_logs");
  assertContains(source, /result_count|resultCount|total/i, "search log payload must include result count");
  assertContains(source, /filters/i, "search log payload must include active filters");
  assertContains(source, /query/i, "search log payload must include the normalized query");
  assertContains(source, /source/i, "search log payload must include web/plugin source");
  assertContains(source, /(?:result_count|resultCount|total)[\s\S]{0,120}(?:0|===\s*0|<=\s*0)|noResult|no-result|no_results/i, "no-result search path must be represented for curation logging");
  assertContains(loggingSource, /try[\s\S]{0,800}(?:logSearchEvent|search_logs|from\(["']search_logs["']\))[\s\S]{0,800}catch|catch[\s\S]{0,400}(?:analytics|curation|log|search)/i, "logging failures must be caught so search responses still return");
});

test("Phase 9 browse/live search does not query the full sample table in client-side code", async () => {
  const browseFiles = (
    await Promise.all(
      ["app/browse", "components/discovery", "components/library", "stores/filter-store.ts"].map((relativePath) =>
        collectFilesIfPresent(relativePath, [".ts", ".tsx"]),
      ),
    )
  ).flat();
  const browseSource = (await Promise.all(browseFiles.map((file) => readFile(file, "utf8")))).join("\n");
  const searchSource = await combinedSource(["lib/data/search.ts", "app/api/search/route.ts"], [".ts", ".tsx"]);

  assertContains([browseSource, searchSource].join("\n"), /searchSamples\(|\/api\/search|fetch\([^)]*api\/search/i, "browse must use the shared search layer or /api/search route");

  for (const file of browseFiles) {
    const relativePath = path.relative(root, file);
    const source = await readFile(file, "utf8");

    if (!/["']use client["']/.test(source)) {
      continue;
    }

    assertNotContains(source, /\.from\(\s*["']samples["']\s*\)/i, `${relativePath} must not query the samples table directly`);
    assertNotContains(source, /(?:getPublishedSamples|listPublishedSamples|getPublicSamples)\(/i, `${relativePath} must not fetch a full published library and filter it locally`);
    assertNotContains(source, /sample_search_documents/i, `${relativePath} must never query sample_search_documents directly`);
    assertNotContains(source, /\.filter\([^)]*(?:query|mood|category|sampleType|bpm|musicalKey|loopable|featured)/i, `${relativePath} must not implement live search as browser-side filtering over fetched results`);
  }
});

test("Phase 9 public search never leaks original WAV data or internal search documents", async () => {
  const source = await searchContractSource();
  const publicSource = await combinedSource(["app/browse", "components/discovery", "components/library", "app/api/search/route.ts", "lib/data/search.ts"], [".ts", ".tsx"]);
  const sampleTypesSource = await projectFile("types/sample.ts");
  const apiTypesSource = await projectFile("types/api.ts");
  const publicSearchShapeSource = [
    extractSourceRange(sampleTypesSource, /export\s+type\s+SearchSampleResult\b/, /export\s+type\s+SuggestedCategory\b/),
    extractSourceRange(sampleTypesSource, /export\s+type\s+SearchResponse\b/, /export\s+type\s+SampleSummary\b/),
    extractSourceRange(apiTypesSource, /export\s+type\s+SearchSampleResult\b/, /export\s+type\s+SuggestedCategory\b/),
    extractSourceRange(apiTypesSource, /export\s+type\s+SearchResponse\b/, /export\s+type\s+SearchLogInput\b/),
    extractSourceRange(source, /returns\s+table\s*\(/i, /\)\s*language\s+sql/i),
  ].join("\n");

  assertContains(source, /\bsearchSamples\b|public\.search_samples|search_samples\s*\(/i, "asset leakage assertions must be anchored to the Phase 9 search implementation");
  assertNotContains(publicSource, /original_wav|originalAsset|originalUrl|original_bucket|original_path|signedUrl|signed_url/i, "public search and browse code must not expose original WAV asset paths or signed original URLs");
  assertNotContains(publicSearchShapeSource, /original_wav|originalAsset|originalUrl|original_bucket|original_path|signedUrl|signed_url/i, "RPC/types must not return original WAV fields");
  assertContains(source, /preview_audio|previewAsset|preview_bucket/i, "public search may return preview audio references");
  assertContains(source, /waveform_peaks|waveformAsset|waveform_bucket|waveformPeaks/i, "public search may return waveform references");
  assertContains(source, /sample_search_documents/i, "search may use sample_search_documents internally");
  assertNotContains(publicSource, /\.from\(\s*["']sample_search_documents["']\s*\)/i, "public route/UI code must not directly expose sample_search_documents as a client query surface");
  assertNotContains(publicSource, /hidden_tag_text|hiddenTagText|hidden_search_tags/i, "hidden tag values must affect ranking without appearing in public payload/UI");
});
