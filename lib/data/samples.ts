import "server-only";

import { AISUserSafeError } from "@/lib/errors";
import { getPublicAssetUrlsForSamples } from "@/lib/data/sample-assets";
import { getLookupLabels, getMoodsForSamples, taxonomyValue } from "@/lib/data/taxonomy";
import type { PublicTableRow, SupabaseDatabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  PublishedSampleListParams,
  PublishedSampleListResult,
  PublishedSampleSort,
  SampleCardView,
  SampleDetailView,
} from "@/types/sample";

const DEFAULT_PUBLIC_SAMPLE_LIMIT = 24;
const MAX_PUBLIC_SAMPLE_LIMIT = 50;
const PUBLIC_SAMPLE_SELECT =
  "id,poetic_name,display_title,display_title_is_custom,short_description,category_slug,sample_type_slug,bpm,musical_key,duration_seconds,loopable,featured,published_at";

type SampleRow = Pick<
  PublicTableRow<"samples">,
  | "id"
  | "poetic_name"
  | "display_title"
  | "display_title_is_custom"
  | "short_description"
  | "category_slug"
  | "sample_type_slug"
  | "bpm"
  | "musical_key"
  | "duration_seconds"
  | "loopable"
  | "featured"
  | "published_at"
>;

type SampleDataOptions = {
  supabase?: SupabaseDatabaseClient;
};

export async function getPublishedSamples(
  params: PublishedSampleListParams = {},
  options: SampleDataOptions = {},
): Promise<PublishedSampleListResult> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const limit = clampLimit(params.limit);
  const offset = clampOffset(params.offset);
  const moodSampleIds = await getMoodFilteredSampleIds(params.moodSlug, supabase);

  if (moodSampleIds && moodSampleIds.length === 0) {
    return { items: [], limit, offset, hasMore: false };
  }

  let query = supabase
    .from("samples")
    .select(PUBLIC_SAMPLE_SELECT)
    .eq("status", "published");

  if (params.categorySlug) {
    query = query.eq("category_slug", params.categorySlug);
  }

  if (params.sampleTypeSlug) {
    query = query.eq("sample_type_slug", params.sampleTypeSlug);
  }

  if (typeof params.loopable === "boolean") {
    query = query.eq("loopable", params.loopable);
  }

  if (typeof params.featured === "boolean") {
    query = query.eq("featured", params.featured);
  }

  if (moodSampleIds) {
    query = query.in("id", moodSampleIds);
  }

  const safeSearch = normalizePublicSearch(params.query);
  if (safeSearch) {
    const pattern = `%${safeSearch}%`;
    query = query.or(
      `poetic_name.ilike.${pattern},display_title.ilike.${pattern},short_description.ilike.${pattern}`,
    );
  }

  query = applyPublishedSampleSort(query, params.sort);

  const { data, error } = await query.range(offset, offset + limit);

  if (error) {
    throw new AISUserSafeError("Unable to load published samples.", "published_samples_failed", 500);
  }

  const rows = ((data ?? []) as SampleRow[]).slice(0, limit);
  const items = await buildSampleCardViews(rows, supabase);

  return {
    items,
    limit,
    offset,
    hasMore: (data ?? []).length > limit,
  };
}

export async function getSampleByPoeticName(
  poeticName: string,
  options: SampleDataOptions = {},
): Promise<SampleDetailView | null> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const safePoeticName = normalizePoeticName(poeticName);

  if (!safePoeticName) {
    return null;
  }

  const { data, error } = await supabase
    .from("samples")
    .select(PUBLIC_SAMPLE_SELECT)
    .eq("status", "published")
    .eq("poetic_name", safePoeticName)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load the published sample.", "published_sample_failed", 500);
  }

  if (!data) {
    return null;
  }

  const [sample] = await buildSampleCardViews([data as SampleRow], supabase);

  return {
    ...sample,
    publishedAt: data.published_at,
  };
}

export async function getPublishedSampleForPlayback(
  sampleId: string,
  options: SampleDataOptions = {},
): Promise<SampleCardView | null> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());

  const { data, error } = await supabase
    .from("samples")
    .select(PUBLIC_SAMPLE_SELECT)
    .eq("status", "published")
    .eq("id", sampleId)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load the playable sample.", "published_sample_playback_failed", 500);
  }

  if (!data) {
    return null;
  }

  const [sample] = await buildSampleCardViews([data as SampleRow], supabase);
  return sample;
}

export async function getFeaturedSamples(
  limit = 8,
  options: SampleDataOptions = {},
): Promise<SampleCardView[]> {
  const result = await getPublishedSamples(
    {
      featured: true,
      limit,
      sort: "featured",
    },
    options,
  );

  return result.items;
}

