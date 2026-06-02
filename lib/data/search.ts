import "server-only";

import { AISUserSafeError } from "@/lib/errors";
import { createStorageProvider, type StorageProvider } from "@/lib/storage";
import type { SupabaseDatabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  SearchInput,
  SearchLogInput,
  SearchResponse,
  SearchSampleAsset,
  SearchSampleResult,
  SearchSort,
  SimilarOptions,
  SuggestedCategory,
  WanderInput,
} from "@/types/api";
import type { Json } from "@/types/database.types";
import type { SampleTaxonomyValue } from "@/types/sample";

export const SEARCH_DEFAULT_PAGE_SIZE = 24;
export const SEARCH_MAX_PAGE_SIZE = 60;
export const SEARCH_MAX_PAGE = 100;
export const SEARCH_MAX_QUERY_LENGTH = 160;
export const SEARCH_MAX_MOODS = 5;
export const SEARCH_MAX_CATEGORIES = 7;
export const SEARCH_MAX_SAMPLE_TYPES = 6;
export const SEARCH_MIN_BPM = 1;
export const SEARCH_MAX_BPM = 400;

const SEARCH_SORTS = [
  "relevance",
  "newest",
  "most_played",
  "most_downloaded",
  "most_favorited",
  "featured",
  "random_seeded",
] as const satisfies SearchSort[];

type SearchDataOptions = {
  supabase?: SupabaseDatabaseClient;
  storage?: StorageProvider;
};

type NormalizedSearchInput = {
  query: string | null;
  moods: string[];
  categories: string[];
  sampleTypes: string[];
  bpmMin: number | null;
  bpmMax: number | null;
  musicalKey: string | null;
  loopable: boolean | null;
  featuredOnly: boolean;
  albumId: string | null;
  sort: SearchSort | null;
  page: number;
  pageSize: number;
  seed: string | null;
  source: "web" | "plugin";
};

type SearchSamplesRpcArgs = {
  p_query: string | null;
  p_moods: string[] | null;
  p_categories: string[] | null;
  p_sample_types: string[] | null;
  p_bpm_min: number | null;
  p_bpm_max: number | null;
  p_musical_key: string | null;
  p_loopable: boolean | null;
  p_featured_only: boolean;
  p_album_id: string | null;
  p_sort: SearchSort;
  p_page: number;
  p_page_size: number;
  p_seed: string | null;
};

type SearchSamplesRpcRow = {
  sample_id: string;
  poetic_name: string;
  display_title: string;
  display_title_is_custom: boolean;
  short_description: string | null;
  category_slug: string;
  category_label: string;
  sample_type_slug: string;
  sample_type_label: string;
  bpm: number | string | null;
  musical_key: string | null;
  duration_seconds: number | string | null;
  loopable: boolean;
  featured: boolean;
  published_at: string | null;
  preview_bucket: string | null;
  preview_object_path: string | null;
  waveform_bucket: string | null;
  waveform_object_path: string | null;
  play_count: number | string | null;
  download_count: number | string | null;
  favorite_count: number | string | null;
  score: number | string | null;
  total_count: number | string | null;
};

type SearchSamplesRpcClient = SupabaseDatabaseClient & {
  rpc: (
    fn: "search_samples",
    args: SearchSamplesRpcArgs,
  ) => Promise<{ data: SearchSamplesRpcRow[] | null; error: { message?: string } | null }>;
};

type MoodRow = {
  sample_id: string;
  mood_slug: string;
  sort_order: number;
};

type LookupRow = {
  slug: string;
  label: string;
};

type NormalizedQuery = {
  normalizedQuery: string | null;
  rawSlugProbe: string | null;
};

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type SearchParamsLike = URLSearchParams | SearchParamsRecord;

