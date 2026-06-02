import "server-only";

import { AISUserSafeError } from "@/lib/errors";
import type { SupabaseDatabaseClient } from "@/lib/supabase/admin";
import type { SampleTaxonomyValue } from "@/types/sample";

type LookupTable = "categories" | "sample_types" | "moods";

type MoodRow = {
  sample_id: string;
  mood_slug: string;
  sort_order: number;
};

type LookupRow = {
  slug: string;
  label: string;
};

export async function getLookupLabels(
  table: LookupTable,
  slugs: string[],
  supabase: SupabaseDatabaseClient,
): Promise<Map<string, string>> {
  const uniqueSlugs = [...new Set(slugs.filter(Boolean))];
  const labels = new Map<string, string>();

  if (uniqueSlugs.length === 0) {
    return labels;
  }

  const { data, error } = await supabase.from(table).select("slug,label").in("slug", uniqueSlugs);

  if (error) {
    throw new AISUserSafeError("Unable to load sample taxonomy.", "sample_taxonomy_failed", 500);
  }

  for (const row of (data ?? []) as LookupRow[]) {
    labels.set(row.slug, row.label);
  }

  return labels;
}

export async function getMoodsForSamples(
  sampleIds: string[],
  supabase: SupabaseDatabaseClient,
): Promise<Map<string, SampleTaxonomyValue[]>> {
  const moodsBySample = new Map<string, SampleTaxonomyValue[]>();
  const uniqueSampleIds = [...new Set(sampleIds.filter(Boolean))];

  if (uniqueSampleIds.length === 0) {
    return moodsBySample;
  }

  const { data: moodRows, error } = await supabase
    .from("sample_moods")
    .select("sample_id,mood_slug,sort_order")
    .in("sample_id", uniqueSampleIds)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AISUserSafeError("Unable to load sample moods.", "sample_moods_failed", 500);
  }

  const rows = (moodRows ?? []) as MoodRow[];
  const moodLabels = await getLookupLabels("moods", rows.map((row) => row.mood_slug), supabase);

  for (const row of rows) {
    const moods = moodsBySample.get(row.sample_id) ?? [];
    moods.push(taxonomyValue(row.mood_slug, moodLabels.get(row.mood_slug)));
    moodsBySample.set(row.sample_id, moods);
  }

  return moodsBySample;
}

export function taxonomyValue(slug: string, label?: string | null): SampleTaxonomyValue {
  return {
    slug,
    label: label ?? titleizeSlug(slug),
  };
}

function titleizeSlug(slug: string) {
  return slug
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
