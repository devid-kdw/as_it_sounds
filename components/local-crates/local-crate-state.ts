"use client";

import type { LocalCrateSampleStatus, LocalProjectCrateEntry } from "@/types/api";

const STORAGE_KEY = "ais.localProjectCrates.v1";
const UPDATE_EVENT = "ais:local-crates-updated";

export type LocalCrateSummary = {
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalCrateSampleInput = {
  sampleId: string;
  poeticName: string;
  displayTitle: string;
  bpm: number | null;
  musicalKey: string | null;
  exportedPath?: string | null;
};

export type LocalCrateClientState = {
  activeCrateName: string | null;
  crates: LocalCrateSummary[];
  entriesByCrate: Record<string, LocalProjectCrateEntry[]>;
};

export type LocalCrateUpsertInput = {
  crateName: string;
  sample: LocalCrateSampleInput;
  status: LocalCrateSampleStatus;
  exportedPath?: string | null;
};

const emptyState: LocalCrateClientState = {
  activeCrateName: null,
  crates: [],
  entriesByCrate: {},
};

export function readLocalCrateState(): LocalCrateClientState {
  if (typeof window === "undefined") {
    return emptyState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyState;
    }

    return normalizeState(JSON.parse(raw));
  } catch {
    return emptyState;
  }
}

export function writeLocalCrateState(nextState: LocalCrateClientState) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeState(nextState);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

