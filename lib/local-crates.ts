import "server-only";

import { constants } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AISUserSafeError } from "@/lib/errors";
import {
  AIS_LOCAL_ROOT_TOKEN,
  ensureLocalDirectories,
  getLocalPaths,
  resolveTokenizedPath,
  tokenizePath,
} from "@/lib/local-paths";
import {
  logLocalUsageEvent,
  requireLocalOwnerWorkflowEntitlement,
  type LocalUsageEventType,
} from "@/lib/local-events";
import { createSupabaseAdminClient, type PublicTableRow, type SupabaseDatabaseClient } from "@/lib/supabase/admin";

const CRATE_MANIFEST_FILENAME = "crate.json";
const ACTIVE_CRATE_FILENAME = ".active-crate.json";
const PROJECT_CRATE_SCHEMA_VERSION = 1;
const SAFE_CRATE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const STATUS_RANK: Record<ProjectCrateSampleStatus, number> = {
  considered: 0,
  exported: 1,
  used: 2,
};

export type ProjectCrateSampleStatus = "considered" | "exported" | "used";
export type ProjectCrateSyncAction =
  | "create_crate"
  | "select_active"
  | "create_or_select"
  | "add_sample"
  | "mark_used"
  | "sync_exported_path"
  | "sync_exported_paths";

export type ProjectCrateSampleEntry = {
  sample_id: string;
  poetic_name: string | null;
  status: ProjectCrateSampleStatus;
  exported_path: string | null;
  exported_paths: string[];
  source_collection_id: string | null;
  source_collection_name: string | null;
  first_added_at: string;
  last_updated_at: string;
  used_in_project: boolean;
  notes: string | null;
};

export type ProjectCrateManifest = {
  schema_version: 1;
  project_name: string;
  daw: string;
  created_at: string;
  updated_at: string;
  active: boolean;
  selected_at: string | null;
  crate_path: string;
  exports_path: string;
  considered_samples_path: string;
  used_samples_path: string;
  samples: Record<string, ProjectCrateSampleEntry>;
};

export type ProjectCrateSampleInput = {
  sampleId?: string | null;
  sample_id?: string | null;
  poeticName?: string | null;
  poetic_name?: string | null;
  status?: ProjectCrateSampleStatus | null;
  exportedPath?: string | null;
  exported_path?: string | null;
  exportedPathTokenized?: string | null;
  exportedPathsTokenized?: string[];
  sourceCollectionId?: string | null;
  source_collection_id?: string | null;
  sourceCollectionName?: string | null;
  source_collection_name?: string | null;
  notes?: string | null;
};

export type ProjectCrateSyncInput = {
  projectName?: string | null;
  crateName?: string | null;
  action?: ProjectCrateSyncAction;
  daw?: string | null;
  sample?: ProjectCrateSampleInput | null;
  sampleId?: string | null;
  sample_id?: string | null;
  poeticName?: string | null;
  poetic_name?: string | null;
  status?: ProjectCrateSampleStatus | null;
  exportedPath?: string | null;
  exported_path?: string | null;
  exportedPathTokenized?: string | null;
  exportedPathsTokenized?: string[];
  sourceCollectionId?: string | null;
  source_collection_id?: string | null;
  sourceCollectionName?: string | null;
  source_collection_name?: string | null;
  notes?: string | null;
};

export type ProjectCrateSyncResult = {
  projectName: string;
  crateTokenizedPath: string;
  manifestTokenizedPath: string;
  tokenizedCratePath: string;
  tokenizedManifestPath: string;
  tokenizedExportsPath: string;
  activeProjectName: string;
  active: boolean;
  action: ProjectCrateSyncAction;
  entry: ProjectCrateSampleEntry | null;
  manifest: ProjectCrateManifest;
  crate: ProjectCrateManifest;
  missingExportedPaths: string[];
};

export type ActiveProjectCrateResult = {
  activeProjectName: string | null;
  projectName?: string | null;
  crateTokenizedPath?: string | null;
  manifestTokenizedPath?: string | null;
};

type SampleRow = Pick<PublicTableRow<"samples">, "id" | "poetic_name" | "status" | "archived_at">;

type ProjectCratePaths = {
  crateDir: string;
  manifestPath: string;
  notesPath: string;
  exportsDir: string;
  consideredSamplesDir: string;
  usedSamplesDir: string;
};

