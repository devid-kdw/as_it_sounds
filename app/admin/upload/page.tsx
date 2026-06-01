"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileAudio,
  Loader2,
  RotateCcw,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { RouteShell } from "@/components/ui/route-shell";
import { adminSampleEditRoute } from "@/lib/routes";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  type DuplicateWarning,
  type ProcessingStatus,
  type ValidationIssue,
  useAdminUploadStore,
} from "@/stores/admin-upload-store";
import type {
  ApiErrorResponse,
  ProcessingJobStatusApiResponse,
  ProcessingJobStatusResponse,
  UploadSessionCreateApiResponse,
  UploadSessionCreateRequest,
  UploadSessionCreateResponse,
  UploadSessionFinalizeApiResponse,
} from "@/types/api";

const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;
const PROCESSING_POLL_INTERVAL_MS = 2_000;
const PROCESSING_MONITOR_TIMEOUT_MS = 30 * 60 * 1_000;
const WAV_CONTENT_TYPES = new Set(["audio/wav", "audio/wave", "audio/x-wav", "audio/vnd.wave"]);

const categoryOptions = [
  { slug: "field_recordings", label: "Field Recordings" },
  { slug: "loops", label: "Loops" },
  { slug: "textures", label: "Textures" },
  { slug: "drones", label: "Drones" },
  { slug: "percussive", label: "Percussive" },
  { slug: "one_shots", label: "One-Shots" },
  { slug: "processed", label: "Processed" },
] as const;

const sampleTypeOptions = [
  { slug: "loop", label: "Loop", requiresBpm: true },
  { slug: "one_shot", label: "One-Shot", requiresBpm: false },
  { slug: "field_recording", label: "Field Recording", requiresBpm: false },
  { slug: "texture", label: "Texture", requiresBpm: false },
  { slug: "drone", label: "Drone", requiresBpm: false },
  { slug: "processed", label: "Processed", requiresBpm: false },
] as const;

const processingStates: ProcessingStatus[] = ["queued", "running", "succeeded", "failed", "timed_out"];

type ExtendedUploadSessionResponse = UploadSessionCreateResponse & {
  finalize_url?: string;
  finalize?: {
    url?: string;
    method?: string;
  };
  links?: {
    finalize?: string;
  };
};

type FinalizeTarget = {
  url: string;
  method: string;
};

type UploadFormState = {
  categorySlug: string;
  sampleTypeSlug: string;
  bpm: string;
};