export function parseSearchParams(params: SearchParamsLike): SearchInput {
  return normalizeSearchInput({
    query: getSearchParam(params, "q"),
    moods: parseCsvParam(getSearchParam(params, "mood")),
    categories: parseCsvParam(getSearchParam(params, "cat")),
    sampleTypes: parseCsvParam(getSearchParam(params, "type")),
    bpmMin: parseNumberParam(getSearchParam(params, "bpm_min")),
    bpmMax: parseNumberParam(getSearchParam(params, "bpm_max")),
    musicalKey: getSearchParam(params, "key"),
    loopable: parseBooleanParam(getSearchParam(params, "loopable")),
    featuredOnly: parseBooleanParam(getSearchParam(params, "featured")) ?? false,
    albumId: getSearchParam(params, "album"),
    sort: parseSearchSort(getSearchParam(params, "sort")),
    page: parseIntegerParam(getSearchParam(params, "page")),
    pageSize: parseIntegerParam(getSearchParam(params, "size")),
    seed: getSearchParam(params, "seed"),
    source: getSearchParam(params, "source") === "plugin" ? "plugin" : "web",
  });
}

export function serializeSearchParams(input: SearchInput = {}): string {
  const normalized = normalizeSearchInput(input);
  const params = new URLSearchParams();
  const defaultSort = normalized.query ? "relevance" : "newest";

  if (normalized.query) params.set("q", normalized.query);
  if (normalized.moods.length > 0) params.set("mood", normalized.moods.join(","));
  if (normalized.categories.length > 0) params.set("cat", normalized.categories.join(","));
  if (normalized.sampleTypes.length > 0) params.set("type", normalized.sampleTypes.join(","));
  if (normalized.bpmMin !== null) params.set("bpm_min", String(normalized.bpmMin));
  if (normalized.bpmMax !== null) params.set("bpm_max", String(normalized.bpmMax));
  if (normalized.musicalKey) params.set("key", normalized.musicalKey);
  if (normalized.loopable === true) params.set("loopable", "true");
  if (normalized.featuredOnly) params.set("featured", "true");
  if (normalized.albumId) params.set("album", normalized.albumId);
  if (normalized.sort && normalized.sort !== defaultSort) params.set("sort", normalized.sort);
  if (normalized.page > 1) params.set("page", String(normalized.page));
  if (normalized.pageSize !== SEARCH_DEFAULT_PAGE_SIZE) params.set("size", String(normalized.pageSize));
  if (normalized.seed) params.set("seed", normalized.seed);
  if (normalized.source === "plugin") params.set("source", "plugin");

  return params.toString();
}

export function normalizeSearchInput(input: SearchInput = {}): NormalizedSearchInput {
  const { normalizedQuery } = normalizeSearchQuery(input.query ?? null);
  const bpmMin = clampOptionalNumber(input.bpmMin, SEARCH_MIN_BPM, SEARCH_MAX_BPM);
  const bpmMax = clampOptionalNumber(input.bpmMax, SEARCH_MIN_BPM, SEARCH_MAX_BPM);
  const normalizedBpmMin = bpmMin !== null && bpmMax !== null ? Math.min(bpmMin, bpmMax) : bpmMin;
  const normalizedBpmMax = bpmMin !== null && bpmMax !== null ? Math.max(bpmMin, bpmMax) : bpmMax;

  return {
    query: normalizedQuery,
    moods: uniqueCleanSlugs(input.moods).slice(0, SEARCH_MAX_MOODS),
    categories: uniqueCleanSlugs(input.categories).slice(0, SEARCH_MAX_CATEGORIES),
    sampleTypes: uniqueCleanSlugs(input.sampleTypes).slice(0, SEARCH_MAX_SAMPLE_TYPES),
    bpmMin: normalizedBpmMin,
    bpmMax: normalizedBpmMax,
    musicalKey: normalizeMusicalKey(input.musicalKey),
    loopable: typeof input.loopable === "boolean" ? input.loopable : null,
    featuredOnly: input.featuredOnly === true,
    albumId: normalizeUuid(input.albumId),
    sort: input.sort && SEARCH_SORTS.includes(input.sort) ? input.sort : null,
    page: clampInteger(input.page, 1, SEARCH_MAX_PAGE, 1),
    pageSize: clampInteger(input.pageSize, 1, SEARCH_MAX_PAGE_SIZE, SEARCH_DEFAULT_PAGE_SIZE),
    seed: normalizeSeed(input.seed),
    source: input.source === "plugin" ? "plugin" : "web",
  };
}

