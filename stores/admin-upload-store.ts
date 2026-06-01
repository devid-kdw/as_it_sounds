"use client";

import { create } from "zustand";

export type ProcessingStatus = "queued" | "running" | "succeeded" | "failed" | "timed_out" | "canceled";

export type UploadTransferStatus =
  | "idle"
  | "validating"
  | "requesting_session"
  | "uploading"
  | "uploaded"
  | "failed";

export type FinalizeStatus = "idle" | "not_required" | "finalizing" | "complete" | "failed";

export type ValidationIssue = {
  field: string;
  message: string;
};

export type DuplicateWarning = {
  message: string;
  matchingSampleIds: string[];
};

export type UploadErrorState = {
  validation: string | null;
  upload: string | null;
  finalize: string | null;
  processing: string | null;
};

export type UploadQueueItem = {
  id: string;
  filename: string;
  fileSizeBytes: number;
  contentType: string;
  progress: number;
  status:
    | "queued"
    | "validating"
    | "requesting_session"
    | "uploading"
    | "uploaded"
    | "finalizing"
    | "processing"
    | "failed"
    | "complete";
  uploadStatus: UploadTransferStatus;
  finalizeStatus: FinalizeStatus;
  processingStatus: ProcessingStatus | null;
  validationIssues: ValidationIssue[];
  errors: UploadErrorState;
  sampleId: string | null;
  processingJobId: string | null;
  uploadBucket: string | null;
  uploadPath: string | null;
  duplicateWarnings: DuplicateWarning[];
  startedAt: string;
  updatedAt: string;
};

export type AdminUploadState = {
  queue: UploadQueueItem[];
  selectedQueueId: string | null;
  setQueue: (queue: UploadQueueItem[]) => void;
  beginSingleUpload: (file: File, validationIssues?: ValidationIssue[]) => string;
  updateQueueItem: (id: string, patch: UploadQueueItemPatch) => void;
  selectQueueItem: (id: string | null) => void;
  resetQueue: () => void;
};

export type UploadQueueItemPatch = Partial<
  Omit<UploadQueueItem, "errors" | "validationIssues" | "duplicateWarnings">
> & {
  errors?: Partial<UploadErrorState>;
  validationIssues?: ValidationIssue[];
  duplicateWarnings?: DuplicateWarning[];
};

const emptyErrors: UploadErrorState = {
  validation: null,
  upload: null,
  finalize: null,
  processing: null,
};

function createQueueId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useAdminUploadStore = create<AdminUploadState>((set) => ({
  queue: [],
  selectedQueueId: null,
  setQueue: (queue) => set({ queue }),
  beginSingleUpload: (file, validationIssues = []) => {
    const now = new Date().toISOString();
    const id = createQueueId();

    const item: UploadQueueItem = {
      id,
      filename: file.name,
      fileSizeBytes: file.size,
      contentType: file.type || "audio/wav",
      progress: 0,
      status: validationIssues.length > 0 ? "validating" : "queued",
      uploadStatus: "idle",
      finalizeStatus: "idle",
      processingStatus: null,
      validationIssues,
      errors: {
        ...emptyErrors,
        validation: validationIssues.length > 0 ? validationIssues[0]?.message ?? "The file is not ready to upload." : null,
      },
      sampleId: null,
      processingJobId: null,
      uploadBucket: null,
      uploadPath: null,
      duplicateWarnings: [],
      startedAt: now,
      updatedAt: now,
    };

    set({ queue: [item], selectedQueueId: id });

    return id;
  },
  updateQueueItem: (id, patch) =>
    set((state) => ({
      queue: state.queue.map((item) => {
        if (item.id !== id) {
          return item;
        }

        return {
          ...item,
          ...patch,
          errors: patch.errors ? { ...item.errors, ...patch.errors } : item.errors,
          validationIssues: patch.validationIssues ?? item.validationIssues,
          duplicateWarnings: patch.duplicateWarnings ?? item.duplicateWarnings,
          updatedAt: new Date().toISOString(),
        };
      }),
    })),
  selectQueueItem: (selectedQueueId) => set({ selectedQueueId }),
  resetQueue: () => set({ queue: [], selectedQueueId: null }),
}));
