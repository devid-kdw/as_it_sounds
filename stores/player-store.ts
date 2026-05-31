"use client";

import { create } from "zustand";

export type PlayerSurface = "browse" | "detail" | "wander" | "collection" | "admin-preview";

export type PlayerSampleInput = {
  sampleId: string;
  poeticName: string;
  title: string;
  previewUrl: string;
  peaksUrl: string;
  durationSeconds: number | null;
  sourceSurface: PlayerSurface;
};

export type PlayerState = {
  activeSampleId: string | null;
  activePoeticName: string | null;
  activeTitle: string | null;
  activePreviewUrl: string | null;
  activePeaksUrl: string | null;
  durationSeconds: number | null;
  currentTime: number;
  isPlaying: boolean;
  isLoading: boolean;
  isLooping: boolean;
  volume: number;
  error: string | null;
  sourceSurface: PlayerSurface | null;
  recentlyPlayedIds: string[];
  setActiveSample: (sample: PlayerSampleInput) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (timeSeconds: number) => void;
  setVolume: (volume: number) => void;
  setLooping: (looping: boolean) => void;
  setError: (message: string | null) => void;
};

export const usePlayerStore = create<PlayerState>((set) => ({
  activeSampleId: null,
  activePoeticName: null,
  activeTitle: null,
  activePreviewUrl: null,
  activePeaksUrl: null,
  durationSeconds: null,
  currentTime: 0,
  isPlaying: false,
  isLoading: false,
  isLooping: false,
  volume: 0.8,
  error: null,
  sourceSurface: null,
  recentlyPlayedIds: [],
  setActiveSample: (sample) =>
    set((state) => ({
      activeSampleId: sample.sampleId,
      activePoeticName: sample.poeticName,
      activeTitle: sample.title,
      activePreviewUrl: sample.previewUrl,
      activePeaksUrl: sample.peaksUrl,
      durationSeconds: sample.durationSeconds,
      currentTime: 0,
      isLoading: true,
      error: null,
      sourceSurface: sample.sourceSurface,
      recentlyPlayedIds: [
        sample.sampleId,
        ...state.recentlyPlayedIds.filter((id) => id !== sample.sampleId),
      ].slice(0, 20),
    })),
  play: () => set({ isPlaying: true, isLoading: false }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentTime: 0 }),
  seek: (timeSeconds) => set({ currentTime: Math.max(0, timeSeconds) }),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
  setLooping: (isLooping) => set({ isLooping }),
  setError: (error) => set({ error, isLoading: false }),
}));