export function normalizeSearchQuery(query?: string | null): NormalizedQuery {
  const cleanedRaw = cleanQueryText(query ?? "").slice(0, SEARCH_MAX_QUERY_LENGTH).trim();
  const rawSlugProbe = cleanedRaw
    ? cleanedRaw.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]+/g, "")
    : "";
  const normalizedText = cleanedRaw.replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase().trim();

  return {
    normalizedQuery: normalizedText || null,
    rawSlugProbe: rawSlugProbe || null,
  };
}

export async function searchSamples(
  input: SearchInput = {},
  options: SearchDataOptions = {},
): Promise<SearchResponse> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const storage = options.storage ?? createStorageProvider(supabase);
  const appliedFilters = normalizeSearchInput(input);
  const page = appliedFilters.page;
  const pageSize = appliedFilters.pageSize;
  const sort = appliedFilters.sort ?? (appliedFilters.query ? "relevance" : "newest");
  const { data, error } = await (supabase as SearchSamplesRpcClient).rpc("search_samples", {
    p_query: appliedFilters.query,
    p_moods: appliedFilters.moods.length > 0 ? appliedFilters.moods : null,
    p_categories: appliedFilters.categories.length > 0 ? appliedFilters.categories : null,
    p_sample_types: appliedFilters.sampleTypes.length > 0 ? appliedFilters.sampleTypes : null,
    p_bpm_min: appliedFilters.bpmMin,
    p_bpm_max: appliedFilters.bpmMax,
    p_musical_key: appliedFilters.musicalKey,
    p_loopable: appliedFilters.loopable,
    p_featured_only: appliedFilters.featuredOnly,
    p_album_id: appliedFilters.albumId,
    p_sort: sort,
    p_page: page,
    p_page_size: pageSize,
    p_seed: appliedFilters.seed,
  });

  if (error) {
    throw new AISUserSafeError("Unable to search published samples.", "search_samples_failed", 500);
  }

  const rows = data ?? [];
  const results = await buildRpcSearchSampleResults(rows, supabase, storage);
  const total = rows.length > 0 ? toInteger(rows[0]?.total_count, 0) : 0;

  return {
    results,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    normalizedQuery: appliedFilters.query,
    appliedFilters: { ...appliedFilters, sort },
    suggestedCategories: await getSuggestedCategoriesForMoods(appliedFilters.moods, { supabase }),
  };
}

export async function getSuggestedCategoriesForMoods(
  moods: string[],
  options: SearchDataOptions = {},
): Promise<SuggestedCategory[]> {
  const safeMoods = uniqueCleanSlugs(moods).slice(0, SEARCH_MAX_MOODS);

  if (safeMoods.length === 0) {
    return [];
  }

  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const { data, error } = await supabase
    .from("mood_category_suggestions")
    .select("category_slug,weight,categories(label)")
    .in("mood_slug", safeMoods)
    .order("weight", { ascending: false })
    .limit(8);

  if (error) {
    return [];
  }

  const suggestions = new Map<string, SuggestedCategory>();

  for (const row of (data ?? []) as unknown as Array<{
    category_slug: string;
    weight: number;
    categories?: { label: string | null } | null;
  }>) {
    const existing = suggestions.get(row.category_slug);
    const weight = Number(row.weight) || 0;

    suggestions.set(row.category_slug, {
      slug: row.category_slug,
      label: row.categories?.label ?? titleizeSlug(row.category_slug),
      weight: existing ? Math.max(existing.weight, weight) : weight,
      reason: "mood_suggestion",
    });
  }

  return [...suggestions.values()].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}

export async function getFeaturedSamples(
  limit = 8,
  options: SearchDataOptions = {},
): Promise<SearchSampleResult[]> {
  const response = await searchSamples(
    {
      featuredOnly: true,
      sort: "featured",
      page: 1,
      pageSize: limit,
      source: "web",
    },
    options,
  );

  return response.results;
}