export default function AdminUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [formState, setFormState] = useState<UploadFormState>({
    categorySlug: "field_recordings",
    sampleTypeSlug: "loop",
    bpm: "120",
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeRunRef = useRef<string | null>(null);

  const queue = useAdminUploadStore((state) => state.queue);
  const selectedQueueId = useAdminUploadStore((state) => state.selectedQueueId);
  const beginSingleUpload = useAdminUploadStore((state) => state.beginSingleUpload);
  const updateQueueItem = useAdminUploadStore((state) => state.updateQueueItem);
  const resetQueue = useAdminUploadStore((state) => state.resetQueue);
  const selectedItem = queue.find((item) => item.id === selectedQueueId) ?? queue[0] ?? null;
  const selectedSampleType = sampleTypeOptions.find((option) => option.slug === formState.sampleTypeSlug);
  const declaredContentType = file ? declaredWavContentType(file) : "audio/wav";
  const validationIssues = useMemo(() => validateUpload(file, formState), [file, formState]);
  const hasBlockingValidation = validationIssues.length > 0;
  const isBusy = selectedItem
    ? ["requesting_session", "uploading", "uploaded", "finalizing", "processing"].includes(selectedItem.status)
    : false;
  const canSubmit = Boolean(file) && !hasBlockingValidation && !isBusy;

  function handleFiles(files: FileList | File[]) {
    const nextFile = Array.from(files)[0] ?? null;
    activeRunRef.current = null;
    resetQueue();
    setFile(nextFile);
  }

  function handleReset() {
    activeRunRef.current = null;
    resetQueue();
    setFile(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handleSubmit() {
    if (!file) {
      return;
    }

    const currentValidationIssues = validateUpload(file, formState);
    const itemId = beginSingleUpload(file, currentValidationIssues);
    activeRunRef.current = itemId;

    if (currentValidationIssues.length > 0) {
      return;
    }

    const requestBody = buildUploadSessionRequest(file, formState);
    let failureStage: "upload" | "finalize" | "processing" = "upload";

    try {
      updateQueueItem(itemId, {
        status: "requesting_session",
        uploadStatus: "requesting_session",
        validationIssues: [],
        errors: {
          validation: null,
          upload: null,
          finalize: null,
          processing: null,
        },
      });

      const session = await createUploadSession(requestBody);
      if (!isActiveRun(activeRunRef, itemId)) {
        return;
      }

      updateQueueItem(itemId, {
        sampleId: session.sample_id,
        processingJobId: session.processing_job_id,
        uploadBucket: session.upload_bucket,
        uploadPath: session.upload_path,
        status: "uploading",
        uploadStatus: "uploading",
        progress: 0,
      });

      await uploadToSignedUrl(session.signed_upload.url, file, declaredContentType, (progress) => {
        if (isActiveRun(activeRunRef, itemId)) {
          updateQueueItem(itemId, { progress });
        }
      });
      if (!isActiveRun(activeRunRef, itemId)) {
        return;
      }

      updateQueueItem(itemId, {
        status: "uploaded",
        uploadStatus: "uploaded",
        progress: 100,
      });

      failureStage = "finalize";
      await finalizeUploadIfNeeded(session, itemId, updateQueueItem, activeRunRef);
      if (!isActiveRun(activeRunRef, itemId)) {
        return;
      }

      updateQueueItem(itemId, {
        status: "processing",
        processingStatus: "queued",
      });

      failureStage = "processing";
      await pollProcessingJob(session.processing_job_id, itemId, activeRunRef, updateQueueItem);
    } catch (error) {
      if (!isActiveRun(activeRunRef, itemId)) {
        return;
      }

      const message = errorMessage(error);
      if (failureStage === "upload") {
        updateQueueItem(itemId, {
          status: "failed",
          uploadStatus: "failed",
          errors: {
            upload: message,
          },
        });
        return;
      }

      if (failureStage === "finalize") {
        updateQueueItem(itemId, {
          status: "failed",
          finalizeStatus: "failed",
          errors: {
            finalize: message,
          },
        });
        return;
      }

      updateQueueItem(itemId, {
        status: "failed",
        errors: {
          processing: message,
        },
      });
    }
  }

  return (
    <RouteShell
      eyebrow="admin upload"
      title="Single WAV upload"
      description="Create one local admin intake, send the WAV to scoped storage, then watch processing finish."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
        <section className="grid content-start gap-5 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="ais-meta text-ais-amber">source</p>
              <h2 className="ais-title mt-2 text-2xl text-ais-text">WAV intake</h2>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm text-ais-muted transition duration-ais-base hover:border-ais-amber hover:text-ais-text disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!file && queue.length === 0}
              onClick={handleReset}
              type="button"
            >
              <RotateCcw aria-hidden="true" size={16} />
              Reset
            </button>
          </div>

          <label
            className={[
              "grid min-h-56 cursor-pointer place-items-center rounded-ais-md border border-dashed p-6 text-center transition duration-ais-base",
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
              onChange={(event) => handleFiles(event.target.files ?? [])}
              ref={inputRef}
              type="file"
            />
            <span className="grid justify-items-center gap-4">
              <span className="grid size-14 place-items-center rounded-full border border-ais-border-soft bg-ais-surface text-ais-amber">
                <FileAudio aria-hidden="true" size={24} />
              </span>
              <span>
                <span className="block text-lg font-medium text-ais-text">
                  {file ? file.name : "Choose WAV file"}
                </span>
                <span className="mt-2 block text-sm text-ais-muted">
                  {file ? `${formatBytes(file.size)} · ${declaredContentType}` : "Drop or select one file"}
                </span>
              </span>
            </span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-ais-muted">
              <span className="ais-meta text-ais-faint">category</span>
              <select
                className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-ais-text"
                onChange={(event) => setFormState((state) => ({ ...state, categorySlug: event.target.value }))}
                value={formState.categorySlug}
              >
                {categoryOptions.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-ais-muted">
              <span className="ais-meta text-ais-faint">type</span>
              <select
                className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-ais-text"
                onChange={(event) => setFormState((state) => ({ ...state, sampleTypeSlug: event.target.value }))}
                value={formState.sampleTypeSlug}
              >
                {sampleTypeOptions.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedSampleType?.requiresBpm ? (
            <label className="grid gap-2 text-sm text-ais-muted">
              <span className="ais-meta text-ais-faint">bpm</span>
              <input
                className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-ais-text"
                inputMode="decimal"
                max="400"
                min="1"
                onChange={(event) => setFormState((state) => ({ ...state, bpm: event.target.value }))}
                type="number"
                value={formState.bpm}
              />
            </label>
          ) : null}

          <section className="rounded-ais-md border border-ais-border-soft bg-ais-panel p-4" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="ais-meta text-ais-amber">declared validation</p>
                <h3 className="ais-title mt-2 text-xl text-ais-text">Client check</h3>
              </div>
              {file && validationIssues.length === 0 ? (
                <CheckCircle2 className="text-ais-success" aria-hidden="true" size={22} />
              ) : (
                <Clock3 className="text-ais-faint" aria-hidden="true" size={22} />
              )}
            </div>
            <div className="mt-4 grid gap-2 text-sm text-ais-muted">
              {file ? (
                validationRows(file, formState).map((row) => (
                  <div className="flex items-center justify-between gap-3" key={row.label}>
                    <span>{row.label}</span>
                    <span className={row.ok ? "text-ais-success" : "text-ais-danger"}>{row.value}</span>
                  </div>
                ))
              ) : (
                <p>No file selected.</p>
              )}
            </div>
            {validationIssues.length > 0 ? (
              <ErrorMessages
                className="mt-4"
                messages={validationIssues.map((issue) => issue.message)}
                title="Validation"
              />
            ) : null}
          </section>

          <button
            className="inline-flex items-center justify-center gap-2 rounded-ais-sm border border-ais-amber bg-ais-amber px-4 py-3 font-medium text-ais-bg transition duration-ais-base hover:bg-ais-pale-green disabled:cursor-not-allowed disabled:border-ais-border disabled:bg-ais-border disabled:text-ais-faint"
            disabled={!canSubmit}
            onClick={handleSubmit}
            type="button"
          >
            {isBusy ? <Loader2 className="animate-spin" aria-hidden="true" size={18} /> : <UploadCloud aria-hidden="true" size={18} />}
            Start upload
          </button>
        </section>

        <section className="grid content-start gap-4" aria-live="polite">
          <StatusCard
            detail={selectedItem ? `${selectedItem.progress}%` : "Waiting"}
            error={selectedItem?.errors.upload}
            icon={selectedItem?.uploadStatus === "uploaded" ? "success" : selectedItem?.errors.upload ? "failed" : "pending"}
            title="Upload transfer"
          >
            <div className="h-2 overflow-hidden rounded-full bg-ais-border-soft">
              <div
                className="h-full rounded-full bg-ais-amber transition-all duration-ais-panel"
                style={{ width: `${selectedItem?.progress ?? 0}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-ais-muted">
              {selectedItem?.uploadStatus === "uploaded"
                ? "The file reached scoped storage."
                : selectedItem?.uploadStatus === "uploading"
                  ? "Uploading to signed storage URL."
                  : selectedItem?.uploadStatus === "requesting_session"
                    ? "Requesting upload session."
                    : "No transfer has started."}
            </p>
          </StatusCard>

          <StatusCard
            detail={finalizeLabel(selectedItem?.finalizeStatus ?? "idle")}
            error={selectedItem?.errors.finalize}
            icon={
              selectedItem?.finalizeStatus === "complete" || selectedItem?.finalizeStatus === "not_required"
                ? "success"
                : selectedItem?.finalizeStatus === "failed"
                  ? "failed"
                  : "pending"
            }
            title="Finalize"
          >
            <p className="text-sm leading-6 text-ais-muted">
              {selectedItem?.finalizeStatus === "not_required"
                ? "The session contract does not require a separate finalize call."
                : selectedItem?.finalizeStatus === "complete"
                  ? "The upload was finalized."
                  : selectedItem?.finalizeStatus === "finalizing"
                    ? "Finalizing uploaded storage object."
                    : "Finalization has not started."}
            </p>
          </StatusCard>

          <StatusCard
            detail={processingLabel(selectedItem?.processingStatus)}
            error={selectedItem?.errors.processing}
            icon={
              selectedItem?.processingStatus === "succeeded"
                ? "success"
                : selectedItem?.processingStatus === "failed" || selectedItem?.processingStatus === "timed_out"
                  ? "failed"
                  : selectedItem?.processingStatus === "running"
                    ? "running"
                    : "pending"
            }
            title="Processing"
          >
            <div className="grid gap-2">
              {processingStates.map((status) => (
                <div
                  className={[
                    "flex items-center justify-between rounded-ais-sm border px-3 py-2 text-sm",
                    selectedItem?.processingStatus === status
                      ? statusTone(status)
                      : "border-ais-border-soft bg-ais-panel text-ais-muted",
                  ].join(" ")}
                  key={status}
                >
                  <span>{processingLabel(status)}</span>
                  {selectedItem?.processingStatus === status ? <span className="ais-meta">current</span> : null}
                </div>
              ))}
            </div>
            {selectedItem?.processingStatus === "succeeded" && selectedItem.sampleId ? (
              <Link
                className="mt-4 inline-flex items-center gap-2 rounded-ais-sm border border-ais-amber px-3 py-2 text-sm font-medium text-ais-text transition duration-ais-base hover:bg-ais-panel"
                href={adminSampleEditRoute(selectedItem.sampleId)}
              >
                Open sample edit
                <ExternalLink aria-hidden="true" size={15} />
              </Link>
            ) : null}
          </StatusCard>

          {selectedItem?.duplicateWarnings.length ? (
            <section className="rounded-ais-md border border-ais-warning bg-ais-surface p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-1 text-ais-warning" aria-hidden="true" size={20} />
                <div>
                  <p className="ais-meta text-ais-warning">duplicate hash</p>
                  <h3 className="ais-title mt-2 text-xl text-ais-text">Possible duplicate source</h3>
                  <div className="mt-3 grid gap-3 text-sm leading-6 text-ais-muted">
                    {selectedItem.duplicateWarnings.map((warning) => (
                      <div key={`${warning.message}-${warning.matchingSampleIds.join(",")}`}>
                        <p>{warning.message}</p>
                        {warning.matchingSampleIds.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {warning.matchingSampleIds.map((sampleId) => (
                              <Link
                                className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-2 py-1 text-ais-text hover:border-ais-amber"
                                href={adminSampleEditRoute(sampleId)}
                                key={sampleId}
                              >
                                {sampleId}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </RouteShell>
  );
}

function validateUpload(file: File | null, formState: UploadFormState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!file) {
    issues.push({ field: "file", message: "Choose one WAV file before starting upload." });
    return issues;
  }

  if (!/\.wav$/i.test(file.name.trim())) {
    issues.push({ field: "filename", message: "The selected file must use a .wav extension." });
  }

  if (file.type && !WAV_CONTENT_TYPES.has(file.type.toLowerCase())) {
    issues.push({ field: "content_type", message: `The browser declared ${file.type}; only WAV content types are accepted.` });
  }

  if (file.size <= 0) {
    issues.push({ field: "file_size_bytes", message: "The selected file is empty." });
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    issues.push({ field: "file_size_bytes", message: "The selected file is larger than the 500 MB upload limit." });
  }

  if (!formState.categorySlug) {
    issues.push({ field: "category_slug", message: "Choose a category for the draft sample." });
  }

  if (!formState.sampleTypeSlug) {
    issues.push({ field: "sample_type_slug", message: "Choose a sample type for the draft sample." });
  }

  if (formState.sampleTypeSlug === "loop") {
    const bpm = Number(formState.bpm);
    if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 400) {
      issues.push({ field: "bpm", message: "Loop uploads require a BPM from 1 to 400." });
    }
  }

  return issues;
}

function validationRows(file: File, formState: UploadFormState) {
  const hasWavExtension = /\.wav$/i.test(file.name.trim());
  const contentType = declaredWavContentType(file);
  const contentTypeOk = !file.type || WAV_CONTENT_TYPES.has(file.type.toLowerCase());
  const sizeOk = file.size > 0 && file.size <= MAX_UPLOAD_SIZE_BYTES;
  const bpmOk =
    formState.sampleTypeSlug !== "loop" ||
    (Number.isFinite(Number(formState.bpm)) && Number(formState.bpm) > 0 && Number(formState.bpm) <= 400);

  return [
    { label: "Extension", value: hasWavExtension ? ".wav" : "invalid", ok: hasWavExtension },
    { label: "Declared type", value: contentType, ok: contentTypeOk },
    { label: "Size", value: formatBytes(file.size), ok: sizeOk },
    { label: "Draft fields", value: bpmOk ? "ready" : "needs BPM", ok: bpmOk },
  ];
}

function buildUploadSessionRequest(file: File, formState: UploadFormState): UploadSessionCreateRequest {
  return {
    mode: "single",
    filename: file.name,
    content_type: declaredWavContentType(file),
    file_size_bytes: file.size,
    category_slug: formState.categorySlug,
    sample_type_slug: formState.sampleTypeSlug,
    bpm: formState.sampleTypeSlug === "loop" ? Number(formState.bpm) : null,
    batch_id: null,
    bulk_position: null,
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
  const payload = (await readJson(response)) as UploadSessionCreateApiResponse | { ok: true; data: UploadSessionCreateResponse };

  if (!response.ok || isApiError(payload)) {
    throw new Error(isApiError(payload) ? payload.message : "Unable to create an upload session.");
  }

  const session = isRecord(payload) && payload.ok === true && "data" in payload ? payload.data : payload;

  if (!isUploadSession(session)) {
    throw new Error("Upload session response did not include a signed upload target.");
  }

  return session;
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

async function finalizeUploadIfNeeded(
  session: ExtendedUploadSessionResponse,
  itemId: string,
  updateQueueItem: ReturnType<typeof useAdminUploadStore.getState>["updateQueueItem"],
  activeRunRef: MutableRefObject<string | null>,
) {
  const finalizeTarget = getFinalizeTarget(session);

  if (!finalizeTarget) {
    updateQueueItem(itemId, {
      finalizeStatus: "not_required",
      errors: {
        finalize: null,
      },
    });
    return;
  }

  updateQueueItem(itemId, {
    status: "finalizing",
    finalizeStatus: "finalizing",
    errors: {
      finalize: null,
    },
  });

  const response = await fetch(finalizeTarget.url, {
    method: finalizeTarget.method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "single",
      sample_id: session.sample_id,
      processing_job_id: session.processing_job_id,
    }),
  });
  const payload = (await readJson(response)) as UploadSessionFinalizeApiResponse | null;

  if (!response.ok || isApiError(payload)) {
    const message = isApiError(payload) ? payload.message : "Unable to finalize the uploaded file.";
    updateQueueItem(itemId, {
      status: "failed",
      finalizeStatus: "failed",
      errors: {
        finalize: message,
      },
    });
    throw new Error(message);
  }

  if (isActiveRun(activeRunRef, itemId)) {
    updateQueueItem(itemId, {
      finalizeStatus: "complete",
      processingStatus:
        isRecord(payload) && payload.ok === true ? normalizeProcessingStatus(payload.data.processing_status) : undefined,
    });
  }
}

async function pollProcessingJob(
  processingJobId: string,
  itemId: string,
  activeRunRef: MutableRefObject<string | null>,
  updateQueueItem: ReturnType<typeof useAdminUploadStore.getState>["updateQueueItem"],
) {
  const supabase = createSupabaseBrowserClient();
  const startedAt = Date.now();

  while (isActiveRun(activeRunRef, itemId)) {
    const response = await fetch(`/api/admin/processing-jobs/${encodeURIComponent(processingJobId)}`);
    const payload = (await readJson(response)) as ProcessingJobStatusApiResponse | null;

    if (!response.ok || isApiError(payload)) {
      const message = isApiError(payload) ? payload.message : "Unable to read processing status.";
      updateQueueItem(itemId, {
        status: "failed",
        errors: {
          processing: message,
        },
      });
      throw new Error(message);
    }

    if (!isRecord(payload) || payload.ok !== true) {
      const message = "Processing job was not found after upload.";
      updateQueueItem(itemId, {
        status: "failed",
        errors: {
          processing: message,
        },
      });
      throw new Error(message);
    }

    const job = payload.data;
    const processingStatus = normalizeProcessingStatus(job.processing_status);
    const duplicateWarnings = await loadDuplicateWarnings(supabase, processingJobId);

    updateQueueItem(itemId, {
      status: processingStatus === "succeeded" ? "complete" : "processing",
      processingStatus,
      sampleId: job.sample_id,
      duplicateWarnings,
      errors: {
        processing: null,
      },
    });

    if (processingStatus === "succeeded") {
      return;
    }

    if (processingStatus === "failed" || processingStatus === "timed_out" || processingStatus === "canceled") {
      const message = terminalProcessingMessage(job);
      updateQueueItem(itemId, {
        status: "failed",
        errors: {
          processing: message,
        },
      });
      throw new Error(message);
    }

    if (Date.now() - startedAt > PROCESSING_MONITOR_TIMEOUT_MS) {
      const message = "Processing did not report completion within the local monitor window.";
      updateQueueItem(itemId, {
        status: "failed",
        errors: {
          processing: message,
        },
      });
      throw new Error(message);
    }

    await sleep(PROCESSING_POLL_INTERVAL_MS);
  }
}

function getFinalizeTarget(session: ExtendedUploadSessionResponse): FinalizeTarget | null {
  const url = session.finalize_url ?? session.finalize?.url ?? session.links?.finalize;

  return {
    url: url ?? "/api/admin/upload-sessions/finalize",
    method: session.finalize?.method ?? "POST",
  };
}

async function loadDuplicateWarnings(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  processingJobId: string,
) {
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("metadata")
    .eq("id", processingJobId)
    .maybeSingle();

  if (error || !data) {
    return [];
  }

  return extractDuplicateWarnings(data.metadata);
}

function extractDuplicateWarnings(metadata: unknown): DuplicateWarning[] {
  if (!isRecord(metadata)) {
    return [];
  }

  const warnings: DuplicateWarning[] = [];
  const rawWarnings = metadata.warnings;

  if (Array.isArray(rawWarnings)) {
    for (const warning of rawWarnings) {
      if (!isRecord(warning)) {
        continue;
      }

      const code = typeof warning.code === "string" ? warning.code : "";
      const message = typeof warning.message === "string" ? warning.message : "Matching hash exists on another sample.";
      if (!code.toLowerCase().includes("duplicate") && !message.toLowerCase().includes("duplicate")) {
        continue;
      }

      warnings.push({
        message,
        matchingSampleIds: dedupe(collectSampleIds(warning.metadata)),
      });
    }
  }

  const duplicateCheck = metadata.duplicate_check;
  const duplicateCheckIds = dedupe(collectSampleIds(duplicateCheck));
  if (duplicateCheckIds.length > 0) {
    warnings.push({
      message: "Worker metadata reported matching hash records.",
      matchingSampleIds: duplicateCheckIds,
    });
  }

  return dedupeWarnings(warnings);
}

function collectSampleIds(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSampleIds(item, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const preferredKeys = [
    "sample_id",
    "sampleId",
    "id",
    "matching_sample_ids",
    "matchingSampleIds",
    "matched_sample_ids",
    "sample_ids",
    "sampleIds",
    "matches",
    "duplicates",
  ];

  return preferredKeys.flatMap((key) => collectSampleIds(value[key], depth + 1));
}

function dedupeWarnings(warnings: DuplicateWarning[]) {
  const seen = new Set<string>();

  return warnings.filter((warning) => {
    const key = `${warning.message}:${warning.matchingSampleIds.join(",")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupe(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isUploadSession(value: unknown): value is ExtendedUploadSessionResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
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

function terminalProcessingMessage(job: ProcessingJobStatusResponse) {
  if (job.last_error_message) {
    return job.last_error_code ? `${job.last_error_message} (${job.last_error_code})` : job.last_error_message;
  }

  if (job.processing_status === "timed_out") {
    return "Audio processing timed out.";
  }

  if (job.processing_status === "canceled") {
    return "Audio processing was canceled.";
  }

  return "Audio processing failed.";
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

function declaredWavContentType(file: File) {
  return file.type && WAV_CONTENT_TYPES.has(file.type.toLowerCase()) ? file.type.toLowerCase() : "audio/wav";
}

function processingLabel(status: ProcessingStatus | null | undefined) {
  if (!status) {
    return "Waiting";
  }

  return status.replace("_", " ");
}

function finalizeLabel(status: "idle" | "not_required" | "finalizing" | "complete" | "failed") {
  if (status === "not_required") {
    return "No separate call";
  }

  if (status === "complete") {
    return "Complete";
  }

  return status.replace("_", " ");
}

function statusTone(status: ProcessingStatus) {
  if (status === "succeeded") {
    return "border-ais-success bg-ais-elevated text-ais-success";
  }

  if (status === "failed" || status === "timed_out") {
    return "border-ais-danger bg-ais-elevated text-ais-danger";
  }

  if (status === "running") {
    return "border-ais-amber bg-ais-elevated text-ais-amber";
  }

  return "border-ais-border bg-ais-elevated text-ais-text";
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Upload failed.";
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isActiveRun(activeRunRef: MutableRefObject<string | null>, itemId: string) {
  return activeRunRef.current === itemId;
}

function StatusCard({
  children,
  detail,
  error,
  icon,
  title,
}: {
  children: ReactNode;
  detail: string;
  error?: string | null;
  icon: "pending" | "running" | "success" | "failed";
  title: string;
}) {
  return (
    <section className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="ais-meta text-ais-amber">{title.toLowerCase()}</p>
          <h3 className="ais-title mt-2 text-xl text-ais-text">{detail}</h3>
        </div>
        <StatusIcon icon={icon} />
      </div>
      {children}
      {error ? <ErrorMessages className="mt-4" messages={[error]} title={title} /> : null}
    </section>
  );
}

function StatusIcon({ icon }: { icon: "pending" | "running" | "success" | "failed" }) {
  if (icon === "success") {
    return <CheckCircle2 className="text-ais-success" aria-hidden="true" size={22} />;
  }

  if (icon === "failed") {
    return <XCircle className="text-ais-danger" aria-hidden="true" size={22} />;
  }

  if (icon === "running") {
    return <Loader2 className="animate-spin text-ais-amber" aria-hidden="true" size={22} />;
  }

  return <Clock3 className="text-ais-faint" aria-hidden="true" size={22} />;
}

function ErrorMessages({
  className = "",
  messages,
  title,
}: {
  className?: string;
  messages: string[];
  title: string;
}) {
  return (
    <div className={`rounded-ais-sm border border-ais-danger bg-ais-bg p-3 ${className}`}>
      <p className="ais-meta text-ais-danger">{title.toLowerCase()} error</p>
      <ul className="mt-2 grid gap-1 text-sm leading-6 text-ais-text">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