export async function syncProjectCrate(input: ProjectCrateSyncInput): Promise<ProjectCrateSyncResult> {
  const entitlement = await requireLocalOwnerWorkflowEntitlement();
  const now = new Date().toISOString();
  const projectName = validateProjectCrateName(input.projectName ?? input.crateName ?? "");
  const sampleInput = flattenSampleInput(input);
  const action = input.action ?? (sampleInput.sampleId ? "add_sample" : "create_crate");
  const cratePaths = getProjectCratePaths(projectName);

  await ensureProjectCrateDirectories(cratePaths);

  const existingManifest = await readProjectCrateManifest(cratePaths.manifestPath);
  const manifest = normalizeProjectCrateManifest(existingManifest, projectName, input.daw, cratePaths, now);
  let entry: ProjectCrateSampleEntry | null = null;

  if (isSampleAction(action)) {
    entry = await upsertProjectCrateSample(manifest, action, sampleInput, now);
  }

  manifest.active = true;
  manifest.selected_at = now;
  manifest.updated_at = now;

  await writeProjectCrateManifestAtomically(cratePaths.manifestPath, manifest);
  await writeActiveProjectCrate(projectName, cratePaths, now);

  if (entry) {
    await logLocalUsageEvent(
      {
        type: eventForCrateAction(action, entry),
        sampleId: entry.sample_id,
        projectName,
        sourceSurface: "local-crate",
        tokenizedPath: entry.exported_path,
        metadata: {
          status: entry.status,
          exported_paths: entry.exported_paths,
          source_collection_id: entry.source_collection_id,
          source_collection_name: entry.source_collection_name,
        },
      },
      entitlement,
    );
  }

  const missingExportedPaths = await findMissingExportedPaths(entry);

  return {
    projectName,
    crateTokenizedPath: manifest.crate_path,
    manifestTokenizedPath: tokenizePath(cratePaths.manifestPath),
    tokenizedCratePath: manifest.crate_path,
    tokenizedManifestPath: tokenizePath(cratePaths.manifestPath),
    tokenizedExportsPath: manifest.exports_path,
    activeProjectName: projectName,
    active: manifest.active,
    action,
    entry,
    manifest,
    crate: manifest,
    missingExportedPaths,
  };
}

export async function getActiveProjectCrate(): Promise<ActiveProjectCrateResult> {
  await requireLocalOwnerWorkflowEntitlement();

  try {
    const parsed = JSON.parse(await readFile(activeCratePath(), "utf8")) as Partial<ActiveProjectCrateResult>;
    const activeProjectName =
      typeof parsed.activeProjectName === "string"
        ? validateProjectCrateName(parsed.activeProjectName)
        : typeof parsed.projectName === "string"
          ? validateProjectCrateName(parsed.projectName)
          : null;

    if (!activeProjectName) {
      return { activeProjectName: null };
    }

    return {
      activeProjectName,
      projectName: activeProjectName,
      crateTokenizedPath: parsed.crateTokenizedPath ?? null,
      manifestTokenizedPath: parsed.manifestTokenizedPath ?? null,
    };
  } catch (error) {
    if (isNodeError(error) && error.code !== "ENOENT") {
      throw new AISUserSafeError("Unable to read active project crate.", "active_project_crate_read_failed", 500);
    }

    return { activeProjectName: null };
  }
}

export async function setActiveProjectCrate(projectName: string): Promise<ActiveProjectCrateResult> {
  await requireLocalOwnerWorkflowEntitlement();
  const normalizedProjectName = validateProjectCrateName(projectName);
  const cratePaths = getProjectCratePaths(normalizedProjectName);
  const now = new Date().toISOString();

  await ensureProjectCrateDirectories(cratePaths);

  const existingManifest = await readProjectCrateManifest(cratePaths.manifestPath);
  const manifest = normalizeProjectCrateManifest(existingManifest, normalizedProjectName, null, cratePaths, now);
  manifest.active = true;
  manifest.selected_at = now;
  manifest.updated_at = now;

  await writeProjectCrateManifestAtomically(cratePaths.manifestPath, manifest);
  await writeActiveProjectCrate(normalizedProjectName, cratePaths, now);

  return {
    activeProjectName: normalizedProjectName,
    projectName: normalizedProjectName,
    crateTokenizedPath: manifest.crate_path,
    manifestTokenizedPath: tokenizePath(cratePaths.manifestPath),
  };
}