export async function getSimilarSamples(
  sampleId: string,
  options: SimilarOptions & SearchDataOptions = {},
): Promise<SearchSampleResult[]> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const { data: sample, error } = await supabase
    .from("samples")
    .select("category_slug,sample_type_slug")
    .eq("status", "published")
    .eq("id", sampleId)
    .maybeSingle();

  if (error || !sample) {
    return [];
  }

  const limit = options.limit ?? 6;
  const response = await searchSamples(
    {
      categories: [sample.category_slug],
      sampleTypes: [sample.sample_type_slug],
      pageSize: limit + 1,
      sort: "relevance",
      source: options.source ?? "web",
    },
    { supabase, storage: options.storage },
  );

  return response.results.filter((result) => result.id !== sampleId).slice(0, limit);
}

export async function getWanderSamples(
  input: WanderInput = {},
  options: SearchDataOptions = {},
): Promise<SearchSampleResult[]> {
  const response = await searchSamples(
    {
      ...input,
      page: 1,
      pageSize: input.limit ?? input.pageSize ?? SEARCH_DEFAULT_PAGE_SIZE,
      sort: "random_seeded",
    },
    options,
  );

  return response.results;
}

export async function logSearchEvent(input: SearchLogInput): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const normalizedFilters = input.filters ? normalizeSearchInput(input.filters) : normalizeSearchInput({});
    const filters = buildPrivacySafeLogFilters(normalizedFilters);

    await supabase.from("search_logs").insert({
      user_id: input.userId ?? null,
      source: input.source === "plugin" ? "plugin" : "web",
      query: normalizeSearchQuery(input.query ?? input.filters?.query ?? null).normalizedQuery,
      filters,
      result_count: Math.max(0, Math.trunc(input.resultCount ?? 0)),
      clicked_sample_id: normalizeUuid(input.clickedSampleId) ?? null,
    });
  } catch {
    // Search logging is intentionally best-effort so discovery never fails due to analytics.
  }
}

async function buildRpcSearchSampleResults(
  rows: SearchSamplesRpcRow[],
  supabase: SupabaseDatabaseClient,
  storage: StorageProvider,
): Promise<SearchSampleResult[]> {
  const moodsBySample = await getMoodsForSamples(rows.map((row) => row.sample_id), supabase);

  return rows.map((row) => {
    const previewAsset = buildRpcAssetRef(row.preview_bucket, row.preview_object_path, storage);
    const waveformAsset = buildRpcAssetRef(row.waveform_bucket, row.waveform_object_path, storage);

    return {
      id: row.sample_id,
      poeticName: row.poetic_name,
      displayTitle: row.display_title,
      displayTitleIsCustom: row.display_title_is_custom,
      shortDescription: row.short_description,
      category: taxonomyValue(row.category_slug, row.category_label),
      sampleType: taxonomyValue(row.sample_type_slug, row.sample_type_label),
      moods: moodsBySample.get(row.sample_id) ?? [],
      bpm: toNullableNumber(row.bpm),
      musicalKey: row.musical_key,
      durationSeconds: toNullableNumber(row.duration_seconds),
      loopable: row.loopable,
      featured: row.featured,
      publishedAt: row.published_at,
      previewAsset,
      waveformAsset,
      previewAssetUrl: previewAsset?.publicUrl ?? null,
      waveformPeaksUrl: waveformAsset?.publicUrl ?? null,
      stats: {
        playCount: toInteger(row.play_count, 0),
        downloadCount: toInteger(row.download_count, 0),
        favoriteCount: toInteger(row.favorite_count, 0),
      },
      score: toNullableNumber(row.score) ?? undefined,
      isFavoritedByCurrentUser: false,
    };
  });
}

function buildRpcAssetRef(bucket: string | null, objectPath: string | null, storage: StorageProvider): SearchSampleAsset | null {
  if (!bucket || !objectPath) {
    return null;
  }

  return {
    bucket,
    objectPath,
    publicUrl: getSafePublicUrl(bucket, objectPath, storage),
  };
}

