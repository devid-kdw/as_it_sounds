import "server-only";

import { AISUserSafeError } from "@/lib/errors";
import { getEntitlementForCurrentUser } from "@/lib/entitlement";
import type { SupabaseDatabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FavoriteDataOptions = {
  supabase?: SupabaseDatabaseClient;
};

export type FavoriteMutationResult = {
  sampleId: string;
  isFavorited: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function favoritePublishedSample(
  sampleId: string,
  options: FavoriteDataOptions = {},
): Promise<FavoriteMutationResult> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const normalizedSampleId = normalizeUuid(sampleId, "Sample ID");
  const entitlement = await getEntitlementForCurrentUser(supabase);

  if (!entitlement.isAuthenticated || !entitlement.userId) {
    throw new AISUserSafeError("Sign in to favorite samples.", "not_authenticated", 401);
  }

  if (!entitlement.canFavorite) {
    throw new AISUserSafeError("Your account cannot favorite samples.", "not_entitled", 403);
  }

  await assertPublishedSampleExists(supabase, normalizedSampleId);

  const { error } = await supabase.from("favorites").insert({
    user_id: entitlement.userId,
    sample_id: normalizedSampleId,
  });

  if (error && error.code !== "23505") {
    throw new AISUserSafeError("Unable to favorite the sample.", "favorite_failed", 500);
  }

  return {
    sampleId: normalizedSampleId,
    isFavorited: true,
  };
}

export async function unfavoriteSample(
  sampleId: string,
  options: FavoriteDataOptions = {},
): Promise<FavoriteMutationResult> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const normalizedSampleId = normalizeUuid(sampleId, "Sample ID");
  const entitlement = await getEntitlementForCurrentUser(supabase);

  if (!entitlement.isAuthenticated || !entitlement.userId) {
    throw new AISUserSafeError("Sign in to update favorites.", "not_authenticated", 401);
  }

  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", entitlement.userId)
    .eq("sample_id", normalizedSampleId);

  if (error) {
    throw new AISUserSafeError("Unable to remove the favorite.", "unfavorite_failed", 500);
  }

  return {
    sampleId: normalizedSampleId,
    isFavorited: false,
  };
}

export async function setPublishedSampleFavorite(
  sampleId: string,
  isFavorited: boolean,
  options: FavoriteDataOptions = {},
): Promise<FavoriteMutationResult> {
  return isFavorited
    ? favoritePublishedSample(sampleId, options)
    : unfavoriteSample(sampleId, options);
}

export async function getCurrentUserFavoriteSampleIds(
  sampleIds?: string[],
  options: FavoriteDataOptions = {},
): Promise<Set<string>> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Set();
  }

  let query = supabase.from("favorites").select("sample_id").eq("user_id", user.id);
  const normalizedSampleIds = uniqueUuids(sampleIds ?? []);

  if (normalizedSampleIds.length > 0) {
    query = query.in("sample_id", normalizedSampleIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new AISUserSafeError("Unable to load favorites.", "favorites_lookup_failed", 500);
  }

  return new Set((data ?? []).map((row) => row.sample_id));
}

async function assertPublishedSampleExists(supabase: SupabaseDatabaseClient, sampleId: string) {
  const { data, error } = await supabase
    .from("samples")
    .select("id")
    .eq("id", sampleId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load the sample.", "sample_lookup_failed", 500);
  }

  if (!data) {
    throw new AISUserSafeError("Sample was not found.", "sample_not_found", 404);
  }
}

function uniqueUuids(values: string[]) {
  return [...new Set(values.map((value) => normalizeUuid(value, "Sample ID")))];
}

function normalizeUuid(value: string, label: string) {
  const trimmed = value.trim();

  if (!UUID_PATTERN.test(trimmed)) {
    throw new AISUserSafeError(`${label} must be a valid UUID.`, "invalid_uuid", 400);
  }

  return trimmed.toLowerCase();
}
