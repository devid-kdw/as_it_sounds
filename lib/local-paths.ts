import "server-only";

import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const AIS_LOCAL_ROOT_TOKEN = "{{AIS_LOCAL_ROOT}}";

export type AISLocalPaths = {
  root: string;
  incoming: string;
  libraryOriginals: string;
  processedPreviews: string;
  waveformPeaks: string;
  cache: string;
  flDropzone: string;
  projectCrates: string;
  exports: string;
  logs: string;
};

export type LocalPathManager = {
  getPaths: () => AISLocalPaths;
  tokenizePath: (absolutePath: string) => string;
  resolveTokenizedPath: (tokenizedPath: string) => string;
  ensureDirectories: () => Promise<void>;
  sanitizeFilename: (input: string) => string;
};

function localRoot() {
  return process.env.AIS_LOCAL_LIBRARY_DIR ?? path.join(os.homedir(), "Music", "As It Sounds");
}

function assertInsideRoot(root: string, target: string) {
  const relative = path.relative(root, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside AIS local root.");
  }
}

function rejectTraversal(input: string) {
  if (input.split(/[\\/]+/).includes("..")) {
    throw new Error("Path traversal is not allowed.");
  }
}

export function getLocalPaths(): AISLocalPaths {
  const root = path.resolve(localRoot());

  return {
    root,
    incoming: path.join(root, "incoming"),
    libraryOriginals: path.join(root, "library_originals"),
    processedPreviews: path.join(root, "processed_previews"),
    waveformPeaks: path.join(root, "waveform_peaks"),
    cache: process.env.AIS_LOCAL_CACHE_DIR ?? path.join(root, "cache"),
    flDropzone: process.env.AIS_LOCAL_DROPZONE_DIR ?? path.join(root, "fl_dropzone"),
    projectCrates: path.join(root, "project_crates"),
    exports: path.join(root, "exports"),
    logs: path.join(root, "logs"),
  };
}

export function tokenizePath(absolutePath: string) {
  const root = getLocalPaths().root;
  const target = path.resolve(absolutePath);
  assertInsideRoot(root, target);

  const relative = path.relative(root, target).split(path.sep).join("/");
  return relative ? `${AIS_LOCAL_ROOT_TOKEN}/${relative}` : AIS_LOCAL_ROOT_TOKEN;
}

export function resolveTokenizedPath(tokenizedPath: string) {
  if (!tokenizedPath.startsWith(AIS_LOCAL_ROOT_TOKEN)) {
    throw new Error("Path must start with {{AIS_LOCAL_ROOT}}.");
  }

  const suffix = tokenizedPath.slice(AIS_LOCAL_ROOT_TOKEN.length).replace(/^[/\\]/, "");
  rejectTraversal(suffix);

  const root = getLocalPaths().root;
  const resolved = path.resolve(root, suffix);
  assertInsideRoot(root, resolved);
  return resolved;
}

export async function ensureLocalDirectories() {
  const paths = getLocalPaths();
  await Promise.all(Object.values(paths).map((dir) => mkdir(dir, { recursive: true })));
}

export function sanitizeFilename(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

export function createLocalPathManager(): LocalPathManager {
  return {
    getPaths: getLocalPaths,
    tokenizePath,
    resolveTokenizedPath,
    ensureDirectories: ensureLocalDirectories,
    sanitizeFilename,
  };
}