async function getMoodsForSamples(
  sampleIds: string[],
  supabase: SupabaseDatabaseClient,
): Promise<Map<string, SampleTaxonomyValue[]>> {
  const moodsBySample = new Map<string, SampleTaxonomyValue[]>();
  const uniqueSampleIds = uniqueStrings(sampleIds);

  if (uniqueSampleIds.length === 0) {
    return moodsBySample;
  }

  const { data: moodRows, error } = await supabase
    .from("sample_moods")
    .select("sample_id,mood_slug,sort_order")
    .in("sample_id", uniqueSampleIds)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AISUserSafeError("Unable to load sample moods.", "search_moods_failed", 500);
  }

  const rows = (moodRows ?? []) as MoodRow[];
  const labels = await getLookupLabels("moods", rows.map((row) => row.mood_slug), supabase);

  for (const row of rows) {
    const current = moodsBySample.get(row.sample_id) ?? [];
    current.push(taxonomyValue(row.mood_slug, labels.get(row.mood_slug)));
    moodsBySample.set(row.sample_id, current);
  }

  return moodsBySample;
}

async function getLookupLabels(
  table: "moods",
  slugs: string[],
  supabase: SupabaseDatabaseClient,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const uniqueSlugs = uniqueStrings(slugs);

  if (uniqueSlugs.length === 0) {
    return labels;
  }

  const { data, error } = await supabase.from(table).select("slug,label").in("slug", uniqueSlugs);

  if (error) {
    throw new AISUserSafeError("Unable to load search taxonomy.", "search_taxonomy_failed", 500);
  }

  for (const row of (data ?? []) as LookupRow[]) {
    labels.set(row.slug, row.label);
  }

  return labels;
}

function getSafePublicUrl(bucket: string, objectPath: string, storage: StorageProvider) {
  try {
    return storage.getPublicUrl({ bucket, objectPath });
  } catch {
    return undefined;
  }
}

function taxonomyValue(slug: string, label?: string | null): SampleTaxonomyValue {
  return {
    slug,
    label: label ?? titleizeSlug(slug),
  };
}

function parseCsvParam(value: string | null) {
  return value ? value.split(",") : [];
}

function getSearchParam(params: SearchParamsLike, key: string) {
  if (params instanceof URLSearchParams) {
    return params.get(key);
  }

  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function parseBooleanParam(value: string | null) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function parseNumberParam(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerParam(value: string | null) {
  const parsed = parseNumberParam(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function parseSearchSort(value: string | null): SearchSort | null {
  return value && SEARCH_SORTS.includes(value as SearchSort) ? (value as SearchSort) : null;
}

function cleanQueryText(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^\p{L}\p{N}\s'_-]+/gu, " ").replace(/\s+/g, " ");
}

function uniqueCleanSlugs(values?: string[] | null) {
  return uniqueStrings(
    (values ?? [])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim().toLowerCase())
      .map((value) => value.replace(/[^a-z0-9_-]/g, ""))
      .filter(Boolean),
  );
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeMusicalKey(value?: string | null) {
  const normalized = (value ?? "").trim().replace(/[^a-zA-Z0-9#bm_-]/g, "");
  return normalized || null;
}

function normalizeUuid(value?: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

function normalizeSeed(value?: string | null) {
  const normalized = (value ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return normalized || null;
}

function clampOptionalNumber(value: number | null | undefined, min: number, max: number) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(Math.max(value, min), max);
}

function clampInteger(value: number | null | undefined, min: number, max: number, fallback: number) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: number | string | null | undefined, fallback: number) {
  const parsed = toNullableNumber(value);
  return parsed === null ? fallback : Math.trunc(parsed);
}

function titleizeSlug(slug: string) {
  return slug
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildPrivacySafeLogFilters(filters: NormalizedSearchInput): Json {
  return {
    moods: filters.moods,
    categories: filters.categories,
    sampleTypes: filters.sampleTypes,
    bpmMin: filters.bpmMin,
    bpmMax: filters.bpmMax,
    musicalKey: filters.musicalKey,
    loopable: filters.loopable,
    featuredOnly: filters.featuredOnly,
    albumId: filters.albumId,
    sort: filters.sort,
    page: filters.page,
    pageSize: filters.pageSize,
    source: filters.source,
  };
}