export function validateProjectCrateName(projectName: string) {
  const trimmed = projectName.trim();

  if (!SAFE_CRATE_NAME_PATTERN.test(trimmed)) {
    throw new AISUserSafeError(
      "Project crate names may only use letters, numbers, underscores, and hyphens.",
      "invalid_project_crate_name",
      400,
    );
  }

  return trimmed;
}

function isSampleAction(action: ProjectCrateSyncAction) {
  return (
    action === "add_sample" ||
    action === "mark_used" ||
    action === "sync_exported_path" ||
    action === "sync_exported_paths"
  );
}

function flattenSampleInput(input: ProjectCrateSyncInput): ProjectCrateSampleInput {
  const nested = input.sample ?? {};
  const flattened: ProjectCrateSampleInput = {
    ...nested,
    sampleId: input.sampleId ?? input.sample_id ?? nested.sampleId ?? nested.sample_id ?? null,
    poeticName: input.poeticName ?? input.poetic_name ?? nested.poeticName ?? nested.poetic_name ?? null,
    status: input.status ?? nested.status ?? null,
    exportedPath:
      input.exportedPath ??
      input.exported_path ??
      input.exportedPathTokenized ??
      nested.exportedPath ??
      nested.exported_path ??
      nested.exportedPathTokenized ??
      null,
    exportedPathTokenized: input.exportedPathTokenized ?? nested.exportedPathTokenized ?? null,
    exportedPathsTokenized: input.exportedPathsTokenized ?? nested.exportedPathsTokenized ?? [],
    sourceCollectionId:
      input.sourceCollectionId ??
      input.source_collection_id ??
      nested.sourceCollectionId ??
      nested.source_collection_id ??
      null,
    sourceCollectionName:
      input.sourceCollectionName ??
      input.source_collection_name ??
      nested.sourceCollectionName ??
      nested.source_collection_name ??
      null,
  };

  if (Object.prototype.hasOwnProperty.call(input, "notes")) {
    flattened.notes = input.notes ?? null;
  } else if (Object.prototype.hasOwnProperty.call(nested, "notes")) {
    flattened.notes = nested.notes ?? null;
  }

  return flattened;
}

function getProjectCratePaths(projectName: string): ProjectCratePaths {
  const crateDir = path.join(getLocalPaths().projectCrates, projectName);

  return {
    crateDir,
    manifestPath: path.join(crateDir, CRATE_MANIFEST_FILENAME),
    notesPath: path.join(crateDir, "notes.md"),
    exportsDir: path.join(crateDir, "exports"),
    consideredSamplesDir: path.join(crateDir, "considered_samples"),
    usedSamplesDir: path.join(crateDir, "used_samples"),
  };
}

async function ensureProjectCrateDirectories(cratePaths: ProjectCratePaths) {
  await ensureLocalDirectories();
  await Promise.all([
    mkdir(cratePaths.crateDir, { recursive: true }),
    mkdir(cratePaths.exportsDir, { recursive: true }),
    mkdir(cratePaths.consideredSamplesDir, { recursive: true }),
    mkdir(cratePaths.usedSamplesDir, { recursive: true }),
  ]);

  await writeFile(cratePaths.notesPath, "", { flag: "wx" }).catch((error: unknown) => {
    if (!isNodeError(error) || error.code !== "EEXIST") {
      throw error;
    }
  });
}

async function readProjectCrateManifest(manifestPath: string) {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as Partial<ProjectCrateManifest>;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw new AISUserSafeError("Project crate manifest is not valid JSON.", "invalid_project_crate_manifest", 400);
  }
}

function normalizeProjectCrateManifest(
  manifest: Partial<ProjectCrateManifest> | null,
  projectName: string,
  daw: string | null | undefined,
  cratePaths: ProjectCratePaths,
  now: string,
): ProjectCrateManifest {
  return {
    schema_version: PROJECT_CRATE_SCHEMA_VERSION,
    project_name: projectName,
    daw: normalizeText(daw, 80) ?? normalizeText(manifest?.daw, 80) ?? "FL Studio",
    created_at: typeof manifest?.created_at === "string" ? manifest.created_at : now,
    updated_at: typeof manifest?.updated_at === "string" ? manifest.updated_at : now,
    active: Boolean(manifest?.active),
    selected_at: typeof manifest?.selected_at === "string" ? manifest.selected_at : null,
    crate_path: tokenizePath(cratePaths.crateDir),
    exports_path: tokenizePath(cratePaths.exportsDir),
    considered_samples_path: tokenizePath(cratePaths.consideredSamplesDir),
    used_samples_path: tokenizePath(cratePaths.usedSamplesDir),
    samples: normalizeSampleEntries(manifest?.samples, now),
  };
}

