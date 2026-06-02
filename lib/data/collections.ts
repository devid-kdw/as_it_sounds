import "server-only";

import { AISUserSafeError } from "@/lib/errors";
import { getEntitlementForCurrentUser } from "@/lib/entitlement";
import type {
  PublicTableInsert,
  PublicTableRow,
  PublicTableUpdate,
  SupabaseDatabaseClient,
} from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CollectionDataOptions = {
  supabase?: SupabaseDatabaseClient;
};

type CollectionRow = PublicTableRow<"collections">;
type CollectionItemRow = PublicTableRow<"collection_items">;
type SampleRow = Pick<
  PublicTableRow<"samples">,
  "id" | "poetic_name" | "display_title" | "display_title_is_custom" | "duration_seconds"
>;

export type CollectionInput = {
  name: string;
  description?: string | null;
};

export type CollectionPatchInput = {
  name?: string;
  description?: string | null;
};

export type CollectionItemInput = {
  sampleId: string;
  sortOrder?: number | null;
};

export type CollectionReorderItemInput = {
  sampleId: string;
  sortOrder: number;
};

export type CollectionSampleView = {
  id: string;
  poeticName: string;
  displayTitle: string;
  displayTitleIsCustom: boolean;
  durationSeconds: number | null;
};

export type CollectionItemView = {
  sampleId: string;
  sortOrder: number;
  addedAt: string;
  sample: CollectionSampleView | null;
};

export type CollectionView = {
  id: string;
  name: string;
  description: string | null;
  visibility: "private";
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  items: CollectionItemView[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLLECTION_NAME_MAX_LENGTH = 120;
const COLLECTION_DESCRIPTION_MAX_LENGTH = 500;
const MAX_REORDER_ITEMS = 500;

export async function listCurrentUserCollections(
  options: CollectionDataOptions = {},
): Promise<CollectionView[]> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  await requireCollectionsUser(supabase);

  const { data, error } = await supabase
    .from("collections")
    .select("id,user_id,name,description,visibility,created_at,updated_at")
    .eq("visibility", "private")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new AISUserSafeError("Unable to list collections.", "collections_list_failed", 500);
  }

  const rows = (data ?? []) as CollectionRow[];
  const itemCounts = await getCollectionItemCounts(rows.map((row) => row.id), supabase);

  return rows.map((row) => collectionView(row, [], itemCounts.get(row.id) ?? 0));
}

export async function getCurrentUserCollection(
  collectionId: string,
  options: CollectionDataOptions = {},
): Promise<CollectionView> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const normalizedCollectionId = normalizeUuid(collectionId, "Collection ID");
  await requireCollectionsUser(supabase);

  const collection = await getOwnedCollectionRow(normalizedCollectionId, supabase);
  const items = await listCollectionItems(normalizedCollectionId, supabase);

  return collectionView(collection, items, items.length);
}

export async function createCollection(
  input: CollectionInput,
  options: CollectionDataOptions = {},
): Promise<CollectionView> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const userId = await requireCollectionsUser(supabase);
  const normalized = normalizeCollectionInput(input);

  const insert: PublicTableInsert<"collections"> = {
    user_id: userId,
    name: normalized.name,
    description: normalized.description,
    visibility: "private",
  };

  const { data, error } = await supabase
    .from("collections")
    .insert(insert)
    .select("id,user_id,name,description,visibility,created_at,updated_at")
    .single();

  if (error) {
    throw new AISUserSafeError("Unable to create the collection.", "collection_create_failed", 500);
  }

  return collectionView(data as CollectionRow, [], 0);
}

export async function updateCollection(
  collectionId: string,
  input: CollectionPatchInput,
  options: CollectionDataOptions = {},
): Promise<CollectionView> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const normalizedCollectionId = normalizeUuid(collectionId, "Collection ID");
  await requireCollectionsUser(supabase);
  await getOwnedCollectionRow(normalizedCollectionId, supabase);

  const patch = normalizeCollectionPatch(input);

  if (Object.keys(patch).length === 0) {
    return getCurrentUserCollection(normalizedCollectionId, { supabase });
  }

  const { data, error } = await supabase
    .from("collections")
    .update(patch)
    .eq("id", normalizedCollectionId)
    .select("id,user_id,name,description,visibility,created_at,updated_at")
    .single();

  if (error) {
    throw new AISUserSafeError("Unable to update the collection.", "collection_update_failed", 500);
  }

  const items = await listCollectionItems(normalizedCollectionId, supabase);

  return collectionView(data as CollectionRow, items, items.length);
}

