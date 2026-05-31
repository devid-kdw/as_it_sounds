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

test("app shell has AIS copy instead of stock scaffold content", async () => {
  const source = await readFile(path.join(root, "app/page.tsx"), "utf8");

  assert.match(source, /sound samples named the way they feel/i);
  assert.doesNotMatch(source, /Deploy Now|Next\.js logo|To get started/);
});

test("client modules do not reference server-only secret names", async () => {
  const files = await collectFiles(root, [".ts", ".tsx"]);
  const forbidden = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "AUDIO_WORKER_API_KEY",
    "R2_SECRET_ACCESS_KEY",
  ];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const isClientModule = source.trimStart().startsWith('"use client"') || source.trimStart().startsWith("'use client'");

    if (!isClientModule) {
      continue;
    }

    for (const secretName of forbidden) {
      assert.doesNotMatch(source, new RegExp(secretName), `${path.relative(root, file)} references ${secretName}`);
    }
  }
});

test("AIS Tailwind tokens are available in global CSS", async () => {
  const source = await readFile(path.join(root, "app/globals.css"), "utf8");

  for (const token of ["--ais-bg", "--ais-surface", "--ais-amber", "--color-ais-bg", "--font-ais-serif"]) {
    assert.match(source, new RegExp(token));
  }
});