export async function getAdminSamples(): Promise<never> {
  throw new AISUserSafeError("Admin sample queries are implemented in lib/admin-samples.ts.", "admin_samples_wrong_module", 501);
}

export async function getAdminSampleById(): Promise<never> {
  throw new AISUserSafeError("Admin sample queries are implemented in lib/admin-samples.ts.", "admin_samples_wrong_module", 501);
}

async function buildSampleCardViews(rows: SampleRow[], supabase: SupabaseDatabaseClient): Promise<SampleCardView[]> {
  const sampleIds = rows.map((row) => row.id);
  const [categoryLabels, sampleTypeLabels, moodsBySample, assetUrlsBySample] = await Promise.all([
    getLookupLabels("categories", rows.map((row) => row.category_slug), supabase),
    getLookupLabels("sample_types", rows.map((row) => row.sample_type_slug), supabase),
    getMoodsForSamples(sampleIds, supabase),
    getPublicAssetUrlsForSamples(sampleIds, { supabase }),
  ]);

  return rows.map((row) => {
    const assetUrls = assetUrlsBySample.get(row.id);

    return {
      id: row.id,
      poeticName: row.poetic_name,
      displayTitle: row.display_title,
      displayTitleIsCustom: row.display_title_is_custom,
      shortDescription: row.short_description,
      category: taxonomyValue(row.category_slug, categoryLabels.get(row.category_slug)),
      sampleType: taxonomyValue(row.sample_type_slug, sampleTypeLabels.get(row.sample_type_slug)),
      moods: moodsBySample.get(row.id) ?? [],
      bpm: row.bpm,
      musicalKey: row.musical_key,
      durationSeconds: row.duration_seconds,
      loopable: row.loopable,
      featured: row.featured,
      previewAssetUrl: assetUrls?.previewAssetUrl ?? null,
      waveformPeaksUrl: assetUrls?.waveformPeaksUrl ?? null,
      isFavoritedByCurrentUser: false,
    };
  });
}

async function getMoodFilteredSampleIds(
  moodSlug: string | null | undefined,
  supabase: SupabaseDatabaseClient,
): Promise<string[] | null> {
  if (!moodSlug) {
    return null;
  }

  const { data, error } = await supabase
    .from("sample_moods")
    .select("sample_id")
    .eq("mood_slug", moodSlug);

  if (error) {
    throw new AISUserSafeError("Unable to load mood-filtered samples.", "sample_mood_filter_failed", 500);
  }

  return [...new Set((data ?? []).map((row) => row.sample_id))];
}

type OrderableQuery = {
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => OrderableQuery;
};

function applyPublishedSampleSort<QueryBuilder>(query: QueryBuilder, sort: PublishedSampleSort | null | undefined): QueryBuilder {
  const sortableQuery = query as unknown as OrderableQuery;
  let orderedQuery: OrderableQuery;

  switch (sort) {
    case "oldest":
      orderedQuery = sortableQuery.order("published_at", { ascending: true }).order("created_at", { ascending: true });
      break;
    case "title":
      orderedQuery = sortableQuery.order("display_title", { ascending: true }).order("published_at", { ascending: false });
      break;
    case "duration":
      orderedQuery = sortableQuery.order("duration_seconds", { ascending: true, nullsFirst: false }).order("published_at", {
        ascending: false,
      });
      break;
    case "featured":
      orderedQuery = sortableQuery.order("featured", { ascending: false }).order("published_at", { ascending: false });
      break;
    case "newest":
    default:
      orderedQuery = sortableQuery.order("published_at", { ascending: false }).order("created_at", { ascending: false });
      break;
  }

  return orderedQuery as unknown as QueryBuilder;
}

function clampLimit(limit: number | null | undefined): number {
  if (!Number.isFinite(limit ?? NaN)) {
    return DEFAULT_PUBLIC_SAMPLE_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit as number), 1), MAX_PUBLIC_SAMPLE_LIMIT);
}

function clampOffset(offset: number | null | undefined): number {
  if (!Number.isFinite(offset ?? NaN)) {
    return 0;
  }

  return Math.max(Math.trunc(offset as number), 0);
}

function normalizePoeticName(poeticName: string): string {
  return decodeURIComponent(poeticName).trim().slice(0, 160);
}

function normalizePublicSearch(query: string | null | undefined): string | null {
  const safeQuery = query?.trim().replace(/[%,()]/g, " ").replace(/\s+/g, " ").slice(0, 80) ?? "";
  return safeQuery.length > 0 ? safeQuery : null;
}
