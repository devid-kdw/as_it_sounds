import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function collectFiles(dir, extensions, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
      continue;
    }

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

test("storage path helpers encode the Doc 03 object conventions", async () => {
  const source = await readFile(path.join(root, "lib/storage-paths.ts"), "utf8");

  for (const bucket of [
    "ais-originals",
    "ais-previews",
    "ais-waveforms",
    "ais-album-artwork",
    "ais-processing-temp",
  ]) {
    assert.match(source, new RegExp(`"${bucket}"`));
  }

  assert.match(source, /samples\/\$\{sampleId\}\/original\/\$\{sha256\}\.wav/);
  assert.match(source, /intake\/\$\{sampleId\}\/\$\{uploadSessionId\}\/source\.wav/);
  assert.match(source, /intake\/batches\/\$\{batchId\}\/\$\{sampleId\}\/source\.wav/);
  assert.match(source, /samples\/\$\{sampleId\}\/preview\/\$\{processingJobId\}\.mp3/);
  assert.match(source, /samples\/\$\{sampleId\}\/waveform\/\$\{processingJobId\}\.json/);
  assert.match(source, /albums\/\$\{albumId\}\/artwork\/\$\{assetHash\}\.jpg/);
});

test("storage abstraction is server-only and refuses public URLs for private buckets", async () => {
  const source = await readFile(path.join(root, "lib/storage.ts"), "utf8");

  assert.match(source, /import "server-only"/);
  assert.match(source, /createSignedUploadUrl/);
  assert.match(source, /createSignedDownloadUrl/);
  assert.match(source, /isPrivateStorageBucket/);
  assert.match(source, /cannot be exposed through public URL helpers/);
});

test("local Supabase config declares AIS storage bucket access", async () => {
  const source = await readFile(path.join(root, "supabase/config.toml"), "utf8");

  for (const [bucket, isPublic] of [
    ["ais-originals", false],
    ["ais-previews", true],
    ["ais-waveforms", true],
    ["ais-album-artwork", true],
    ["ais-processing-temp", false],
  ]) {
    assert.match(source, new RegExp(`\\[storage\\.buckets\\."${bucket}"\\]`));
    assert.match(source, new RegExp(`\\[storage\\.buckets\\."${bucket}"\\][\\s\\S]*?public = ${isPublic}`));
  }
});

test("Supabase Storage SDK calls stay inside the storage abstraction", async () => {
  const files = await collectFiles(root, [".ts", ".tsx"]);

  for (const file of files) {
    const relativePath = path.relative(root, file);

    if (relativePath === "lib/storage.ts") {
      continue;
    }

    const source = await readFile(file, "utf8");

    assert.doesNotMatch(source, /\.storage\s*\./, `${relativePath} calls Supabase Storage directly`);
    assert.doesNotMatch(source, /\.storage\s*\.from\s*\(/, `${relativePath} calls Supabase Storage directly`);
  }
});
