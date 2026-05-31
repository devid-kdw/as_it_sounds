"use client";

import { create } from "zustand";

export type UiState = {
  isCommandOpen: boolean;
  isMobileNavOpen: boolean;
  openCommand: () => void;
  closeCommand: () => void;
  setMobileNavOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  isCommandOpen: false,
  isMobileNavOpen: false,
  openCommand: () => set({ isCommandOpen: true }),
  closeCommand: () => set({ isCommandOpen: false }),
  setMobileNavOpen: (isMobileNavOpen) => set({ isMobileNavOpen }),
}));
