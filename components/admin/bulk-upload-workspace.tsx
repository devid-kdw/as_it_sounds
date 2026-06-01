"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import {
  CheckCircle2,
  FileAudio,
  Loader2,
  RotateCcw,
  Save,
  Send,
  UploadCloud,
  X,
} from "lucide-react";
import {
  AdminStatusBadge,
  AssetStatusBadge,
  ProcessingStatusBadge,
} from "@/components/admin/status-badge";
import { adminSampleEditRoute } from "@/lib/routes";
import type {
  ApiErrorResponse,
  ProcessingJobStatusApiResponse,
  UploadSessionCreateRequest,
  UploadSessionCreateResponse,
  UploadSessionFinalizeApiResponse,
} from "@/types/api";

const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;
const PROCESSING_POLL_INTERVAL_MS = 2_000;
const PROCESSING_MONITOR_TIMEOUT_MS = 30 * 60 * 1_000;
const WAV_CONTENT_TYPES = new Set(["audio/wav", "audio/wave", "audio/x-wav", "audio/vnd.wave"]);

const sourceTypeOptions = [
  { value: "original_recording", label: "Original recording" },
  { value: "synthesized", label: "Synthesized" },
  { value: "field_recording", label: "Field recording" },
  { value: "processed_original", label: "Processed original" },
  { value: "licensed_source", label: "Licensed source" },
] as const;

const licenseStatusOptions = [
  { value: "unverified", label: "Unverified" },
  { value: "verified", label: "Verified" },
  { value: "restricted", label: "Restricted" },
  { value: "blocked", label: "Blocked" },
  { value: "archived", label: "Archived" },
] as const;

type LookupOption = {
  label: string;
  slug: string;
};

type AlbumOption = {
  id: string;
  title: string;
  status: string;
};

type BulkUploadWorkspaceProps = {
  albums: AlbumOption[];
  categories: LookupOption[];
  sampleTypes: Array<LookupOption & { requires_bpm?: boolean; can_be_loopable?: boolean }>;
};

type UploadTransferStatus =
  | "local"
  | "invalid"
  | "requesting_session"
  | "uploading"
  | "uploaded"
  | "finalizing"
  | "processing"
  | "complete"
  | "failed"
  | "saved"
  | "published";

type ProcessingStatus = "queued" | "running" | "succeeded" | "failed" | "timed_out" | "canceled";

type BulkRowOverride = {
  poeticName: string;
  displayTitle: string;
  shortDescription: string;
  categorySlug: string;
  sampleTypeSlug: string;
  moods: string;
  hiddenTags: string;
  bpm: string;
  musicalKey: string;
  loopable: boolean;
  sourceType: string;
  rightsOwner: string;
  commercialUseAllowed: boolean;
  attributionRequired: boolean;
  licenseStatus: string;
  licenseNotes: string;
  featured: boolean;
};

type BulkUploadRow = {
  batchPosition: number;
  contentType: string;
  duplicateWarnings: string[];
  errors: string[];
  file: File;
  id: string;
  progress: number;
  processingJobId: string | null;
  processingStatus: ProcessingStatus | null;
  sampleId: string | null;
  selected: boolean;
  status: UploadTransferStatus;
  uploadPath: string | null;
  validationIssues: string[];
  overrides: BulkRowOverride;
};

type SharedMetadata = {
  albumId: string;
  applyMode: "fill_empty" | "replace_selected" | "append_tags" | "clear_selected";
  categorySlug: string;
  sampleTypeSlug: string;
  moods: string;
  hiddenTags: string;
  sourceType: string;
  rightsOwner: string;
  commercialUseAllowed: boolean;
  attributionRequired: boolean;
  licenseStatus: string;
  licenseNotes: string;
  featured: boolean;
};

type ExtendedUploadSessionResponse = UploadSessionCreateResponse & {
  finalize_url?: string;
  finalize?: {
    method?: string;
    url?: string;
  };
  links?: {
    finalize?: string;
  };
};

const fallbackCategories: LookupOption[] = [
  { slug: "field_recordings", label: "Field Recordings" },
  { slug: "loops", label: "Loops" },
  { slug: "textures", label: "Textures" },
  { slug: "drones", label: "Drones" },
  { slug: "percussive", label: "Percussive" },
  { slug: "one_shots", label: "One-Shots" },
  { slug: "processed", label: "Processed" },
];

const fallbackSampleTypes = [
  { slug: "loop", label: "Loop", requires_bpm: true, can_be_loopable: true },
  { slug: "one_shot", label: "One-Shot", requires_bpm: false, can_be_loopable: false },
  { slug: "field_recording", label: "Field Recording", requires_bpm: false, can_be_loopable: false },
  { slug: "texture", label: "Texture", requires_bpm: false, can_be_loopable: true },
  { slug: "drone", label: "Drone", requires_bpm: false, can_be_loopable: true },
  { slug: "processed", label: "Processed", requires_bpm: false, can_be_loopable: true },
];