export function subscribeToLocalCrates(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener(UPDATE_EVENT, listener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(UPDATE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function createLocalCrate(name: string) {
  const safeName = normalizeCrateName(name);
  const state = readLocalCrateState();
  const now = new Date().toISOString();
  const existing = state.crates.find((crate) => crate.name === safeName);
  const crates = existing
    ? state.crates.map((crate) => (crate.name === safeName ? { ...crate, updatedAt: now } : crate))
    : [{ name: safeName, createdAt: now, updatedAt: now }, ...state.crates];

  writeLocalCrateState({
    ...state,
    activeCrateName: safeName,
    crates,
    entriesByCrate: {
      ...state.entriesByCrate,
      [safeName]: state.entriesByCrate[safeName] ?? [],
    },
  });

  return safeName;
}

export function selectLocalCrate(name: string) {
  const state = readLocalCrateState();
  const crate = state.crates.find((item) => item.name === name);

  if (!crate) {
    return null;
  }

  writeLocalCrateState({ ...state, activeCrateName: crate.name });
  return crate.name;
}

export function upsertLocalCrateEntry(input: LocalCrateUpsertInput) {
  const state = readLocalCrateState();
  const now = new Date().toISOString();
  const crateName = createMissingCrate(input.crateName, state, now);
  const currentEntries = state.entriesByCrate[crateName] ?? [];
  const existing = currentEntries.find((entry) => entry.sampleId === input.sample.sampleId);
  const nextStatus = strongestStatus(existing?.status, input.status);
  const nextEntry: LocalProjectCrateEntry = {
    sampleId: input.sample.sampleId,
    poeticName: input.sample.poeticName,
    displayTitle: input.sample.displayTitle,
    bpm: input.sample.bpm,
    musicalKey: input.sample.musicalKey,
    status: nextStatus,
    exportedPath: input.exportedPath ?? input.sample.exportedPath ?? existing?.exportedPath ?? null,
    sourceCollectionId: existing?.sourceCollectionId ?? null,
    sourceCollectionName: existing?.sourceCollectionName ?? null,
    firstAddedAt: existing?.firstAddedAt ?? now,
    lastUpdatedAt: now,
    usedInProject: nextStatus === "used",
    notes: existing?.notes ?? null,
  };

  const nextEntries = existing
    ? currentEntries.map((entry) => (entry.sampleId === nextEntry.sampleId ? nextEntry : entry))
    : [nextEntry, ...currentEntries];

  writeLocalCrateState({
    ...state,
    activeCrateName: crateName,
    crates: state.crates.map((crate) => (crate.name === crateName ? { ...crate, updatedAt: now } : crate)),
    entriesByCrate: {
      ...state.entriesByCrate,
      [crateName]: nextEntries,
    },
  });

  return nextEntry;
}

export async function syncLocalCrateEntry(input: LocalCrateUpsertInput) {
  const response = await fetch("/api/local/crate/sync", {
    body: JSON.stringify({
      projectName: input.crateName,
      action: input.status === "used" ? "mark_used" : input.status === "exported" ? "sync_exported_paths" : "add_sample",
      sample: {
        sampleId: input.sample.sampleId,
        poeticName: input.sample.poeticName,
        status: input.status,
        exportedPathTokenized: input.exportedPath ?? input.sample.exportedPath ?? null,
      },
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = await readApiJson(response);

  if (!response.ok) {
    throw new Error(apiMessage(payload, "Project Crate sync is not available yet."));
  }

  return payload;
}

export async function syncLocalCrateSelection(crateName: string) {
  const syncResponse = await fetch("/api/local/crate/sync", {
    body: JSON.stringify({ projectName: crateName, action: "create_or_select" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const syncPayload = await readApiJson(syncResponse);

  if (!syncResponse.ok) {
    throw new Error(apiMessage(syncPayload, "Project Crate selection sync is not available yet."));
  }

  return syncPayload;
}

export async function revealLocalCrate(crateName: string) {
  const syncResponse = await fetch("/api/local/crate/sync", {
    body: JSON.stringify({ projectName: crateName, action: "create_or_select" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const syncPayload = await readApiJson(syncResponse);

  if (!syncResponse.ok) {
    throw new Error(apiMessage(syncPayload, "Open crate folder is not available yet."));
  }

  const tokenizedPath = crateTokenizedPathFromPayload(syncPayload);

  if (!tokenizedPath) {
    throw new Error("Open crate folder failed: the crate route did not return a tokenized folder path.");
  }

  const revealResponse = await fetch("/api/local/path/reveal", {
    body: JSON.stringify({ tokenizedPath }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const revealPayload = await readApiJson(revealResponse);

  if (!revealResponse.ok) {
    throw new Error(apiMessage(revealPayload, "Open crate folder is not available yet."));
  }

  return revealPayload;
}

export function normalizeCrateName(name: string) {
  const safeName = name.trim().toLowerCase().replace(/\s+/g, "_");

  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(safeName)) {
    throw new Error("Use 2-63 lowercase letters, numbers, underscores, or hyphens.");
  }

  return safeName;
}

export function statusLabel(status: LocalCrateSampleStatus) {
  return status === "used" ? "used" : status === "exported" ? "exported" : "considered";
}

function createMissingCrate(crateName: string, state: LocalCrateClientState, now: string) {
  const safeName = normalizeCrateName(crateName);

  if (!state.crates.some((crate) => crate.name === safeName)) {
    state.crates = [{ name: safeName, createdAt: now, updatedAt: now }, ...state.crates];
    state.entriesByCrate[safeName] = [];
  }

  return safeName;
}

function strongestStatus(
  current: LocalCrateSampleStatus | null | undefined,
  next: LocalCrateSampleStatus,
): LocalCrateSampleStatus {
  const rank: Record<LocalCrateSampleStatus, number> = {
    considered: 1,
    exported: 2,
    used: 3,
  };

  if (!current) {
    return next;
  }

  return rank[next] >= rank[current] ? next : current;
}

function normalizeState(value: unknown): LocalCrateClientState {
  if (!value || typeof value !== "object") {
    return emptyState;
  }

  const state = value as Partial<LocalCrateClientState>;
  const crates = Array.isArray(state.crates)
    ? state.crates
        .filter((crate): crate is LocalCrateSummary => Boolean(crate?.name))
        .map((crate) => ({
          name: crate.name,
          createdAt: crate.createdAt ?? new Date().toISOString(),
          updatedAt: crate.updatedAt ?? crate.createdAt ?? new Date().toISOString(),
        }))
    : [];
  const entriesByCrate = typeof state.entriesByCrate === "object" && state.entriesByCrate ? state.entriesByCrate : {};
  const activeCrateName = crates.some((crate) => crate.name === state.activeCrateName)
    ? state.activeCrateName ?? null
    : crates[0]?.name ?? null;

  return { activeCrateName, crates, entriesByCrate };
}

async function readApiJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function apiMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const maybePayload = payload as { message?: string; error?: string };
    return maybePayload.message ?? maybePayload.error ?? fallback;
  }

  return fallback;
}

function crateTokenizedPathFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const envelope = payload as { data?: unknown };
  const data = envelope.data && typeof envelope.data === "object" ? envelope.data : payload;
  const crate = data as { tokenizedCratePath?: unknown; crateTokenizedPath?: unknown };
  const path = crate.tokenizedCratePath ?? crate.crateTokenizedPath;

  return typeof path === "string" ? path : null;
}