export async function deleteCollection(
  collectionId: string,
  options: CollectionDataOptions = {},
): Promise<{ collectionId: string; deleted: true }> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const normalizedCollectionId = normalizeUuid(collectionId, "Collection ID");
  await requireCollectionsUser(supabase);
  await getOwnedCollectionRow(normalizedCollectionId, supabase);

  const { error } = await supabase.from("collections").delete().eq("id", normalizedCollectionId);

  if (error) {
    throw new AISUserSafeError("Unable to delete the collection.", "collection_delete_failed", 500);
  }

  return {
    collectionId: normalizedCollectionId,
    deleted: true,
  };
}

export async function addSampleToCollection(
  collectionId: string,
  input: CollectionItemInput,
  options: CollectionDataOptions = {},
): Promise<CollectionView> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const normalizedCollectionId = normalizeUuid(collectionId, "Collection ID");
  const sampleId = normalizeUuid(input.sampleId, "Sample ID");

  await requireCollectionsUser(supabase);
  await getOwnedCollectionRow(normalizedCollectionId, supabase);
  await assertPublishedSampleExists(sampleId, supabase);

  const sortOrder = normalizeSortOrder(input.sortOrder ?? (await getNextSortOrder(normalizedCollectionId, supabase)));

  const { error } = await supabase.from("collection_items").upsert(
    {
      collection_id: normalizedCollectionId,
      sample_id: sampleId,
      sort_order: sortOrder,
    },
    {
      onConflict: "collection_id,sample_id",
    },
  );

  if (error) {
    throw new AISUserSafeError("Unable to add the sample to the collection.", "collection_item_add_failed", 500);
  }

  await touchCollection(normalizedCollectionId, supabase);
  return getCurrentUserCollection(normalizedCollectionId, { supabase });
}

export async function removeSampleFromCollection(
  collectionId: string,
  sampleId: string,
  options: CollectionDataOptions = {},
): Promise<CollectionView> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const normalizedCollectionId = normalizeUuid(collectionId, "Collection ID");
  const normalizedSampleId = normalizeUuid(sampleId, "Sample ID");

  await requireCollectionsUser(supabase);
  await getOwnedCollectionRow(normalizedCollectionId, supabase);

  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("collection_id", normalizedCollectionId)
    .eq("sample_id", normalizedSampleId);

  if (error) {
    throw new AISUserSafeError("Unable to remove the sample from the collection.", "collection_item_remove_failed", 500);
  }

  await touchCollection(normalizedCollectionId, supabase);
  return getCurrentUserCollection(normalizedCollectionId, { supabase });
}

export async function reorderCollectionItems(
  collectionId: string,
  items: CollectionReorderItemInput[],
  options: CollectionDataOptions = {},
): Promise<CollectionView> {
  const supabase = options.supabase ?? (await createSupabaseServerClient());
  const normalizedCollectionId = normalizeUuid(collectionId, "Collection ID");
  const normalizedItems = normalizeReorderItems(items);

  await requireCollectionsUser(supabase);
  await getOwnedCollectionRow(normalizedCollectionId, supabase);

  for (const item of normalizedItems) {
    const { data, error } = await supabase
      .from("collection_items")
      .update({ sort_order: item.sortOrder })
      .eq("collection_id", normalizedCollectionId)
      .eq("sample_id", item.sampleId)
      .select("sample_id")
      .maybeSingle();

    if (error) {
      throw new AISUserSafeError("Unable to reorder the collection.", "collection_reorder_failed", 500);
    }

    if (!data) {
      throw new AISUserSafeError("Collection item was not found.", "collection_item_not_found", 404);
    }
  }

  await touchCollection(normalizedCollectionId, supabase);
  return getCurrentUserCollection(normalizedCollectionId, { supabase });
}

async function requireCollectionsUser(supabase: SupabaseDatabaseClient) {
  const entitlement = await getEntitlementForCurrentUser(supabase);

  if (!entitlement.isAuthenticated || !entitlement.userId) {
    throw new AISUserSafeError("Sign in to manage collections.", "not_authenticated", 401);
  }

  if (!entitlement.canCreateCollections) {
    throw new AISUserSafeError("Your account cannot manage collections.", "not_entitled", 403);
  }

  return entitlement.userId;
}

async function getOwnedCollectionRow(collectionId: string, supabase: SupabaseDatabaseClient) {
  const { data, error } = await supabase
    .from("collections")
    .select("id,user_id,name,description,visibility,created_at,updated_at")
    .eq("id", collectionId)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load the collection.", "collection_lookup_failed", 500);
  }

  if (!data) {
    throw new AISUserSafeError("Collection was not found.", "collection_not_found", 404);
  }

  return data as CollectionRow;
}

