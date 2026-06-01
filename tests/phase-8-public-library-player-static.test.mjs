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

async function combinedSource(relativePaths, extensions = [".ts", ".tsx"]) {
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

function extractTypeBlock(source, typeName) {
  const match = source.match(new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*\\{[\\s\\S]*?\\n\\};`));
  assert.ok(match, `types/sample.ts must export ${typeName}`);
  return match[0];
}

test("Phase 8 public sample data layer is published-only for browse and detail", async () => {
  await assertProjectFile("lib/data/samples.ts", "public browse and sample detail queries");
  const source = await projectFile("lib/data/samples.ts");

  assertContains(source, /getPublishedSamples|listPublishedSamples|getPublicSamples/i, "browse data layer must expose a published sample list function");
  assertContains(source, /getSampleByPoeticName|getPublishedSampleByPoeticName/i, "sample detail data layer must expose poetic-name lookup");
  assertContains(source, /\.from\(["']samples["']\)/, "public sample data must query the samples table");
  assertContains(source, /\.eq\(\s*["']status["']\s*,\s*["']published["']\s*\)/, "public sample queries must hard-filter samples.status = 'published'");
  assertContains(source, /\.eq\(\s*["']poetic_name["']\s*,\s*poeticName\s*\)|\.eq\(\s*["']poetic_name["']\s*,/i, "sample detail lookup must resolve by poetic_name");

  for (const status of ["unpublished", "failed", "processing", "needs_review", "draft", "archived"]) {
    assertNotContains(
      source,
      new RegExp(`\\.in\\(\\s*["']status["'][\\s\\S]{0,160}["']${status}["']`, "i"),
      `public sample queries must not include ${status} in visible status sets`,
    );
  }
});

test("Phase 8 public sample payloads expose preview and waveform only, never original WAV storage details", async () => {
  await assertProjectFile("types/sample.ts", "public sample card/detail payloads");
  await assertProjectFile("lib/data/sample-assets.ts", "safe public asset mapping");
  const typeSource = await projectFile("types/sample.ts");
  const assetSource = await projectFile("lib/data/sample-assets.ts");
  const cardType = extractTypeBlock(typeSource, "SampleCardView");
  const detailType = typeSource.match(/export\s+type\s+SampleDetailView[\s\S]*?;/)?.[0] ?? "";
  const assetUrlType = extractTypeBlock(typeSource, "PublicSampleAssetUrls");
  const publicPayloadTypes = [cardType, detailType, assetUrlType].join("\n");

  assertContains(publicPayloadTypes, /previewAssetUrl/i, "public payloads must include generated preview asset URL");
  assertContains(publicPayloadTypes, /waveformPeaksUrl/i, "public payloads must include precomputed waveform peaks URL");
  assertNotContains(publicPayloadTypes, /original|original_wav|bucket|object_?path|signedUrl|signed_url/i, "public payload types must not expose original WAV, bucket/path, or signed URL fields");

  assertContains(assetSource, /preview_audio/i, "safe asset mapper must allow preview_audio");
  assertContains(assetSource, /waveform_peaks/i, "safe asset mapper must allow waveform_peaks");
  assertContains(assetSource, /\.in\(\s*["']kind["'][\s\S]{0,160}PUBLIC_SAMPLE_ASSET_KINDS|\bPUBLIC_SAMPLE_ASSET_KINDS\b[\s\S]{0,220}\.in\(\s*["']kind["']/i, "safe asset mapper must query only whitelisted public asset kinds");
  assertNotContains(assetSource, /createSignedUrl|signedUrl|signed_url/i, "public preview/waveform mapping must not create signed original URLs");
  assertNotContains(assetSource, /PUBLIC_SAMPLE_ASSET_KINDS[\s\S]{0,180}original_wav/i, "public asset kind whitelist must not include original_wav");
});

test("Phase 8 public sample detail route uses canonical poeticName and hides unpublished samples", async () => {
  await assertProjectFile("app/samples/[poeticName]/page.tsx", "canonical public sample detail page");
  await assertProjectFile("app/samples/[poeticName]/not-found.tsx", "unavailable public sample state");
  const pageSource = await projectFile("app/samples/[poeticName]/page.tsx");
  const dataSource = await projectFile("lib/data/samples.ts");
  const source = [pageSource, dataSource].join("\n");

  assertContains(pageSource, /params[\s\S]{0,180}poeticName/i, "detail page must read the poeticName route param");
  assertContains(source, /getSampleByPoeticName|getPublishedSampleByPoeticName/i, "detail page must use the poetic-name data lookup");
  assertContains(dataSource, /\.eq\(\s*["']poetic_name["']\s*,/i, "detail data lookup must query poetic_name");
  assertContains(dataSource, /\.eq\(\s*["']status["']\s*,\s*["']published["']\s*\)/, "detail data lookup must reject unpublished, archived, failed, draft, processing, and review samples");
  assertContains(pageSource, /notFound\(\)|not-found|NotFoundState/i, "detail page must render not found/unavailable state when no published sample exists");
});

test("Phase 8 waveform code fetches precomputed peaks JSON and renders visible nonblank and missing states", async () => {
  const source = await combinedSource([
    "components/player",
    "components/library",
    "components/discovery",
    "stores/player-store.ts",
  ]);

  assertContains(source, /WaveformPeaks/i, "waveform code must define or consume a WaveformPeaks contract");
  assertContains(source, /fetchWaveformPeaks/i, "waveform code must parse peaks through a helper instead of inline ad hoc parsing");
  assertContains(source, /fetch\([\s\S]{0,180}\.json\(\)|\.json\(\)[\s\S]{0,180}peaks/i, "waveform helper must fetch and parse peaks JSON");
  assertContains(source, /peaks[\s\S]{0,160}(?:Array\.isArray|length|number\[\]|number\[\]\[\])/i, "waveform helper must validate that parsed peaks contain drawable samples");
  assertContains(source, /<canvas\b|<svg\b|WaveSurfer\.create|wavesurfer\.js/i, "waveform component must render a real waveform surface");
  assertContains(source, /missing waveform|waveform.*missing|waveform unavailable|unable to load waveform|invalid waveform|waveform.*error|waveform.*could not be read/i, "waveform failures must render a visible missing/error state");
  assertNotContains(source, /decodeAudioData|createBufferSource|arrayBuffer\(\)[\s\S]{0,240}peaks/i, "public waveform rendering must not decode audio in the browser to derive peaks");
});

test("Phase 8 player store and shell replace the active sample and keep playback single-authority", async () => {
  await assertProjectFile("stores/player-store.ts", "global player authority");
  await assertProjectFile("components/player/persistent-player-shell.tsx", "persistent player UI");
  const storeSource = await projectFile("stores/player-store.ts");
  const playerSource = await combinedSource(["components/player"]);
  const source = [storeSource, playerSource].join("\n");

  assertContains(storeSource, /activeSampleId|activePreviewUrl|activePeaksUrl|sourceSurface/i, "player store must own active sample, preview, waveform, and source surface state");
  assertContains(storeSource, /setActiveSample[\s\S]{0,500}currentTime\s*:\s*0/i, "starting a new sample must reset playback position");
  assertContains(storeSource, /setActiveSample[\s\S]{0,500}activePreviewUrl\s*:/i, "starting a new sample must replace the active preview URL");
  assertContains(storeSource, /setActiveSample[\s\S]{0,600}recentlyPlayedIds/i, "player store must update recently played IDs for browse/similar exclusion");
  assertContains(playerSource, /<audio\b/i, "persistent player must mount the single audio element path");
  assertContains(playerSource, /activePreviewUrl/i, "persistent player must load audio from the generated preview URL");
  assertContains(playerSource, /\.pause\(\)|\.load\(\)|src\s*=\s*["']["']/i, "persistent player must stop or reload the previous stream when the active sample changes");
  assertContains(source, /setLooping|loop\b/i, "player must expose loop state for loopable samples");
  assertContains(source, /setVolume|volume/i, "player must expose volume control");
  assertNotContains(playerSource, /original_wav|originalAsset|originalUrl|signedUrl|signed_url/i, "public player must never use original WAV or signed original URLs");
});

test("Phase 8 preview and public UI use preview assets only", async () => {
  const publicSource = await combinedSource([
    "app/page.tsx",
    "app/browse",
    "app/samples",
    "components/discovery",
    "components/player",
    "types/sample.ts",
  ]);

  assertContains(publicSource, /previewAssetUrl|activePreviewUrl|previewUrl/i, "public UI must thread generated preview URLs into playback");
  assertContains(publicSource, /waveformPeaksUrl|activePeaksUrl|peaksUrl/i, "public UI must thread precomputed waveform peaks into cards/detail/player");
  assertNotContains(publicSource, /original_wav|originalAsset|originalUrl|original_bucket|original_path|signedUrl|signed_url/i, "public UI must not expose original WAV asset paths or signed original URLs");
});

test("Phase 8 play event route accepts POST without making logging failure break playback", async () => {
  await assertProjectFile("app/api/play-events/route.ts", "play event capture scaffold");
  const source = await projectFile("app/api/play-events/route.ts");

  assertContains(source, /export\s+async\s+function\s+POST\b/, "play event route must expose POST");
  assertContains(source, /NextResponse\.json|Response\.json|new Response/i, "play event route must return a response");
  assertContains(source, /try[\s\S]{0,500}catch|catch[\s\S]{0,240}(?:ok|accepted|204|202|200)/i, "play event route must catch logging failures");
  assertContains(source, /sampleId|sample_id|eventType|event_type|sourceSurface|source_surface/i, "play event route must accept minimal playback event context");
  assertNotContains(source, /throw\s+(?:error|new Error)[\s\S]{0,180}(?:insert|play|event|analytics)|logging failure/i, "play event logging failures must not bubble into playback failures");
});

test("Phase 8 route-level loading, empty, and error states render for browse and sample detail", async () => {
  const requiredFiles = [
    "app/browse/page.tsx",
    "app/browse/loading.tsx",
    "app/browse/error.tsx",
    "app/samples/[poeticName]/page.tsx",
    "app/samples/[poeticName]/loading.tsx",
    "app/samples/[poeticName]/error.tsx",
    "app/samples/[poeticName]/not-found.tsx",
  ];

  for (const filePath of requiredFiles) {
    await assertProjectFile(filePath, "Phase 8 public route states");
  }

  const source = await Promise.all(requiredFiles.map((filePath) => projectFile(filePath)));
  const joined = source.join("\n");

  assertContains(joined, /LoadingState|skeleton|loading/i, "public routes must render loading states");
  assertContains(joined, /ErrorState|error/i, "public routes must render error states");
  assertContains(joined, /EmptyState|No published|No samples|no results|empty/i, "public routes must render empty states");
  assertContains(joined, /NotFoundState|notFound\(\)|not found|unavailable/i, "sample detail must render unavailable/not-found state");
  assertNotContains(joined, /console\.error\([^)]*(?:secret|signed|bucket|object_path)/i, "route errors must not leak storage details");
});

test("Phase 8 playback controls and waveform seeking are keyboard-accessible", async () => {
  const source = await combinedSource(["components/player", "components/discovery", "app/browse", "app/samples"]);

  assertContains(source, /<button\b[\s\S]{0,240}aria-label|aria-label[\s\S]{0,240}<button\b/i, "play, pause, favorite, collection, and download controls need accessible button labels");
  assertContains(source, /play|pause/i, "playback controls must expose play/pause actions");
  assertContains(source, /type=["']range["'][\s\S]{0,240}aria-label|aria-label[\s\S]{0,240}type=["']range["']/i, "seek/scrub and volume controls must use keyboard-accessible labelled range inputs");
  assertContains(source, /onKeyDown|role=["']slider["']|type=["']range["']/i, "waveform click-to-seek must have a keyboard-accessible alternative");
  assertNotContains(source, /<button\b[^>]*aria-hidden=["']true["'][^>]*>/i, "playback control buttons must not be hidden from assistive technology");
});
