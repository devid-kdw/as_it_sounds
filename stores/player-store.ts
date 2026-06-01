"use client";

import { create } from "zustand";

export type PlayerSurface = "browse" | "detail" | "wander" | "collection" | "admin-preview";

export type PlayerSampleInput = {
  sampleId: string;
  poeticName: string;
  title: string;
  previewUrl: string | null;
  peaksUrl: string | null;
  durationSeconds: number | null;
  loopable: boolean;
  sourceSurface: PlayerSurface;
};

export type PlayerState = {
  activeSampleId: string | null;
  activePoeticName: string | null;
  activeTitle: string | null;
  activePreviewUrl: string | null;
  activePeaksUrl: string | null;
  activeLoopable: boolean;
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
  setCurrentTime: (timeSeconds: number) => void;
  setLoading: (loading: boolean) => void;
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
  activeLoopable: false,
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
      activeLoopable: sample.loopable,
      durationSeconds: sample.durationSeconds,
      currentTime: 0,
      isLoading: false,
      isLooping: sample.loopable ? state.isLooping : false,
      error: null,
      sourceSurface: sample.sourceSurface,
      recentlyPlayedIds: [
        sample.sampleId,
        ...state.recentlyPlayedIds.filter((id) => id !== sample.sampleId),
      ].slice(0, 20),
    })),
  play: () => set({ isPlaying: true, isLoading: true, error: null }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentTime: 0 }),
  seek: (timeSeconds) => set({ currentTime: Math.max(0, timeSeconds) }),
  setCurrentTime: (timeSeconds) => set({ currentTime: Math.max(0, timeSeconds) }),
  setLoading: (isLoading) => set({ isLoading }),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
  setLooping: (isLooping) => set((state) => ({ isLooping: state.activeLoopable ? isLooping : false })),
  setError: (error) => set({ error, isLoading: false, isPlaying: false }),
}));
