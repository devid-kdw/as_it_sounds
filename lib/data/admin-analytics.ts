import "server-only";

import { AISUserSafeError } from "@/lib/errors";
import {
  createSupabaseAdminClient,
  type PublicTableRow,
  type SupabaseDatabaseClient,
} from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

type AdminAnalyticsOptions = {
  dateRangeDays?: number;
  supabase?: SupabaseDatabaseClient;
  now?: () => Date;
};

type SampleSummary = Pick<
  PublicTableRow<"samples">,
  "id" | "poetic_name" | "display_title" | "status" | "category_slug" | "sample_type_slug" | "featured"
>;

type ProcessingJobRow = Pick<
  PublicTableRow<"processing_jobs">,
  | "id"
  | "sample_id"
  | "job_type"
  | "status"
  | "attempts"
  | "last_error_code"
  | "last_error_message"
  | "metadata"
  | "created_at"
  | "updated_at"
>;

type SearchLogRow = Pick<PublicTableRow<"search_logs">, "query" | "filters" | "source" | "created_at">;
type SampleStatsRow = PublicTableRow<"sample_stats">;
type WanderEventRow = Pick<PublicTableRow<"wander_events">, "sample_id" | "mood_slug" | "action" | "created_at">;

export type AdminAnalyticsNoResultTrend = {
  key: string;
  query: string;
  filtersLabel: string;
  source: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  suggestedCopy: string;
  sampleSearchHref: string;
};

export type AdminAnalyticsTopSample = {
  sampleId: string;
  poeticName: string;
  displayTitle: string;
  status: string;
  categorySlug: string;
  sampleTypeSlug: string;
  featured: boolean;
  value: number;
  secondaryValue: number;
  secondaryLabel: string;
  hiddenTags: string[];
  curationCue: string;
};