function normalizeSampleEntries(samples: unknown, now: string): Record<string, ProjectCrateSampleEntry> {
  const rawEntries = Array.isArray(samples)
    ? samples
    : samples && typeof samples === "object"
      ? Object.values(samples as Record<string, unknown>)
      : [];
  const normalized: Record<string, ProjectCrateSampleEntry> = {};

  for (const rawEntry of rawEntries) {
    const entry = rawEntry as Partial<ProjectCrateSampleEntry>;
    const sampleId = normalizeUuid(typeof entry.sample_id === "string" ? entry.sample_id : null, "Sample ID");

    if (!sampleId) {
      continue;
    }

    const firstAddedAt = typeof entry.first_added_at === "string" ? entry.first_added_at : now;
    const exportedPaths = normalizeExportedPaths([
      ...(Array.isArray(entry.exported_paths) ? entry.exported_paths : []),
      ...(typeof entry.exported_path === "string" ? [entry.exported_path] : []),
    ]);
    const status = normalizeStatus(entry.status, exportedPaths.length > 0);

    normalized[sampleId] = {
      sample_id: sampleId,
      poetic_name: normalizeText(entry.poetic_name, 180),
      status,
      exported_path: exportedPaths.at(-1) ?? null,
      exported_paths: exportedPaths,
      source_collection_id: normalizeUuid(entry.source_collection_id ?? null, "Source collection ID"),
      source_collection_name: normalizeText(entry.source_collection_name, 120),
      first_added_at: firstAddedAt,
      last_updated_at: typeof entry.last_updated_at === "string" ? entry.last_updated_at : firstAddedAt,
      used_in_project: entry.used_in_project === true || status === "used",
      notes: normalizeText(entry.notes, 1000),
    };
  }

  return normalized;
}

async function upsertProjectCrateSample(
  manifest: ProjectCrateManifest,
  action: Extract<ProjectCrateSyncAction, "add_sample" | "mark_used" | "sync_exported_path" | "sync_exported_paths">,
  input: ProjectCrateSampleInput,
  now: string,
) {
  const sampleId = normalizeUuid(input.sampleId ?? null, "Sample ID");

  if (!sampleId) {
    throw new AISUserSafeError("Sample ID is required for crate sample sync.", "invalid_project_crate_sample", 400);
  }

  const sample = await loadPublishedSample(sampleId, createSupabaseAdminClient());
  const existing = manifest.samples[sampleId] ?? null;
  const exportedPaths = normalizeExportedPaths([
    ...(existing?.exported_paths ?? []),
    ...(input.exportedPathsTokenized ?? []),
    ...(input.exportedPath ? [input.exportedPath] : []),
    ...(input.exportedPathTokenized ? [input.exportedPathTokenized] : []),
  ]);
  const requestedStatus = statusForAction(action, input.status ?? null, exportedPaths.length > 0);
  const status = existing ? strongerStatus(existing.status, requestedStatus) : requestedStatus;
  const notes = Object.prototype.hasOwnProperty.call(input, "notes")
    ? normalizeText(input.notes, 1000)
    : existing?.notes ?? null;

  const entry: ProjectCrateSampleEntry = {
    sample_id: sample.id,
    poetic_name: normalizeText(input.poeticName ?? input.poetic_name, 180) ?? sample.poetic_name,
    status,
    exported_path: exportedPaths.at(-1) ?? null,
    exported_paths: exportedPaths,
    source_collection_id:
      normalizeUuid(input.sourceCollectionId ?? input.source_collection_id ?? null, "Source collection ID") ??
      existing?.source_collection_id ??
      null,
    source_collection_name:
      normalizeText(input.sourceCollectionName ?? input.source_collection_name, 120) ??
      existing?.source_collection_name ??
      null,
    first_added_at: existing?.first_added_at ?? now,
    last_updated_at: now,
    used_in_project: status === "used",
    notes,
  };

  manifest.samples[sampleId] = entry;
  return entry;
}

