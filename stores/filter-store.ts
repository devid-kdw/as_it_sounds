"use client";

import { create } from "zustand";

export type BrowseSort =
  | "relevance"
  | "newest"
  | "most_played"
  | "most_downloaded"
  | "most_favorited"
  | "featured"
  | "random_seeded";

export type FilterState = {
  query: string;
  moods: string[];
  categories: string[];
  sampleTypes: string[];
  bpmMin: number | null;
  bpmMax: number | null;
  musicalKey: string | null;
  loopableOnly: boolean;
  featuredOnly: boolean;
  sort: BrowseSort;
  setQuery: (query: string) => void;
  toggleMood: (slug: string) => void;
  toggleCategory: (slug: string) => void;
  resetFilters: () => void;
  hydrateFromUrl: (params: URLSearchParams) => void;
};

const initialState = {
  query: "",
  moods: [],
  categories: [],
  sampleTypes: [],
  bpmMin: null,
  bpmMax: null,
  musicalKey: null,
  loopableOnly: false,
  featuredOnly: false,
  sort: "relevance" as BrowseSort,
};

function toggleToken(tokens: string[], slug: string) {
  return tokens.includes(slug) ? tokens.filter((token) => token !== slug) : [...tokens, slug];
}

export const useFilterStore = create<FilterState>((set) => ({
  ...initialState,
  setQuery: (query) => set({ query }),
  toggleMood: (slug) => set((state) => ({ moods: toggleToken(state.moods, slug) })),
  toggleCategory: (slug) => set((state) => ({ categories: toggleToken(state.categories, slug) })),
  resetFilters: () => set(initialState),
  hydrateFromUrl: (params) =>
    set({
      query: params.get("q") ?? "",
      moods: params.getAll("mood"),
      categories: params.getAll("category"),
      sampleTypes: params.getAll("type"),
      sort: (params.get("sort") as BrowseSort | null) ?? "relevance",
    }),
}));