export function BulkUploadWorkspace({
  albums,
  categories,
  sampleTypes,
}: BulkUploadWorkspaceProps) {
  const safeCategories = categories.length > 0 ? categories : fallbackCategories;
  const safeSampleTypes = sampleTypes.length > 0 ? sampleTypes : fallbackSampleTypes;
  const [dragActive, setDragActive] = useState(false);
  const [batchId, setBatchId] = useState(() => createId());
  const [rows, setRows] = useState<BulkUploadRow[]>([]);
  const [shared, setShared] = useState<SharedMetadata>({
    albumId: "",
    applyMode: "fill_empty",
    categorySlug: safeCategories[0]?.slug ?? "",
    sampleTypeSlug: safeSampleTypes[0]?.slug ?? "",
    moods: "",
    hiddenTags: "",
    sourceType: "original_recording",
    rightsOwner: "",
    commercialUseAllowed: true,
    attributionRequired: false,
    licenseStatus: "unverified",
    licenseNotes: "",
    featured: false,
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canceledRowsRef = useRef(new Set<string>());

  const selectedCount = rows.filter((row) => row.selected).length;
  const validSelectedCount = rows.filter((row) => row.selected && row.validationIssues.length === 0).length;
  const completeCount = rows.filter((row) => row.processingStatus === "succeeded").length;
  const failedCount = rows.filter((row) => row.status === "failed" || row.processingStatus === "failed" || row.processingStatus === "timed_out").length;
  const activeCount = rows.filter((row) => ["requesting_session", "uploading", "finalizing", "processing"].includes(row.status)).length;
  const selectedAlbum = albums.find((album) => album.id === shared.albumId) ?? null;
  const selectedSampleType = safeSampleTypes.find((option) => option.slug === shared.sampleTypeSlug);
  const batchReady = rows.length > 0 && activeCount === 0;
  const canUpload = validSelectedCount > 0 && activeCount === 0;
  const canPublish = rows.some((row) => row.selected && row.sampleId && row.processingStatus === "succeeded");

  const batchTone = failedCount > 0 ? "warning" : completeCount > 0 && completeCount === rows.length ? "success" : "muted";

  function handleFiles(files: FileList | File[]) {
    const nextFiles = Array.from(files);
    if (nextFiles.length === 0) {
      return;
    }

    setRows((currentRows) => {
      const offset = currentRows.length;

      return [
        ...currentRows,
        ...nextFiles.map((file, index) => createBulkRow(file, offset + index + 1, shared)),
      ];
    });
  }

  function resetLocalBatch() {
    canceledRowsRef.current = new Set(rows.map((row) => row.id));
    setRows([]);
    setBatchId(createId());
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function updateRow(rowId: string, patch: Partial<BulkUploadRow>) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  }

  function updateOverride(rowId: string, patch: Partial<BulkRowOverride>) {
    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }

        const overrides = { ...row.overrides, ...patch };
        const validationIssues = validateBulkFile(row.file, overrides);

        return {
          ...row,
          overrides,
          status: row.sampleId ? row.status : validationIssues.length > 0 ? "invalid" : "local",
          validationIssues,
        };
      }),
    );
  }

  function applySharedMetadata() {
    setRows((currentRows) =>
      currentRows.map((row) => {
        if (!row.selected) {
          return row;
        }

        return {
          ...row,
          ...withValidatedOverrides(row, applySharedToOverride(row.overrides, shared)),
        };
      }),
    );
  }

  async function startSelectedUploads() {
    for (const row of rows) {
      const validationIssues = validateBulkFile(row.file, row.overrides);
      if (validationIssues.length > 0) {
        updateRow(row.id, { status: "invalid", validationIssues });
      }

      if (!row.selected || validationIssues.length > 0 || row.sampleId || canceledRowsRef.current.has(row.id)) {
        continue;
      }

      await startRowUpload(row);
    }
  }

  async function startRowUpload(row: BulkUploadRow) {
    try {
      updateRow(row.id, {
        errors: [],
        progress: 0,
        status: "requesting_session",
      });

      const session = await createUploadSession(buildUploadSessionRequest(row, batchId));
      if (isCanceled(canceledRowsRef, row.id)) {
        return;
      }

      updateRow(row.id, {
        processingJobId: session.processing_job_id,
        sampleId: session.sample_id,
        status: "uploading",
        uploadPath: session.upload_path,
      });

      await uploadToSignedUrl(session.signed_upload.url, row.file, row.contentType, (progress) => {
        if (!isCanceled(canceledRowsRef, row.id)) {
          updateRow(row.id, { progress });
        }
      });

      if (isCanceled(canceledRowsRef, row.id)) {
        return;
      }

      updateRow(row.id, {
        progress: 100,
        status: "finalizing",
      });

      await finalizeUploadIfNeeded(session);

      if (isCanceled(canceledRowsRef, row.id)) {
        return;
      }

      updateRow(row.id, {
        processingStatus: "queued",
        status: "processing",
      });

      await pollProcessingJob(session.processing_job_id, row.id, canceledRowsRef, updateRow);
    } catch (error) {
      updateRow(row.id, {
        errors: [errorMessage(error)],
        status: "failed",
      });
    }
  }

  async function saveRow(row: BulkUploadRow) {
    if (!row.sampleId) {
      updateRow(row.id, {
        errors: ["Create the upload session before saving row metadata."],
      });
      return;
    }

    updateRow(row.id, { errors: [], status: "processing" });

    try {
      const response = await fetch(`/api/admin/samples/${encodeURIComponent(row.sampleId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildSamplePatch(row.overrides)),
      });
      const payload = (await readJson(response)) as ApiErrorResponse | null;

      if (!response.ok || isApiError(payload)) {
        throw new Error(isApiError(payload) ? payload.message : "Unable to save row metadata.");
      }

      updateRow(row.id, {
        errors: [],
        status: "saved",
      });
    } catch (error) {
      updateRow(row.id, {
        errors: [errorMessage(error)],
        status: "failed",
      });
    }
  }

  async function publishSelectedRows() {
    for (const row of rows) {
      if (!row.selected || !row.sampleId) {
        continue;
      }

      if (row.processingStatus !== "succeeded") {
        updateRow(row.id, {
          errors: ["Publish skipped because processing has not succeeded for this file."],
        });
        continue;
      }

      try {
        updateRow(row.id, { errors: [] });
        const response = await fetch(`/api/admin/samples/${encodeURIComponent(row.sampleId)}/publish`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirm_publish: true }),
        });
        const payload = (await readJson(response)) as ApiErrorResponse | null;

        if (!response.ok || isApiError(payload)) {
          throw new Error(isApiError(payload) ? payload.message : "Unable to publish this row.");
        }

        updateRow(row.id, { status: "published" });
      } catch (error) {
        updateRow(row.id, {
          errors: [errorMessage(error)],
          status: "failed",
        });
      }
    }
  }

  function retryRow(row: BulkUploadRow) {
    canceledRowsRef.current.delete(row.id);
    void startRowUpload(row);
  }

  function removeLocalRow(rowId: string) {
    const row = rows.find((item) => item.id === rowId);
    if (row?.sampleId) {
      updateRow(rowId, {
        errors: ["Persisted sample rows stay visible. Archive from the row edit workspace if needed."],
      });
      return;
    }

    canceledRowsRef.current.add(rowId);
    setRows((currentRows) => currentRows.filter((item) => item.id !== rowId));
  }

  const selectedSummary = useMemo(
    () => [
      { label: "selected", value: selectedCount },
      { label: "valid", value: validSelectedCount },
      { label: "complete", value: completeCount },
      { label: "failed", value: failedCount },
    ],
    [completeCount, failedCount, selectedCount, validSelectedCount],
  );

  return (
    <div className="grid gap-4">
      <section className="grid gap-4 rounded-ais-md border border-ais-border-soft bg-ais-surface p-4 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
        <div className="grid content-start gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="ais-meta text-ais-amber">bulk intake</p>
              <h2 className="ais-title mt-1 text-2xl text-ais-text">Batch files</h2>
            </div>
            <AdminStatusBadge label={batchId.slice(0, 8)} tone={batchTone} />
          </div>

          <label
            className={[
              "grid min-h-40 cursor-pointer place-items-center rounded-ais-sm border border-dashed p-4 text-center transition",
              dragActive
                ? "border-ais-amber bg-ais-elevated"
                : "border-ais-border bg-ais-panel hover:border-ais-amber",
            ].join(" ")}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <input
              accept=".wav,audio/wav,audio/wave,audio/x-wav,audio/vnd.wave"
              className="sr-only"
              multiple
              onChange={(event) => handleFiles(event.target.files ?? [])}
              ref={inputRef}
              type="file"
            />
            <span className="grid justify-items-center gap-3">
              <span className="grid size-12 place-items-center rounded-full border border-ais-border-soft bg-ais-surface text-ais-amber">
                <FileAudio aria-hidden="true" size={22} />
              </span>
              <span>
                <span className="block font-medium text-ais-text">Drop or select WAV files</span>
                <span className="mt-1 block text-sm text-ais-muted">One independent sample and job per row</span>
              </span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            {selectedSummary.map((item) => (
              <div className="rounded-ais-sm border border-ais-border-soft bg-ais-panel p-3" key={item.label}>
                <p className="ais-meta text-ais-faint">{item.label}</p>
                <p className="ais-title mt-1 text-2xl text-ais-text">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid content-start gap-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <SelectField
              label="category"
              onChange={(value) => setShared((state) => ({ ...state, categorySlug: value }))}
              value={shared.categorySlug}
            >
              {safeCategories.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="sample type"
              onChange={(value) => setShared((state) => ({ ...state, sampleTypeSlug: value }))}
              value={shared.sampleTypeSlug}
            >
              {safeSampleTypes.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="album"
              onChange={(value) => setShared((state) => ({ ...state, albumId: value }))}
              value={shared.albumId}
            >
              <option value="">No album</option>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title} ({album.status})
                </option>
              ))}
            </SelectField>
            <SelectField
              label="apply mode"
              onChange={(value) => setShared((state) => ({ ...state, applyMode: value as SharedMetadata["applyMode"] }))}
              value={shared.applyMode}
            >
              <option value="fill_empty">Fill empty only</option>
              <option value="replace_selected">Replace selected</option>
              <option value="append_tags">Append tags</option>
              <option value="clear_selected">Clear selected field</option>
            </SelectField>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TextField
              label="moods"
              onChange={(value) => setShared((state) => ({ ...state, moods: value }))}
              placeholder="misty, warm"
              value={shared.moods}
            />
            <TextField
              label="hidden tags"
              onChange={(value) => setShared((state) => ({ ...state, hiddenTags: value }))}
              placeholder="modular, tape"
              value={shared.hiddenTags}
            />
            <TextField
              label="rights owner"
              onChange={(value) => setShared((state) => ({ ...state, rightsOwner: value }))}
              value={shared.rightsOwner}
            />
            <TextField
              label="license notes"
              onChange={(value) => setShared((state) => ({ ...state, licenseNotes: value }))}
              value={shared.licenseNotes}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <SelectField
              label="source type"
              onChange={(value) => setShared((state) => ({ ...state, sourceType: value }))}
              value={shared.sourceType}
            >
              {sourceTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="license"
              onChange={(value) => setShared((state) => ({ ...state, licenseStatus: value }))}
              value={shared.licenseStatus}
            >
              {licenseStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            <div className="grid grid-cols-3 gap-2">
              <ToggleField
                checked={shared.commercialUseAllowed}
                label="commercial"
                onChange={(value) => setShared((state) => ({ ...state, commercialUseAllowed: value }))}
              />
              <ToggleField
                checked={shared.attributionRequired}
                label="attrib"
                onChange={(value) => setShared((state) => ({ ...state, attributionRequired: value }))}
              />
              <ToggleField
                checked={shared.featured}
                label="featured"
                onChange={(value) => setShared((state) => ({ ...state, featured: value }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm text-ais-text transition hover:border-ais-amber disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selectedCount === 0}
              onClick={applySharedMetadata}
              type="button"
            >
              <CheckCircle2 aria-hidden="true" size={15} />
              Apply metadata
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-amber bg-ais-amber px-3 py-2 text-sm font-medium text-ais-bg transition hover:bg-ais-pale-green disabled:cursor-not-allowed disabled:border-ais-border disabled:bg-ais-border disabled:text-ais-faint"
              disabled={!canUpload}
              onClick={() => void startSelectedUploads()}
              type="button"
            >
              {activeCount > 0 ? <Loader2 aria-hidden="true" className="animate-spin" size={15} /> : <UploadCloud aria-hidden="true" size={15} />}
              Upload selected
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm text-ais-text transition hover:border-ais-amber disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canPublish}
              onClick={() => void publishSelectedRows()}
              type="button"
            >
              <Send aria-hidden="true" size={15} />
              Publish eligible
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm text-ais-muted transition hover:border-ais-amber hover:text-ais-text disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!batchReady}
              onClick={resetLocalBatch}
              type="button"
            >
              <RotateCcw aria-hidden="true" size={15} />
              New local batch
            </button>
          </div>

          <div className="grid gap-2 rounded-ais-sm border border-ais-border-soft bg-ais-panel p-3 text-sm text-ais-muted">
            <p>
              Batch <span className="font-ais-mono text-ais-text">{batchId}</span>
              {selectedAlbum ? <> targets <span className="text-ais-text">{selectedAlbum.title}</span></> : null}
              {selectedSampleType?.requires_bpm ? " and requires BPM before session creation." : "."}
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-ais-md border border-ais-border-soft bg-ais-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ais-border-soft px-4 py-3">
          <div>
            <p className="ais-meta text-ais-amber">per-file overrides</p>
            <h2 className="ais-title mt-1 text-xl text-ais-text">Upload queue</h2>
          </div>
          <button
            className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm text-ais-muted transition hover:border-ais-amber hover:text-ais-text"
            onClick={() =>
              setRows((currentRows) =>
                currentRows.map((row) => ({
                  ...row,
                  selected: currentRows.some((item) => !item.selected),
                })),
              )
            }
            type="button"
          >
            Toggle all
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-sm leading-6 text-ais-muted">
            No files selected. The table keeps failed local rows visible once they exist, and persisted rows can only be archived from admin workflows.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1320px] border-collapse text-left text-sm">
              <thead className="bg-ais-panel text-ais-faint">
                <tr>
                  <ColumnHead className="w-10">sel</ColumnHead>
                  <ColumnHead>status</ColumnHead>
                  <ColumnHead>original filename</ColumnHead>
                  <ColumnHead>preview</ColumnHead>
                  <ColumnHead>poetic name</ColumnHead>
                  <ColumnHead>display title</ColumnHead>
                  <ColumnHead>description</ColumnHead>
                  <ColumnHead>category</ColumnHead>
                  <ColumnHead>type</ColumnHead>
                  <ColumnHead>moods</ColumnHead>
                  <ColumnHead>bpm/key</ColumnHead>
                  <ColumnHead>license</ColumnHead>
                  <ColumnHead>publish</ColumnHead>
                  <ColumnHead>actions</ColumnHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-t border-ais-border-soft align-top" key={row.id}>
                    <td className="px-3 py-3">
                      <input
                        checked={row.selected}
                        className="size-4 accent-ais-amber"
                        onChange={(event) => updateRow(row.id, { selected: event.target.checked })}
                        type="checkbox"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="grid min-w-36 gap-2">
                        <AdminStatusBadge label={statusLabel(row.status)} tone={row.status === "failed" ? "danger" : row.status === "complete" || row.status === "published" ? "success" : "muted"} />
                        <ProcessingStatusBadge status={row.processingStatus} />
                        <ProgressBar progress={row.progress} />
                        {row.validationIssues.map((issue) => (
                          <p className="text-xs leading-5 text-ais-danger" key={issue}>
                            {issue}
                          </p>
                        ))}
                        {row.errors.map((error) => (
                          <p className="text-xs leading-5 text-ais-danger" key={error}>
                            {error}
                          </p>
                        ))}
                        {row.duplicateWarnings.map((warning) => (
                          <AdminStatusBadge key={warning} label="duplicate warning" tone="warning" />
                        ))}
                      </div>
                    </td>
                    <td className="max-w-56 px-3 py-3">
                      <p className="break-words font-medium text-ais-text">{row.file.name}</p>
                      <p className="mt-1 font-ais-mono text-xs text-ais-faint">{formatBytes(row.file.size)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="grid gap-2">
                        <AssetStatusBadge label="preview" present={row.processingStatus === "succeeded"} />
                        <div className="h-8 w-28 rounded-ais-sm border border-ais-border-soft bg-[repeating-linear-gradient(90deg,var(--ais-border-soft)_0_2px,transparent_2px_8px)]" />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <InlineInput
                        onChange={(value) => updateOverride(row.id, { poeticName: value })}
                        placeholder="confirmed_name"
                        value={row.overrides.poeticName}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <InlineInput
                        onChange={(value) => updateOverride(row.id, { displayTitle: value })}
                        placeholder="Display title"
                        value={row.overrides.displayTitle}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <InlineTextarea
                        onChange={(value) => updateOverride(row.id, { shortDescription: value })}
                        placeholder="Short description"
                        value={row.overrides.shortDescription}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <InlineSelect
                        onChange={(value) => updateOverride(row.id, { categorySlug: value })}
                        value={row.overrides.categorySlug}
                      >
                        {safeCategories.map((option) => (
                          <option key={option.slug} value={option.slug}>
                            {option.label}
                          </option>
                        ))}
                      </InlineSelect>
                    </td>
                    <td className="px-3 py-3">
                      <InlineSelect
                        onChange={(value) => updateOverride(row.id, { sampleTypeSlug: value })}
                        value={row.overrides.sampleTypeSlug}
                      >
                        {safeSampleTypes.map((option) => (
                          <option key={option.slug} value={option.slug}>
                            {option.label}
                          </option>
                        ))}
                      </InlineSelect>
                    </td>
                    <td className="px-3 py-3">
                      <InlineInput
                        onChange={(value) => updateOverride(row.id, { moods: value })}
                        placeholder="calm, bright"
                        value={row.overrides.moods}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="grid min-w-32 gap-2">
                        <InlineInput
                          onChange={(value) => updateOverride(row.id, { bpm: value })}
                          placeholder="120"
                          value={row.overrides.bpm}
                        />
                        <InlineInput
                          onChange={(value) => updateOverride(row.id, { musicalKey: value })}
                          placeholder="C minor"
                          value={row.overrides.musicalKey}
                        />
                        <label className="flex items-center gap-2 text-xs text-ais-muted">
                          <input
                            checked={row.overrides.loopable}
                            className="accent-ais-amber"
                            onChange={(event) => updateOverride(row.id, { loopable: event.target.checked })}
                            type="checkbox"
                          />
                          loopable
                        </label>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="grid min-w-36 gap-2">
                        <InlineSelect
                          onChange={(value) => updateOverride(row.id, { licenseStatus: value })}
                          value={row.overrides.licenseStatus}
                        >
                          {licenseStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </InlineSelect>
                        <InlineInput
                          onChange={(value) => updateOverride(row.id, { rightsOwner: value })}
                          placeholder="rights owner"
                          value={row.overrides.rightsOwner}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="grid gap-2">
                        <AdminStatusBadge
                          label={row.sampleId && row.processingStatus === "succeeded" ? "eligible check" : "blocked"}
                          tone={row.sampleId && row.processingStatus === "succeeded" ? "warning" : "muted"}
                        />
                        {row.sampleId ? (
                          <Link
                            className="text-xs text-ais-amber underline-offset-4 hover:underline"
                            href={adminSampleEditRoute(row.sampleId)}
                          >
                            full review
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-32 flex-wrap gap-2">
                        <IconButton
                          disabled={!row.sampleId}
                          label="Save row"
                          onClick={() => void saveRow(row)}
                        >
                          <Save aria-hidden="true" size={14} />
                        </IconButton>
                        <IconButton
                          disabled={row.validationIssues.length > 0 || activeCount > 0}
                          label="Retry processing"
                          onClick={() => retryRow(row)}
                        >
                          <RotateCcw aria-hidden="true" size={14} />
                        </IconButton>
                        <IconButton
                          disabled={Boolean(row.sampleId)}
                          label="Remove local failed row"
                          onClick={() => removeLocalRow(row.id)}
                        >
                          <X aria-hidden="true" size={14} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function createBulkRow(file: File, batchPosition: number, shared: SharedMetadata): BulkUploadRow {
  const contentType = declaredWavContentType(file);
  const overrides: BulkRowOverride = {
    poeticName: "",
    displayTitle: file.name.replace(/\.wav$/i, "").replaceAll("_", " "),
    shortDescription: "",
    categorySlug: shared.categorySlug,
    sampleTypeSlug: shared.sampleTypeSlug,
    moods: shared.moods,
    hiddenTags: shared.hiddenTags,
    bpm: shared.sampleTypeSlug === "loop" ? "120" : "",
    musicalKey: "",
    loopable: shared.sampleTypeSlug === "loop",
    sourceType: shared.sourceType,
    rightsOwner: shared.rightsOwner,
    commercialUseAllowed: shared.commercialUseAllowed,
    attributionRequired: shared.attributionRequired,
    licenseStatus: shared.licenseStatus,
    licenseNotes: shared.licenseNotes,
    featured: shared.featured,
  };

  const validationIssues = validateBulkFile(file, overrides);

  return {
    batchPosition,
    contentType,
    duplicateWarnings: [],
    errors: [],
    file,
    id: createId(),
    progress: 0,
    processingJobId: null,
    processingStatus: null,
    sampleId: null,
    selected: true,
    status: validationIssues.length > 0 ? "invalid" : "local",
    uploadPath: null,
    validationIssues,
    overrides,
  };
}

function validateBulkFile(file: File, overrides: BulkRowOverride) {
  const issues: string[] = [];

  if (!/\.wav$/i.test(file.name.trim())) {
    issues.push("Only .wav files are accepted.");
  }

  if (file.type && !WAV_CONTENT_TYPES.has(file.type.toLowerCase())) {
    issues.push(`Browser declared ${file.type}; WAV content type expected.`);
  }

  if (file.size <= 0) {
    issues.push("File is empty.");
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    issues.push("File is larger than 500 MB.");
  }

  if (overrides.sampleTypeSlug === "loop") {
    const bpm = Number(overrides.bpm);
    if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 400) {
      issues.push("Loop rows require BPM from 1 to 400.");
    }
  }

  return issues;
}

function applySharedToOverride(overrides: BulkRowOverride, shared: SharedMetadata): BulkRowOverride {
  if (shared.applyMode === "clear_selected") {
    return {
      ...overrides,
      hiddenTags: "",
      licenseNotes: "",
      moods: "",
      rightsOwner: "",
    };
  }

  if (shared.applyMode === "append_tags") {
    return {
      ...overrides,
      hiddenTags: mergeCommaValues(overrides.hiddenTags, shared.hiddenTags),
      moods: mergeCommaValues(overrides.moods, shared.moods),
    };
  }

  const nextValues = {
    categorySlug: shared.categorySlug,
    sampleTypeSlug: shared.sampleTypeSlug,
    moods: shared.moods,
    hiddenTags: shared.hiddenTags,
    sourceType: shared.sourceType,
    rightsOwner: shared.rightsOwner,
    commercialUseAllowed: shared.commercialUseAllowed,
    attributionRequired: shared.attributionRequired,
    licenseStatus: shared.licenseStatus,
    licenseNotes: shared.licenseNotes,
    featured: shared.featured,
  };

  if (shared.applyMode === "replace_selected") {
    return {
      ...overrides,
      ...nextValues,
      loopable: shared.sampleTypeSlug === "loop" ? true : overrides.loopable,
    };
  }

  return {
    ...overrides,
    categorySlug: overrides.categorySlug || shared.categorySlug,
    sampleTypeSlug: overrides.sampleTypeSlug || shared.sampleTypeSlug,
    moods: overrides.moods || shared.moods,
    hiddenTags: overrides.hiddenTags || shared.hiddenTags,
    sourceType: overrides.sourceType || shared.sourceType,
    rightsOwner: overrides.rightsOwner || shared.rightsOwner,
    licenseStatus: overrides.licenseStatus || shared.licenseStatus,
    licenseNotes: overrides.licenseNotes || shared.licenseNotes,
    commercialUseAllowed: overrides.commercialUseAllowed || shared.commercialUseAllowed,
    attributionRequired: overrides.attributionRequired || shared.attributionRequired,
    featured: overrides.featured || shared.featured,
  };
}

function withValidatedOverrides(row: BulkUploadRow, overrides: BulkRowOverride) {
  const validationIssues = validateBulkFile(row.file, overrides);

  return {
    overrides,
    status: row.sampleId ? row.status : validationIssues.length > 0 ? "invalid" : "local",
    validationIssues,
  };
}

function buildUploadSessionRequest(row: BulkUploadRow, batchId: string): UploadSessionCreateRequest {
  return {
    mode: "bulk",
    filename: row.file.name,
    content_type: row.contentType,
    file_size_bytes: row.file.size,
    category_slug: row.overrides.categorySlug,
    sample_type_slug: row.overrides.sampleTypeSlug,
    bpm: row.overrides.sampleTypeSlug === "loop" ? Number(row.overrides.bpm) : null,
    batch_id: batchId,
    bulk_position: row.batchPosition,
  };
}

function buildSamplePatch(overrides: BulkRowOverride) {
  const moodSlugs = parseSlugs(overrides.moods).slice(0, 3);
  const hiddenTagSlugs = parseSlugs(overrides.hiddenTags);

  return {
    poetic_name: overrides.poeticName || undefined,
    display_title: overrides.displayTitle || null,
    display_title_is_custom: Boolean(overrides.displayTitle),
    short_description: overrides.shortDescription || null,
    category_slug: overrides.categorySlug,
    sample_type_slug: overrides.sampleTypeSlug,
    mood_slugs: moodSlugs,
    hidden_tag_slugs: hiddenTagSlugs,
    bpm: overrides.bpm ? Number(overrides.bpm) : null,
    musical_key: overrides.musicalKey || null,
    is_melodic: Boolean(overrides.musicalKey),
    unknown_key_confirmed: !overrides.musicalKey,
    loopable: overrides.loopable,
    featured: overrides.featured,
    source_type: overrides.sourceType,
    rights_owner: overrides.rightsOwner || null,
    commercial_use_allowed: overrides.commercialUseAllowed,
    redistribution_allowed: false,
    attribution_required: overrides.attributionRequired,
    license_status: overrides.licenseStatus,
    license_notes: overrides.licenseNotes || null,
    license_confirmed: overrides.licenseStatus === "verified",
  };
}

async function createUploadSession(requestBody: UploadSessionCreateRequest): Promise<ExtendedUploadSessionResponse> {
  const response = await fetch("/api/admin/upload-sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const payload = await readJson(response);

  if (!response.ok || isApiError(payload)) {
    throw new Error(isApiError(payload) ? payload.message : "Unable to create a bulk upload session.");
  }

  if (!isRecord(payload) || payload.ok !== true || !isUploadSession(payload.data)) {
    if (isUploadSessionsResponse(payload)) {
      const session = payload.data.sessions[0];

      if (session && isUploadSession(session)) {
        return session;
      }
    }

    throw new Error("Upload session response did not include a signed upload target.");
  }

  return payload.data;
}

function isUploadSessionsResponse(value: unknown): value is {
  ok: true;
  data: {
    sessions: unknown[];
  };
} {
  return (
    isRecord(value) &&
    value.ok === true &&
    isRecord(value.data) &&
    Array.isArray(value.data.sessions)
  );
}

function uploadToSignedUrl(
  url: string,
  file: File,
  contentType: string,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", contentType);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      reject(new Error(readUploadError(request)));
    };

    request.onerror = () => reject(new Error("The signed upload request failed before storage accepted the file."));
    request.onabort = () => reject(new Error("The signed upload request was aborted."));
    request.send(file);
  });
}

async function finalizeUploadIfNeeded(session: ExtendedUploadSessionResponse) {
  const finalizeUrl = session.finalize_url ?? session.finalize?.url ?? session.links?.finalize;
  const response = await fetch(finalizeUrl ?? `/api/admin/upload-sessions/${encodeURIComponent(session.processing_job_id)}/finalize`, {
    method: session.finalize?.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sample_id: session.sample_id,
      processing_job_id: session.processing_job_id,
    }),
  });
  const payload = (await readJson(response)) as UploadSessionFinalizeApiResponse | null;

  if (!response.ok || isApiError(payload)) {
    throw new Error(isApiError(payload) ? payload.message : "Unable to finalize the uploaded file.");
  }
}

async function pollProcessingJob(
  processingJobId: string,
  rowId: string,
  canceledRowsRef: MutableRefObject<Set<string>>,
  updateRow: (rowId: string, patch: Partial<BulkUploadRow>) => void,
) {
  const startedAt = Date.now();

  while (!isCanceled(canceledRowsRef, rowId)) {
    const response = await fetch(`/api/admin/processing-jobs/${encodeURIComponent(processingJobId)}`);
    const payload = (await readJson(response)) as ProcessingJobStatusApiResponse | null;

    if (!response.ok || isApiError(payload) || !isRecord(payload) || payload.ok !== true) {
      throw new Error(isApiError(payload) ? payload.message : "Unable to read processing status.");
    }

    const status = normalizeProcessingStatus(payload.data.processing_status);
    const duplicateWarnings = extractDuplicateWarnings({
      duplicate_check: payload.data.duplicate_check,
      warnings: payload.data.warnings,
    });

    updateRow(rowId, {
      duplicateWarnings,
      processingStatus: status,
      sampleId: payload.data.sample_id,
      status: status === "succeeded" ? "complete" : "processing",
    });

    if (status === "succeeded") {
      return;
    }

    if (status === "failed" || status === "timed_out" || status === "canceled") {
      throw new Error(payload.data.last_error_message ?? `Processing ${status.replace("_", " ")}.`);
    }

    if (Date.now() - startedAt > PROCESSING_MONITOR_TIMEOUT_MS) {
      throw new Error("Processing did not report completion within the local monitor window.");
    }

    await sleep(PROCESSING_POLL_INTERVAL_MS);
  }
}

function ColumnHead({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <th className={["px-3 py-2 font-ais-mono text-[0.68rem] font-normal lowercase", className].join(" ")}>{children}</th>;
}

function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm text-ais-muted">
      <span className="ais-meta text-ais-faint">{label}</span>
      <input
        className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-ais-text placeholder:text-ais-faint"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function SelectField({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm text-ais-muted">
      <span className="ais-meta text-ais-faint">{label}</span>
      <select
        className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-ais-text"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

function ToggleField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="grid place-items-center gap-1 rounded-ais-sm border border-ais-border-soft bg-ais-panel px-2 py-2 text-center text-xs text-ais-muted">
      <input
        checked={checked}
        className="accent-ais-amber"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="ais-meta text-ais-faint">{label}</span>
    </label>
  );
}

function InlineInput({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <input
      className="w-40 rounded-ais-sm border border-ais-border-soft bg-ais-panel px-2 py-1.5 text-sm text-ais-text placeholder:text-ais-faint"
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  );
}

function InlineTextarea({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <textarea
      className="h-20 w-52 resize-none rounded-ais-sm border border-ais-border-soft bg-ais-panel px-2 py-1.5 text-sm text-ais-text placeholder:text-ais-faint"
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  );
}

function InlineSelect({
  children,
  onChange,
  value,
}: {
  children: ReactNode;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      className="w-40 rounded-ais-sm border border-ais-border-soft bg-ais-panel px-2 py-1.5 text-sm text-ais-text"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  );
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex size-8 items-center justify-center rounded-ais-sm border border-ais-border-soft bg-ais-panel text-ais-muted transition hover:border-ais-amber hover:text-ais-text disabled:cursor-not-allowed disabled:text-ais-faint disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ais-border-soft">
      <div className="h-full rounded-full bg-ais-amber transition-all" style={{ width: `${progress}%` }} />
    </div>
  );
}

function statusLabel(status: UploadTransferStatus) {
  return status.replaceAll("_", " ");
}

function isUploadSession(value: unknown): value is ExtendedUploadSessionResponse {
  return (
    isRecord(value) &&
    typeof value.sample_id === "string" &&
    typeof value.processing_job_id === "string" &&
    typeof value.upload_bucket === "string" &&
    typeof value.upload_path === "string" &&
    isRecord(value.signed_upload) &&
    typeof value.signed_upload.url === "string"
  );
}

function isApiError(value: unknown): value is ApiErrorResponse {
  return isRecord(value) && value.ok === false && typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function readUploadError(request: XMLHttpRequest) {
  if (!request.responseText) {
    return `Storage upload failed with status ${request.status}.`;
  }

  try {
    const payload = JSON.parse(request.responseText) as unknown;
    if (isRecord(payload) && typeof payload.message === "string") {
      return payload.message;
    }
    if (isRecord(payload) && typeof payload.error === "string") {
      return payload.error;
    }
  } catch {
    return request.responseText;
  }

  return request.responseText;
}

function normalizeProcessingStatus(status: string): ProcessingStatus {
  if (
    status === "queued" ||
    status === "running" ||
    status === "succeeded" ||
    status === "failed" ||
    status === "timed_out" ||
    status === "canceled"
  ) {
    return status;
  }

  return "failed";
}

function extractDuplicateWarnings(metadata: unknown): string[] {
  if (!isRecord(metadata)) {
    return [];
  }

  const warnings = metadata.warnings;
  const duplicateCheck = metadata.duplicate_check;
  const messages: string[] = [];

  if (Array.isArray(warnings)) {
    for (const warning of warnings) {
      if (!isRecord(warning)) {
        continue;
      }
      const code = typeof warning.code === "string" ? warning.code : "";
      const message = typeof warning.message === "string" ? warning.message : "";
      if (code.toLowerCase().includes("duplicate") || message.toLowerCase().includes("duplicate")) {
        messages.push(message || "Possible duplicate source.");
      }
    }
  }

  if (duplicateCheck && JSON.stringify(duplicateCheck).toLowerCase().includes("duplicate")) {
    messages.push("Worker metadata reported possible duplicate source.");
  }

  return [...new Set(messages)];
}

function declaredWavContentType(file: File) {
  return file.type && WAV_CONTENT_TYPES.has(file.type.toLowerCase()) ? file.type.toLowerCase() : "audio/wav";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Bulk row action failed.";
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `bulk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isCanceled(canceledRowsRef: MutableRefObject<Set<string>>, rowId: string) {
  return canceledRowsRef.current.has(rowId);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function parseSlugs(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
}

function mergeCommaValues(current: string, incoming: string) {
  return [...new Set([...parseSlugs(current), ...parseSlugs(incoming)])].join(", ");
}