async function listCollectionItems(collectionId: string, supabase: SupabaseDatabaseClient) {
  const { data, error } = await supabase
    .from("collection_items")
    .select(
      "collection_id,sample_id,sort_order,added_at,samples(id,poetic_name,display_title,display_title_is_custom,duration_seconds)",
    )
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true })
    .order("added_at", { ascending: true });

  if (error) {
    throw new AISUserSafeError("Unable to load collection items.", "collection_items_lookup_failed", 500);
  }

  return ((data ?? []) as unknown as Array<CollectionItemRow & { samples: SampleRow | null }>).map(
    (row) => ({
      sampleId: row.sample_id,
      sortOrder: row.sort_order,
      addedAt: row.added_at,
      sample: row.samples ? sampleView(row.samples) : null,
    }),
  );
}

async function getCollectionItemCounts(collectionIds: string[], supabase: SupabaseDatabaseClient) {
  const counts = new Map<string, number>();

  if (collectionIds.length === 0) {
    return counts;
  }

  const { data, error } = await supabase
    .from("collection_items")
    .select("collection_id")
    .in("collection_id", collectionIds);

  if (error) {
    throw new AISUserSafeError("Unable to count collection items.", "collection_items_count_failed", 500);
  }

  for (const row of data ?? []) {
    counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1);
  }

  return counts;
}

async function getNextSortOrder(collectionId: string, supabase: SupabaseDatabaseClient) {
  const { data, error } = await supabase
    .from("collection_items")
    .select("sort_order")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (error) {
    throw new AISUserSafeError("Unable to inspect collection order.", "collection_order_lookup_failed", 500);
  }

  return ((data?.[0]?.sort_order ?? -1) as number) + 1;
}

async function assertPublishedSampleExists(sampleId: string, supabase: SupabaseDatabaseClient) {
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

async function touchCollection(collectionId: string, supabase: SupabaseDatabaseClient) {
  const { error } = await supabase
    .from("collections")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", collectionId);

  if (error) {
    throw new AISUserSafeError("Unable to update the collection timestamp.", "collection_touch_failed", 500);
  }
}

function collectionView(
  row: CollectionRow,
  items: CollectionItemView[],
  itemCount: number,
): CollectionView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: "private",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount,
    items,
  };
}

function sampleView(row: SampleRow): CollectionSampleView {
  return {
    id: row.id,
    poeticName: row.poetic_name,
    displayTitle: row.display_title,
    displayTitleIsCustom: row.display_title_is_custom,
    durationSeconds: toNullableNumber(row.duration_seconds),
  };
}

function normalizeCollectionInput(input: CollectionInput): Required<CollectionInput> {
  return {
    name: normalizeCollectionName(input.name),
    description: normalizeDescription(input.description),
  };
}

function normalizeCollectionPatch(input: CollectionPatchInput): PublicTableUpdate<"collections"> {
  const patch: PublicTableUpdate<"collections"> = {};

  if (input.name !== undefined) {
    patch.name = normalizeCollectionName(input.name);
  }

  if (input.description !== undefined) {
    patch.description = normalizeDescription(input.description);
  }

  return patch;
}

function normalizeCollectionName(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    throw new AISUserSafeError("Collection name is required.", "invalid_collection_name", 400);
  }

  if (normalized.length > COLLECTION_NAME_MAX_LENGTH) {
    throw new AISUserSafeError("Collection name is too long.", "invalid_collection_name", 400);
  }

  return normalized;
}

function normalizeDescription(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";

  if (!normalized) {
    return null;
  }

  if (normalized.length > COLLECTION_DESCRIPTION_MAX_LENGTH) {
    throw new AISUserSafeError("Collection description is too long.", "invalid_collection_description", 400);
  }

  return normalized;
}

function normalizeReorderItems(items: CollectionReorderItemInput[]) {
  if (items.length > MAX_REORDER_ITEMS) {
    throw new AISUserSafeError("Too many collection items to reorder.", "invalid_collection_reorder", 400);
  }

  const seenSampleIds = new Set<string>();

  return items.map((item) => {
    const sampleId = normalizeUuid(item.sampleId, "Sample ID");

    if (seenSampleIds.has(sampleId)) {
      throw new AISUserSafeError("Collection reorder contains duplicate samples.", "invalid_collection_reorder", 400);
    }

    seenSampleIds.add(sampleId);

    return {
      sampleId,
      sortOrder: normalizeSortOrder(item.sortOrder),
    };
  });
}

function normalizeSortOrder(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new AISUserSafeError("Sort order must be a non-negative integer.", "invalid_sort_order", 400);
  }

  return value;
}

function normalizeUuid(value: string, label: string) {
  const trimmed = value.trim();

  if (!UUID_PATTERN.test(trimmed)) {
    throw new AISUserSafeError(`${label} must be a valid UUID.`, "invalid_uuid", 400);
  }

  return trimmed.toLowerCase();
}

function toNullableNumber(value: number | string | null) {
  if (value === null) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
