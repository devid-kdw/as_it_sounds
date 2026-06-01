import "server-only";

import { z } from "zod";
import type {
  AdminAlbumDetailResponse,
  AdminAlbumListItem,
  AdminAlbumListResponse,
  AdminAlbumMutationResponse,
  AdminProcessingJobListFilters,
  AdminProcessingJobListItem,
  AdminProcessingJobListResponse,
  AdminSampleListFilters,
  AdminSampleListItem,
  AdminSampleListResponse,
} from "@/types/api";
import type { Json } from "@/types/database.types";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { AISUserSafeError } from "@/lib/errors";
import { determineProcessingJobRetryEligibility, isProcessingJobStuck } from "@/lib/processing-jobs";
import {
  createSupabaseAdminClient,
  type PublicTableInsert,
  type PublicTableRow,
  type PublicTableUpdate,
  type SupabaseDatabaseClient,
} from "@/lib/supabase/admin";
import { uuidSchema } from "@/lib/validators";

type AdminDataOptions = {
  supabase?: SupabaseDatabaseClient;
  actorUserId?: string | null;
  now?: () => Date;
};

type SampleRow = PublicTableRow<"samples">;
type ProcessingJobRow = PublicTableRow<"processing_jobs">;
type AlbumRow = PublicTableRow<"albums">;
type AlbumSampleRow = PublicTableRow<"album_samples">;

const albumPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    cover_image_path: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const albumCreateSchema = albumPatchSchema.extend({
  title: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

const albumSamplesMutationSchema = z
  .object({
    sample_ids: z.array(z.string().uuid()).optional(),
    items: z
      .array(
        z.object({
          sample_id: z.string().uuid(),
          sort_order: z.number().int().min(0).optional(),
        }),
      )
      .optional(),
  })
  .strict();

export function parseAdminSampleListFilters(searchParams: URLSearchParams): AdminSampleListFilters {
  return {
    status: enumParam(searchParams, "status", ["draft", "processing", "needs_review", "published", "archived", "failed", "all"]),
    processing_status: enumParam(searchParams, "processing_status", ["queued", "running", "succeeded", "failed", "canceled", "timed_out", "all"]),
    category_slug: textParam(searchParams, "category_slug"),
    sample_type_slug: textParam(searchParams, "sample_type_slug"),
    mood_slug: textParam(searchParams, "mood_slug"),
    license_status: enumParam(searchParams, "license_status", ["unverified", "verified", "restricted", "blocked", "archived", "all"]),
    featured: booleanParam(searchParams, "featured"),
    duplicate_warning: booleanParam(searchParams, "duplicate_warning"),
    missing_asset: enumParam(searchParams, "missing_asset", ["any", "original_wav", "preview_audio", "waveform_peaks"]),
    album_id: textParam(searchParams, "album_id"),
    publish_eligibility: enumParam(searchParams, "publish_eligibility", ["eligible", "blocked"]),
    query: textParam(searchParams, "query") ?? textParam(searchParams, "q"),
    limit: boundedIntParam(searchParams, "limit", 50, 1, 100),
    offset: boundedIntParam(searchParams, "offset", 0, 0, 10000),
  };
}

export function parseAdminProcessingJobListFilters(searchParams: URLSearchParams): AdminProcessingJobListFilters {
  return {
    status: enumParam(searchParams, "status", ["queued", "running", "succeeded", "failed", "canceled", "timed_out", "all"]),
    job_type: enumParam(searchParams, "job_type", ["initial_upload", "reprocess_preview", "reprocess_waveform", "reprocess_metadata", "all"]),
    batch_id: textParam(searchParams, "batch_id"),
    stuck: booleanParam(searchParams, "stuck"),
    limit: boundedIntParam(searchParams, "limit", 50, 1, 100),
    offset: boundedIntParam(searchParams, "offset", 0, 0, 10000),
  };
}

export function parseAlbumCreateRequest(payload: unknown) {
  const parsed = albumCreateSchema.safeParse(payload);

  if (!parsed.success) {
    throw new AISUserSafeError(parsed.error.issues[0]?.message ?? "Invalid album request.", "invalid_album_request", 400);
  }

  return parsed.data;
}

export function parseAlbumPatchRequest(payload: unknown) {
  const parsed = albumPatchSchema.safeParse(payload);

  if (!parsed.success) {
    throw new AISUserSafeError(parsed.error.issues[0]?.message ?? "Invalid album request.", "invalid_album_request", 400);
  }

  return parsed.data;
}

export function parseAlbumSamplesMutation(payload: unknown) {
  const parsed = albumSamplesMutationSchema.safeParse(payload);

  if (!parsed.success) {
    throw new AISUserSafeError(parsed.error.issues[0]?.message ?? "Invalid album sample request.", "invalid_album_sample_request", 400);
  }

  return parsed.data;
}

export async function listAdminSamples(
  filters: AdminSampleListFilters = {},
  options: AdminDataOptions = {},
): Promise<AdminSampleListResponse> {
  const supabase = getSupabase(options);
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  let query = supabase.from("samples").select("*").order("updated_at", { ascending: false }).range(offset, offset + limit - 1);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.category_slug) {
    query = query.eq("category_slug", filters.category_slug);
  }
  if (filters.sample_type_slug) {
    query = query.eq("sample_type_slug", filters.sample_type_slug);
  }
  if (filters.license_status && filters.license_status !== "all") {
    query = query.eq("license_status", filters.license_status);
  }
  if (filters.featured !== undefined) {
    query = query.eq("featured", filters.featured);
  }
  if (filters.query) {
    const escaped = filters.query.replaceAll("%", "\\%").replaceAll(",", " ");
    query = query.or(`poetic_name.ilike.%${escaped}%,display_title.ilike.%${escaped}%`);
  }

  const { data: samples, error } = await query;

  if (error) {
    throw new AISUserSafeError("Unable to list admin samples.", "admin_sample_list_failed", 500);
  }

  const sampleRows = samples ?? [];
  const sampleIds = sampleRows.map((sample) => sample.id);
  const [jobsResult, assetsResult, moodsResult, albumsResult] = await Promise.all([
    sampleIds.length
      ? supabase.from("processing_jobs").select("*").in("sample_id", sampleIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sampleIds.length
      ? supabase.from("sample_assets").select("sample_id,kind,access_level").in("sample_id", sampleIds)
      : Promise.resolve({ data: [], error: null }),
    sampleIds.length
      ? supabase.from("sample_moods").select("sample_id,mood_slug").in("sample_id", sampleIds)
      : Promise.resolve({ data: [], error: null }),
    sampleIds.length
      ? supabase.from("album_samples").select("album_id,sample_id").in("sample_id", sampleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (jobsResult.error || assetsResult.error || moodsResult.error || albumsResult.error) {
    throw new AISUserSafeError("Unable to load admin sample row details.", "admin_sample_list_failed", 500);
  }

  const jobsBySample = groupBy(jobsResult.data ?? [], "sample_id");
  const assetsBySample = groupBy(assetsResult.data ?? [], "sample_id");
  const moodsBySample = groupBy(moodsResult.data ?? [], "sample_id");
  const albumsBySample = groupBy(albumsResult.data ?? [], "sample_id");

  let items = sampleRows.map((sample) =>
    toAdminSampleListItem(
      sample,
      jobsBySample.get(sample.id) ?? [],
      assetsBySample.get(sample.id) ?? [],
      moodsBySample.get(sample.id) ?? [],
      albumsBySample.get(sample.id) ?? [],
    ),
  );

  if (filters.processing_status && filters.processing_status !== "all") {
    items = items.filter((item) => item.latest_processing_job?.status === filters.processing_status);
  }
  if (filters.mood_slug) {
    items = items.filter((item) => item.mood_slugs.includes(filters.mood_slug as string));
  }
  if (filters.album_id) {
    items = items.filter((item) => item.album_ids.includes(filters.album_id as string));
  }
  if (filters.duplicate_warning !== undefined) {
    items = items.filter((item) => item.duplicate_warning.present === filters.duplicate_warning);
  }
  if (filters.missing_asset) {
    items = items.filter((item) =>
      filters.missing_asset === "any"
        ? item.asset_status.some((asset) => asset.status !== "present")
        : item.asset_status.some((asset) => asset.kind === filters.missing_asset && asset.status !== "present"),
    );
  }
  if (filters.publish_eligibility) {
    items = items.filter((item) =>
      filters.publish_eligibility === "eligible" ? item.publish_eligibility.can_publish : !item.publish_eligibility.can_publish,
    );
  }

  return {
    filters,
    items,
    limit,
    offset,
  };
}

export async function listAdminProcessingJobs(
  filters: AdminProcessingJobListFilters = {},
  options: AdminDataOptions = {},
): Promise<AdminProcessingJobListResponse> {
  const supabase = getSupabase(options);
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  let query = supabase.from("processing_jobs").select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.job_type && filters.job_type !== "all") {
    query = query.eq("job_type", filters.job_type);
  }
  if (filters.batch_id) {
    query = query.contains("metadata", { batch_id: filters.batch_id });
  }

  const { data: jobs, error } = await query;

  if (error) {
    throw new AISUserSafeError("Unable to list processing jobs.", "processing_job_list_failed", 500);
  }

  const safeJobs = jobs ?? [];
  const sampleIds = [...new Set(safeJobs.map((job) => job.sample_id).filter((id): id is string => Boolean(id)))];
  const { data: samples, error: sampleError } = sampleIds.length
    ? await supabase.from("samples").select("id,poetic_name,display_title,status").in("id", sampleIds)
    : { data: [], error: null };

  if (sampleError) {
    throw new AISUserSafeError("Unable to load processing sample summaries.", "processing_job_list_failed", 500);
  }

  const samplesById = new Map((samples ?? []).map((sample) => [sample.id, sample]));
  let items = safeJobs.map((job) => toAdminProcessingJobListItem(job, samplesById.get(job.sample_id ?? "") ?? null));

  if (filters.stuck !== undefined) {
    items = items.filter((item) => item.is_stuck === filters.stuck);
  }

  return {
    filters,
    items,
    limit,
    offset,
  };
}

export async function listAdminAlbums(options: AdminDataOptions = {}): Promise<AdminAlbumListResponse> {
  const supabase = getSupabase(options);
  const [{ data: albums, error: albumError }, { data: albumSamples, error: sampleError }] = await Promise.all([
    supabase.from("albums").select("*").order("updated_at", { ascending: false }),
    supabase.from("album_samples").select("album_id,sample_id"),
  ]);

  if (albumError || sampleError) {
    throw new AISUserSafeError("Unable to list albums.", "album_list_failed", 500);
  }

  const counts = countBy(albumSamples ?? [], "album_id");

  return {
    albums: (albums ?? []).map((album) => toAdminAlbumListItem(album, counts.get(album.id) ?? 0)),
  };
}

export async function getAdminAlbumDetail(
  albumId: string,
  options: AdminDataOptions = {},
): Promise<AdminAlbumDetailResponse> {
  const supabase = getSupabase(options);
  const album = await requireAlbum(supabase, albumId);
  const { data, error } = await supabase
    .from("album_samples")
    .select("album_id,sample_id,sort_order,samples(id,poetic_name,display_title,status)")
    .eq("album_id", albumId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AISUserSafeError("Unable to load album samples.", "album_sample_list_failed", 500);
  }

  return {
    album: toAdminAlbumListItem(album, data?.length ?? 0),
    samples: (data ?? []).map((row) => {
      const sample = Array.isArray(row.samples) ? row.samples[0] : row.samples;

      return {
        album_id: row.album_id,
        sample_id: row.sample_id,
        sort_order: row.sort_order,
        poetic_name: sample?.poetic_name ?? "unknown_sample",
        display_title: sample?.display_title ?? "Unknown sample",
        status: sample?.status ?? "draft",
      };
    }),
  };
}

export async function createAdminAlbum(
  input: z.infer<typeof albumCreateSchema>,
  options: AdminDataOptions = {},
): Promise<AdminAlbumMutationResponse> {
  const supabase = getSupabase(options);
  const { data, error } = await supabase
    .from("albums")
    .insert({
      title: input.title,
      slug: input.slug,
      description: input.description ?? null,
      cover_image_path: input.cover_image_path ?? null,
      status: "draft",
      created_by: options.actorUserId ?? null,
    } satisfies PublicTableInsert<"albums">)
    .select("*")
    .single();

  if (error || !data) {
    throw new AISUserSafeError("Unable to create album.", "album_create_failed", 500);
  }

  await audit(supabase, options, "album.create", "album", data.id, null, toAlbumAudit(data));

  return getAdminAlbumDetail(data.id, { ...options, supabase });
}

export async function updateAdminAlbum(
  albumId: string,
  input: z.infer<typeof albumPatchSchema>,
  options: AdminDataOptions = {},
): Promise<AdminAlbumMutationResponse> {
  const supabase = getSupabase(options);
  const before = await requireAlbum(supabase, albumId);
  const { data, error } = await supabase.from("albums").update(input).eq("id", albumId).select("*").single();

  if (error || !data) {
    throw new AISUserSafeError("Unable to update album.", "album_update_failed", 500);
  }

  await audit(supabase, options, "album.update", "album", albumId, toAlbumAudit(before), toAlbumAudit(data));

  return getAdminAlbumDetail(albumId, { ...options, supabase });
}

export async function replaceAdminAlbumSamples(
  albumId: string,
  input: z.infer<typeof albumSamplesMutationSchema>,
  options: AdminDataOptions = {},
): Promise<AdminAlbumMutationResponse> {
  const supabase = getSupabase(options);
  await requireAlbum(supabase, albumId);
  const items =
    input.items ??
    (input.sample_ids ?? []).map((sampleId, index) => ({
      sample_id: sampleId,
      sort_order: index,
    }));
  const before = await getAdminAlbumDetail(albumId, { ...options, supabase });
  const deleteResult = await supabase.from("album_samples").delete().eq("album_id", albumId);

  if (deleteResult.error) {
    throw new AISUserSafeError("Unable to update album membership.", "album_samples_update_failed", 500);
  }

  if (items.length > 0) {
    const rows: PublicTableInsert<"album_samples">[] = items.map((item, index) => ({
      album_id: albumId,
      sample_id: item.sample_id,
      sort_order: item.sort_order ?? index,
    }));
    const insertResult = await supabase.from("album_samples").insert(rows);

    if (insertResult.error) {
      throw new AISUserSafeError("Unable to update album membership.", "album_samples_update_failed", 500);
    }
  }

  const after = await getAdminAlbumDetail(albumId, { ...options, supabase });
  await audit(supabase, options, "album.samples_reorder", "album", albumId, before.samples as unknown as Json, after.samples as unknown as Json);

  return after;
}

export async function publishAdminAlbum(albumId: string, options: AdminDataOptions = {}) {
  const supabase = getSupabase(options);
  const before = await requireAlbum(supabase, albumId);

  if (!before.title.trim() || !before.slug.trim()) {
    throw new AISUserSafeError("Album title and slug are required before publish.", "album_publish_blocked", 409);
  }

  const { data, error } = await supabase
    .from("albums")
    .update({ status: "published", published_at: before.published_at ?? getNowIso(options), archived_at: null } satisfies PublicTableUpdate<"albums">)
    .eq("id", albumId)
    .select("*")
    .single();

  if (error || !data) {
    throw new AISUserSafeError("Unable to publish album.", "album_publish_failed", 500);
  }

  await audit(supabase, options, "album.publish", "album", albumId, toAlbumAudit(before), toAlbumAudit(data));
  await refreshAlbumSearchDocuments(supabase, albumId);

  return getAdminAlbumDetail(albumId, { ...options, supabase });
}

export async function archiveAdminAlbum(albumId: string, options: AdminDataOptions = {}) {
  const supabase = getSupabase(options);
  const before = await requireAlbum(supabase, albumId);
  const { data, error } = await supabase
    .from("albums")
    .update({ status: "archived", archived_at: getNowIso(options) } satisfies PublicTableUpdate<"albums">)
    .eq("id", albumId)
    .select("*")
    .single();

  if (error || !data) {
    throw new AISUserSafeError("Unable to archive album.", "album_archive_failed", 500);
  }

  await audit(supabase, options, "album.archive", "album", albumId, toAlbumAudit(before), toAlbumAudit(data));
  await refreshAlbumSearchDocuments(supabase, albumId);

  return getAdminAlbumDetail(albumId, { ...options, supabase });
}

function toAdminSampleListItem(
  sample: SampleRow,
  jobs: ProcessingJobRow[],
  assets: Array<Pick<PublicTableRow<"sample_assets">, "kind" | "access_level">>,
  moods: Array<Pick<PublicTableRow<"sample_moods">, "mood_slug">>,
  albumSamples: Array<Pick<AlbumSampleRow, "album_id">>,
): AdminSampleListItem {
  const latestProcessingJob = jobs[0] ?? null;
  const duplicateWarning = duplicateWarningFromJobs(jobs);
  const assetStatus = buildAssetStatusRows(assets);
  const blockers = [
    ...(sample.poetic_name.startsWith("draft_") ? [{ code: "temporary_poetic_name", field: "poetic_name", message: "Replace temporary poetic name." }] : []),
    ...(assetStatus.some((asset) => asset.kind === "preview_audio" && asset.status !== "present")
      ? [{ code: "missing_preview_asset", message: "Preview audio asset is missing." }]
      : []),
    ...(assetStatus.some((asset) => asset.kind === "waveform_peaks" && asset.status !== "present")
      ? [{ code: "missing_waveform_asset", message: "Waveform peaks asset is missing." }]
      : []),
    ...(latestProcessingJob?.status === "succeeded" ? [] : [{ code: "processing_not_complete", message: "Processing must succeed." }]),
  ];

  return {
    id: sample.id,
    poetic_name: sample.poetic_name,
    display_title: sample.display_title,
    short_description: sample.short_description,
    status: sample.status,
    category_slug: sample.category_slug,
    sample_type_slug: sample.sample_type_slug,
    license_status: sample.license_status,
    bpm: sample.bpm,
    duration_seconds: sample.duration_seconds,
    featured: sample.featured,
    published_at: sample.published_at,
    updated_at: sample.updated_at,
    original_filename: jobs.map((job) => getStringMetadata(job.metadata, "original_filename")).find(Boolean) ?? null,
    mood_slugs: moods.map((mood) => mood.mood_slug),
    album_ids: albumSamples.map((row) => row.album_id),
    asset_status: assetStatus,
    latest_processing_job: latestProcessingJob ? toProcessingSummary(latestProcessingJob) : null,
    duplicate_warning: duplicateWarning,
    publish_eligibility: {
      can_publish: blockers.length === 0,
      blockers,
      warnings: [],
    },
  };
}

function toAdminProcessingJobListItem(
  job: ProcessingJobRow,
  sample: Pick<SampleRow, "id" | "poetic_name" | "display_title" | "status"> | null,
): AdminProcessingJobListItem {
  const retry = determineProcessingJobRetryEligibility(job, "admin");

  return {
    id: job.id,
    sample_id: job.sample_id,
    sample_poetic_name: sample?.poetic_name ?? null,
    sample_display_title: sample?.display_title ?? null,
    sample_status: sample?.status ?? null,
    original_filename: getStringMetadata(job.metadata, "original_filename"),
    batch_id: getStringMetadata(job.metadata, "batch_id"),
    bulk_position: getNumberMetadata(job.metadata, "bulk_position"),
    job_type: job.job_type,
    status: job.status,
    attempts: job.attempts,
    max_attempts: job.max_attempts,
    last_error_code: job.last_error_code,
    last_error_message: job.last_error_message,
    retry_eligible: retry.eligible,
    retry_reason: retry.reason,
    is_stuck: isProcessingJobStuck(job),
    started_at: job.started_at,
    finished_at: job.finished_at,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}

function toProcessingSummary(job: ProcessingJobRow) {
  return {
    id: job.id,
    job_type: job.job_type,
    status: job.status,
    attempts: job.attempts,
    max_attempts: job.max_attempts,
    last_error_code: job.last_error_code,
    last_error_message: job.last_error_message,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
  };
}

function toAdminAlbumListItem(album: AlbumRow, sampleCount: number): AdminAlbumListItem {
  return {
    id: album.id,
    slug: album.slug,
    title: album.title,
    description: album.description,
    status: album.status,
    cover_image_path: album.cover_image_path,
    sample_count: sampleCount,
    published_at: album.published_at,
    archived_at: album.archived_at,
    created_at: album.created_at,
    updated_at: album.updated_at,
  };
}

function buildAssetStatusRows(assets: Array<Pick<PublicTableRow<"sample_assets">, "kind" | "access_level">>) {
  const requiredKinds = ["original_wav", "preview_audio", "waveform_peaks"] as const;

  return requiredKinds.map((kind) => {
    const asset = assets.find((row) => row.kind === kind);

    return {
      kind,
      status: asset ? "present" as const : "missing_row" as const,
      access_level: asset?.access_level ?? null,
    };
  });
}

function duplicateWarningFromJobs(jobs: ProcessingJobRow[]) {
  const job = jobs.find((row) => {
    const duplicate = asRecord(asRecord(row.metadata)?.duplicate_check);
    return duplicate?.is_duplicate === true || Array.isArray(duplicate?.matching_sample_ids);
  });
  const duplicateCheck = asRecord(asRecord(job?.metadata)?.duplicate_check);
  const acknowledgement = asRecord(asRecord(job?.metadata)?.duplicate_acknowledgement);
  const matchingSampleIds = Array.isArray(duplicateCheck?.matching_sample_ids)
    ? duplicateCheck.matching_sample_ids.filter((id): id is string => typeof id === "string")
    : [];

  return {
    present: Boolean(job),
    acknowledged: acknowledgement?.acknowledged === true,
    matching_sample_ids: matchingSampleIds,
  };
}

async function requireAlbum(supabase: SupabaseDatabaseClient, albumId: string) {
  const parsed = uuidSchema.safeParse(albumId);

  if (!parsed.success) {
    throw new AISUserSafeError("Album ID must be a valid UUID.", "invalid_album_id", 400);
  }

  const { data, error } = await supabase.from("albums").select("*").eq("id", parsed.data).maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load album.", "album_lookup_failed", 500);
  }

  if (!data) {
    throw new AISUserSafeError("Album was not found.", "album_not_found", 404);
  }

  return data;
}

async function refreshAlbumSearchDocuments(supabase: SupabaseDatabaseClient, albumId: string) {
  const { data } = await supabase.from("album_samples").select("sample_id").eq("album_id", albumId);

  await Promise.all(
    (data ?? []).map((row) => supabase.rpc("refresh_sample_search_document", { target_sample_id: row.sample_id })),
  );
}

async function audit(
  supabase: SupabaseDatabaseClient,
  options: AdminDataOptions,
  action: string,
  entityType: string,
  entityId: string,
  beforeData: Json | null,
  afterData: Json | null,
) {
  await writeAdminAuditLog(supabase, {
    actorUserId: options.actorUserId ?? null,
    action,
    entityType,
    entityId,
    beforeData,
    afterData,
  });
}

function toAlbumAudit(album: AlbumRow): Json {
  return {
    id: album.id,
    slug: album.slug,
    title: album.title,
    status: album.status,
    published_at: album.published_at,
    archived_at: album.archived_at,
  };
}

function groupBy<Row extends Record<string, unknown>>(rows: Row[], key: keyof Row) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "string") {
      continue;
    }
    const current = grouped.get(value) ?? [];
    current.push(row);
    grouped.set(value, current);
  }

  return grouped;
}

function countBy<Row extends Record<string, unknown>>(rows: Row[], key: keyof Row) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const value = row[key];
    if (typeof value === "string") {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  return counts;
}

function enumParam<const Values extends readonly string[]>(
  searchParams: URLSearchParams,
  key: string,
  values: Values,
): Values[number] | undefined {
  const value = searchParams.get(key);
  return value && values.includes(value) ? value : undefined;
}

function textParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key)?.trim();
  return value ? value : undefined;
}

function booleanParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function boundedIntParam(searchParams: URLSearchParams, key: string, fallback: number, min: number, max: number) {
  const value = Number(searchParams.get(key));
  return Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback;
}

function getStringMetadata(metadata: Json, key: string) {
  const value = asRecord(metadata)?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumberMetadata(metadata: Json, key: string) {
  const value = asRecord(metadata)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getSupabase(options: AdminDataOptions) {
  return options.supabase ?? createSupabaseAdminClient();
}

function getNowIso(options: AdminDataOptions) {
  return (options.now?.() ?? new Date()).toISOString();
}
