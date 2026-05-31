"use client";

import { create } from "zustand";

export type CollectionUiState = {
  isModalOpen: boolean;
  targetSampleId: string | null;
  optimisticCollectionIdsBySample: Record<string, string[]>;
  openForSample: (sampleId: string) => void;
  close: () => void;
  setOptimisticMembership: (sampleId: string, collectionIds: string[]) => void;
};

export const useCollectionUiStore = create<CollectionUiState>((set) => ({
  isModalOpen: false,
  targetSampleId: null,
  optimisticCollectionIdsBySample: {},
  openForSample: (targetSampleId) => set({ isModalOpen: true, targetSampleId }),
  close: () => set({ isModalOpen: false, targetSampleId: null }),
  setOptimisticMembership: (sampleId, collectionIds) =>
    set((state) => ({
      optimisticCollectionIdsBySample: {
        ...state.optimisticCollectionIdsBySample,
        [sampleId]: collectionIds,
      },
    })),
}));