export type AdminAnalyticsProcessingFailure = {
  id: string;
  sampleId: string | null;
  sampleDisplayTitle: string | null;
  samplePoeticName: string | null;
  jobType: string;
  status: string;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  originalFilename: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminAnalyticsWanderSampleIndicator = {
  sampleId: string;
  sampleDisplayTitle: string;
  samplePoeticName: string;
  sampleStatus: string;
  shownCount: number;
  skippedCount: number;
  playedCount: number;
  skipRate: number;
  curationCue: string;
};

export type AdminAnalyticsWanderMoodIndicator = {
  moodSlug: string;
  shownCount: number;
  skippedCount: number;
  playedCount: number;
  skipRate: number;
};

export type AdminAnalyticsDashboard = {
  generatedAt: string;
  dateRangeDays: number;
  dateRangeStart: string;
  totals: {
    noResultSearches: number;
    repeatedNoResultQueries: number;
    failedProcessingJobs: number;
    wanderShown: number;
    wanderSkipped: number;
    wanderPlayed: number;
  };
  noResultTrends: AdminAnalyticsNoResultTrend[];
  topPlayedSamples: AdminAnalyticsTopSample[];
  topDownloadedSamples: AdminAnalyticsTopSample[];
  topFavoritedSamples: AdminAnalyticsTopSample[];
  recentProcessingFailures: AdminAnalyticsProcessingFailure[];
  wanderSampleIndicators: AdminAnalyticsWanderSampleIndicator[];
  wanderMoodIndicators: AdminAnalyticsWanderMoodIndicator[];
};

export async function getAdminAnalyticsDashboard(
  options: AdminAnalyticsOptions = {},
): Promise<AdminAnalyticsDashboard> {
  const supabase = options.supabase ?? createSupabaseAdminClient();
  const dateRangeDays = options.dateRangeDays ?? 30;
  const now = options.now?.() ?? new Date();
  const dateRangeStart = new Date(now);
  dateRangeStart.setDate(dateRangeStart.getDate() - dateRangeDays);
  const sinceIso = dateRangeStart.toISOString();

  const [
    noResultResult,
    playedResult,
    downloadedResult,
    favoritedResult,
    failuresResult,
    wanderResult,
  ] = await Promise.all([
    supabase
      .from("search_logs")
      .select("query,filters,source,created_at")
      .eq("result_count", 0)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(500),
    loadTopStats(supabase, "play_count"),
    loadTopStats(supabase, "download_count"),
    loadTopStats(supabase, "favorite_count"),
    supabase
      .from("processing_jobs")
      .select("id,sample_id,job_type,status,attempts,last_error_code,last_error_message,metadata,created_at,updated_at")
      .in("status", ["failed", "timed_out"])
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("wander_events")
      .select("sample_id,mood_slug,action,created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  if (
    noResultResult.error ||
    playedResult.error ||
    downloadedResult.error ||
    favoritedResult.error ||
    failuresResult.error ||
    wanderResult.error
  ) {
    throw new AISUserSafeError("Unable to load admin analytics.", "admin_analytics_failed", 500);
  }

  const playedRows = playedResult.data ?? [];
  const downloadedRows = downloadedResult.data ?? [];
  const favoritedRows = favoritedResult.data ?? [];
  const failureRows = (failuresResult.data ?? []) as ProcessingJobRow[];
  const wanderRows = (wanderResult.data ?? []) as WanderEventRow[];
  const sampleIds = uniqueStrings([
    ...playedRows.map((row) => row.sample_id),
    ...downloadedRows.map((row) => row.sample_id),
    ...favoritedRows.map((row) => row.sample_id),
    ...failureRows.map((row) => row.sample_id),
    ...wanderRows.map((row) => row.sample_id),
  ]);
  const [samplesById, hiddenTagsBySample] = await Promise.all([
    loadSamplesById(supabase, sampleIds),
    loadHiddenTagsBySample(supabase, sampleIds),
  ]);
  const noResultTrends = buildNoResultTrends((noResultResult.data ?? []) as SearchLogRow[]);
  const wanderIndicators = buildWanderIndicators(wanderRows, samplesById);

  return {
    generatedAt: now.toISOString(),
    dateRangeDays,
    dateRangeStart: sinceIso,
    totals: {
      noResultSearches: (noResultResult.data ?? []).length,
      repeatedNoResultQueries: noResultTrends.filter((trend) => trend.count > 1).length,
      failedProcessingJobs: failureRows.length,
      wanderShown: wanderRows.filter((row) => row.action === "shown").length,
      wanderSkipped: wanderRows.filter((row) => row.action === "skipped").length,
      wanderPlayed: wanderRows.filter((row) => row.action === "played").length,
    },
    noResultTrends,
    topPlayedSamples: buildTopSamples(playedRows, "play_count", "downloads", "download_count", samplesById, hiddenTagsBySample),
    topDownloadedSamples: buildTopSamples(downloadedRows, "download_count", "plays", "play_count", samplesById, hiddenTagsBySample),
    topFavoritedSamples: buildTopSamples(favoritedRows, "favorite_count", "plays", "play_count", samplesById, hiddenTagsBySample),
    recentProcessingFailures: buildProcessingFailures(failureRows, samplesById),
    wanderSampleIndicators: wanderIndicators.samples,
    wanderMoodIndicators: wanderIndicators.moods,
  };
}

function loadTopStats(
  supabase: SupabaseDatabaseClient,
  metric: "play_count" | "download_count" | "favorite_count",
) {
  return supabase
    .from("sample_stats")
    .select("*")
    .gt(metric, 0)
    .order(metric, { ascending: false })
    .limit(8);
}

async function loadSamplesById(supabase: SupabaseDatabaseClient, sampleIds: string[]) {
  if (sampleIds.length === 0) {
    return new Map<string, SampleSummary>();
  }

  const { data, error } = await supabase
    .from("samples")
    .select("id,poetic_name,display_title,status,category_slug,sample_type_slug,featured")
    .in("id", sampleIds);

  if (error) {
    throw new AISUserSafeError("Unable to load analytics sample summaries.", "admin_analytics_failed", 500);
  }

  return new Map((data ?? []).map((sample) => [sample.id, sample as SampleSummary]));
}

async function loadHiddenTagsBySample(supabase: SupabaseDatabaseClient, sampleIds: string[]) {
  const grouped = new Map<string, string[]>();

  if (sampleIds.length === 0) {
    return grouped;
  }

  const { data, error } = await supabase
    .from("sample_hidden_tags")
    .select("sample_id,tag_slug")
    .in("sample_id", sampleIds)
    .order("tag_slug", { ascending: true });

  if (error) {
    throw new AISUserSafeError("Unable to load analytics hidden tags.", "admin_analytics_failed", 500);
  }

  for (const row of data ?? []) {
    const tags = grouped.get(row.sample_id) ?? [];
    tags.push(row.tag_slug);
    grouped.set(row.sample_id, tags);
  }

  return grouped;
}

function buildNoResultTrends(rows: SearchLogRow[]): AdminAnalyticsNoResultTrend[] {
  const grouped = new Map<string, AdminAnalyticsNoResultTrend>();

  for (const row of rows) {
    const query = normalizeQuery(row.query);
    const filtersLabel = summarizeFilters(row.filters);
    const key = `${row.source}:${query}:${filtersLabel}`;
    const current = grouped.get(key);

    if (current) {
      current.count += 1;
      current.firstSeenAt = row.created_at < current.firstSeenAt ? row.created_at : current.firstSeenAt;
      current.lastSeenAt = row.created_at > current.lastSeenAt ? row.created_at : current.lastSeenAt;
      continue;
    }

    grouped.set(key, {
      key,
      query,
      filtersLabel,
      source: row.source,
      count: 1,
      firstSeenAt: row.created_at,
      lastSeenAt: row.created_at,
      suggestedCopy: noResultSuggestedCopy(query, filtersLabel),
      sampleSearchHref: `/admin/samples?query=${encodeURIComponent(query)}`,
    });
  }

  return [...grouped.values()]
    .sort((left, right) => right.count - left.count || right.lastSeenAt.localeCompare(left.lastSeenAt))
    .slice(0, 10);
}

function buildTopSamples(
  rows: SampleStatsRow[],
  valueKey: "play_count" | "download_count" | "favorite_count",
  secondaryLabel: string,
  secondaryKey: "play_count" | "download_count" | "favorite_count",
  samplesById: Map<string, SampleSummary>,
  hiddenTagsBySample: Map<string, string[]>,
): AdminAnalyticsTopSample[] {
  return rows
    .map((row): AdminAnalyticsTopSample | null => {
      const sample = samplesById.get(row.sample_id);

      if (!sample) {
        return null;
      }

      const hiddenTags = hiddenTagsBySample.get(row.sample_id) ?? [];

      return {
        sampleId: sample.id,
        poeticName: sample.poetic_name,
        displayTitle: sample.display_title,
        status: String(sample.status),
        categorySlug: sample.category_slug,
        sampleTypeSlug: sample.sample_type_slug,
        featured: sample.featured,
        value: row[valueKey],
        secondaryValue: row[secondaryKey],
        secondaryLabel,
        hiddenTags,
        curationCue: topSampleCurationCue(valueKey, row, hiddenTags),
      };
    })
    .filter((item): item is AdminAnalyticsTopSample => item !== null);
}

function buildProcessingFailures(
  rows: ProcessingJobRow[],
  samplesById: Map<string, SampleSummary>,
): AdminAnalyticsProcessingFailure[] {
  return rows.map((row) => {
    const sample = row.sample_id ? samplesById.get(row.sample_id) : null;

    return {
      id: row.id,
      sampleId: row.sample_id,
      sampleDisplayTitle: sample?.display_title ?? null,
      samplePoeticName: sample?.poetic_name ?? null,
      jobType: row.job_type,
      status: row.status,
      attempts: row.attempts,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      originalFilename: getStringMetadata(row.metadata, "original_filename"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

function buildWanderIndicators(rows: WanderEventRow[], samplesById: Map<string, SampleSummary>) {
  const bySample = new Map<string, { shown: number; skipped: number; played: number }>();
  const byMood = new Map<string, { shown: number; skipped: number; played: number }>();

  for (const row of rows) {
    if (row.sample_id) {
      incrementWanderBucket(bySample, row.sample_id, row.action);
    }
    if (row.mood_slug) {
      incrementWanderBucket(byMood, row.mood_slug, row.action);
    }
  }

  const samples = [...bySample.entries()]
    .map(([sampleId, counts]): AdminAnalyticsWanderSampleIndicator | null => {
      const sample = samplesById.get(sampleId);

      if (!sample) {
        return null;
      }

      const skipRate = ratio(counts.skipped, counts.shown);

      return {
        sampleId,
        sampleDisplayTitle: sample.display_title,
        samplePoeticName: sample.poetic_name,
        sampleStatus: String(sample.status),
        shownCount: counts.shown,
        skippedCount: counts.skipped,
        playedCount: counts.played,
        skipRate,
        curationCue: wanderSampleCue(counts.shown, counts.skipped, counts.played),
      };
    })
    .filter((item): item is AdminAnalyticsWanderSampleIndicator => item !== null)
    .sort((left, right) => right.skippedCount - left.skippedCount || right.skipRate - left.skipRate)
    .slice(0, 8);

  const moods = [...byMood.entries()]
    .map(([moodSlug, counts]) => ({
      moodSlug,
      shownCount: counts.shown,
      skippedCount: counts.skipped,
      playedCount: counts.played,
      skipRate: ratio(counts.skipped, counts.shown),
    }))
    .sort((left, right) => right.skippedCount - left.skippedCount || right.skipRate - left.skipRate)
    .slice(0, 8);

  return { samples, moods };
}

function incrementWanderBucket(
  map: Map<string, { shown: number; skipped: number; played: number }>,
  key: string,
  action: string,
) {
  const current = map.get(key) ?? { shown: 0, skipped: 0, played: 0 };

  if (action === "shown") {
    current.shown += 1;
  } else if (action === "skipped") {
    current.skipped += 1;
  } else if (action === "played") {
    current.played += 1;
  }

  map.set(key, current);
}

function topSampleCurationCue(
  valueKey: "play_count" | "download_count" | "favorite_count",
  row: SampleStatsRow,
  hiddenTags: string[],
) {
  if (hiddenTags.length === 0) {
    return "Add hidden tags that explain why this sample is working.";
  }

  if (valueKey === "play_count" && row.download_count === 0) {
    return "Strong listening, no downloads yet. Check utility metadata and preview start.";
  }

  if (valueKey === "download_count") {
    return "Use this sample as a tagging reference for future uploads.";
  }

  return "Favorite signal is strong. Keep its mood and hidden-tag wording consistent.";
}

function noResultSuggestedCopy(query: string, filtersLabel: string) {
  if (query !== "untitled search") {
    return `Hidden tag candidate: ${query}`;
  }

  if (filtersLabel !== "no filters") {
    return `Coverage note: ${filtersLabel}`;
  }

  return "Coverage note: no-result search with no useful phrase";
}

function wanderSampleCue(shown: number, skipped: number, played: number) {
  const skipRate = ratio(skipped, shown);

  if (shown >= 3 && skipRate >= 0.7) {
    return "Review mood fit, hidden tags, and preview opening.";
  }

  if (played > skipped) {
    return "Wander fit looks healthy. Reuse similar tags intentionally.";
  }

  return "Watch for more events before changing metadata.";
}

function summarizeFilters(filters: Json) {
  const record = asRecord(filters);

  if (!record) {
    return "no filters";
  }

  const entries = Object.entries(record)
    .filter(([, value]) => hasFilterValue(value))
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${formatFilterValue(value)}`);

  return entries.length ? entries.join("; ") : "no filters";
}

function normalizeQuery(query: string | null) {
  const normalized = query?.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized ? normalized : "untitled search";
}

function formatFilterValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).join(", ");
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

function hasFilterValue(value: unknown) {
  if (value === null || value === undefined || value === "" || value === false) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function getStringMetadata(metadata: Json, key: string) {
  const value = asRecord(metadata)?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
