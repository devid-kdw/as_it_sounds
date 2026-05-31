"use client";

import { create } from "zustand";

export type UploadQueueItem = {
  id: string;
  filename: string;
  progress: number;
  status: "queued" | "validating" | "uploading" | "failed" | "complete";
  error: string | null;
};

export type AdminUploadState = {
  queue: UploadQueueItem[];
  selectedQueueId: string | null;
  setQueue: (queue: UploadQueueItem[]) => void;
  selectQueueItem: (id: string | null) => void;
  resetQueue: () => void;
};

export const useAdminUploadStore = create<AdminUploadState>((set) => ({
  queue: [],
  selectedQueueId: null,
  setQueue: (queue) => set({ queue }),
  selectQueueItem: (selectedQueueId) => set({ selectedQueueId }),
  resetQueue: () => set({ queue: [], selectedQueueId: null }),
}));