async function loadPublishedSample(sampleId: string, supabase: SupabaseDatabaseClient): Promise<SampleRow> {
  const { data, error } = await supabase
    .from("samples")
    .select("id,poetic_name,status,archived_at")
    .eq("id", sampleId)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load sample for project crate sync.", "project_crate_sample_lookup_failed", 500);
  }

  if (!data || data.status !== "published" || data.archived_at) {
    throw new AISUserSafeError("Sample was not found.", "sample_not_found", 404);
  }

  return data as SampleRow;
}

function eventForCrateAction(action: ProjectCrateSyncAction, entry: ProjectCrateSampleEntry): LocalUsageEventType {
  if (action === "mark_used" || entry.status === "used") {
    return "sample_marked_used";
  }

  return "sample_added_to_project_crate";
}

function statusForAction(
  action: ProjectCrateSyncAction,
  status: ProjectCrateSampleStatus | null,
  hasExportedPath: boolean,
): ProjectCrateSampleStatus {
  if (action === "mark_used") {
    return "used";
  }

  if (action === "sync_exported_path" || action === "sync_exported_paths") {
    return hasExportedPath ? "exported" : "considered";
  }

  return status ?? (hasExportedPath ? "exported" : "considered");
}

function strongerStatus(left: ProjectCrateSampleStatus, right: ProjectCrateSampleStatus): ProjectCrateSampleStatus {
  return STATUS_RANK[right] > STATUS_RANK[left] ? right : left;
}

function normalizeStatus(status: unknown, hasExportedPath: boolean): ProjectCrateSampleStatus {
  if (status === "used" || status === "exported") {
    return status;
  }

  return hasExportedPath ? "exported" : "considered";
}

function normalizeExportedPaths(exportedPaths: string[]) {
  const deduped = new Set<string>();

  for (const exportedPath of exportedPaths) {
    if (!exportedPath) {
      continue;
    }

    deduped.add(normalizeTokenizedLocalPath(exportedPath));
  }

  return [...deduped];
}

function normalizeTokenizedLocalPath(localPath: string) {
  const trimmed = localPath.trim();

  try {
    if (trimmed.startsWith(AIS_LOCAL_ROOT_TOKEN)) {
      return tokenizePath(resolveTokenizedPath(trimmed));
    }

    if (path.isAbsolute(trimmed)) {
      return tokenizePath(trimmed);
    }
  } catch {
    throw new AISUserSafeError("Exported crate paths must be inside the AIS local root.", "invalid_local_crate_path", 400);
  }

  throw new AISUserSafeError("Exported crate paths must be tokenized local paths.", "invalid_local_crate_path", 400);
}

async function findMissingExportedPaths(entry: ProjectCrateSampleEntry | null) {
  if (!entry) {
    return [];
  }

  const missing: string[] = [];

  for (const tokenizedPath of entry.exported_paths) {
    try {
      await access(resolveTokenizedPath(tokenizedPath), constants.F_OK);
    } catch {
      missing.push(tokenizedPath);
    }
  }

  return missing;
}

async function writeProjectCrateManifestAtomically(manifestPath: string, manifest: ProjectCrateManifest) {
  await writeJsonAtomically(manifestPath, manifest);
}

async function writeActiveProjectCrate(projectName: string, cratePaths: ProjectCratePaths, now: string) {
  await writeJsonAtomically(activeCratePath(), {
    activeProjectName: projectName,
    projectName,
    selectedAt: now,
    crateTokenizedPath: tokenizePath(cratePaths.crateDir),
    manifestTokenizedPath: tokenizePath(cratePaths.manifestPath),
  });
}

async function writeJsonAtomically(targetPath: string, payload: unknown) {
  const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);

  try {
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function activeCratePath() {
  return path.join(getLocalPaths().projectCrates, ACTIVE_CRATE_FILENAME);
}

function normalizeUuid(value: string | null, label: string) {
  if (value === null || value === "") {
    return null;
  }

  const trimmed = value.trim();

  if (!UUID_PATTERN.test(trimmed)) {
    throw new AISUserSafeError(`${label} must be a valid UUID.`, "invalid_uuid", 400);
  }

  return trimmed.toLowerCase();
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
