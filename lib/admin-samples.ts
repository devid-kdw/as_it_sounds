import "server-only";

import { z } from "zod";
import type {
  AdminSampleAssetStatus,
  AdminSampleDetailResponse,
  AdminSampleDuplicateWarning,
  AdminSamplePatchRequest,
  AdminSampleProcessingJobSummary,
  PublishBlocker,
  PublishEligibility,
  PublishWarning,
} from "@/types/api";
import type { Json } from "@/types/database.types";
import { AISUserSafeError } from "@/lib/errors";
import { sampleDetailRoute } from "@/lib/routes";
import { createDefaultStorageProvider, type StorageProvider } from "@/lib/storage";
import {
  createSupabaseAdminClient,
  type PublicTableInsert,
  type PublicTableRow,
  type PublicTableUpdate,
  type SupabaseDatabaseClient,
} from "@/lib/supabase/admin";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { poeticNameSchema, uuidSchema } from "@/lib/validators";

type SampleRow = PublicTableRow<"samples">;
type CategoryRow = PublicTableRow<"categories">;
type MoodRow = PublicTableRow<"moods">;
type HiddenTagRow = PublicTableRow<"hidden_tags">;
type SampleAssetRow = PublicTableRow<"sample_assets">;
type ProcessingJobRow = PublicTableRow<"processing_jobs">;

type AdminSampleServiceOptions = {
  supabase?: SupabaseDatabaseClient;
  storage?: StorageProvider;
  now?: () => Date;
};

type AdminSampleActor = {
  userId: string;
  email?: string | null;
};

type PublishEligibilityContext = {
  sample: Pick<
    SampleRow,
    | "id"
    | "poetic_name"
    | "display_title"
    | "short_description"
    | "category_slug"
    | "sample_type_slug"
    | "bpm"
    | "musical_key"
    | "is_melodic"
    | "unknown_key_confirmed"
    | "duration_seconds"
    | "loopable"
    | "sample_rate"
    | "channels"
    | "status"
    | "license_status"
    | "source_type"
    | "rights_owner"
    | "commercial_use_allowed"
    | "redistribution_allowed"
    | "license_confirmed_at"
    | "license_confirmed_by"
    | "featured"
  >;
  moodSlugs: string[];
  hiddenTagSlugs: string[];
  albumIds: string[];
  categoryActive: boolean;
  sampleTypeActive: boolean;
  poeticNameIsUnique: boolean;
  latestInitialUploadJob: Pick<ProcessingJobRow, "status"> | null;
  assets: AdminSampleAssetStatus[];
  duplicateWarning: Pick<AdminSampleDuplicateWarning, "is_duplicate" | "acknowledged">;
};

type PatchInput = z.infer<typeof adminSamplePatchSchema>;

export class PublishEligibilityError extends AISUserSafeError {
  eligibility: PublishEligibility;

  constructor(eligibility: PublishEligibility) {
    super("Sample is not ready to publish.", "publish_blocked", 409);
    this.name = "PublishEligibilityError";
    this.eligibility = eligibility;
  }
}

const requiredAssetKinds = ["original_wav", "preview_audio", "waveform_peaks"] as const;
const poeticNamePattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const licenseStatuses = ["unverified", "verified", "restricted", "blocked", "archived"] as const;
const sourceTypes = [
  "original_recording",
  "synthesized",
  "field_recording",
  "processed_original",
  "licensed_source",
] as const;

const optionalTrimmedText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max).nullable(),
  );

const adminSamplePatchSchema = z
  .object({
    poetic_name: poeticNameSchema.optional(),
    display_title: optionalTrimmedText(160).optional(),
    display_title_is_custom: z.boolean().optional(),
    short_description: optionalTrimmedText(420).optional(),
    category_slug: poeticNameSchema.optional(),
    sample_type_slug: poeticNameSchema.optional(),
    mood_slugs: z.array(poeticNameSchema).max(3).optional(),
    hidden_tag_slugs: z.array(poeticNameSchema).max(50).optional(),
    bpm: z.number().positive().max(400).nullable().optional(),
    musical_key: optionalTrimmedText(32).optional(),
    is_melodic: z.boolean().optional(),
    unknown_key_confirmed: z.boolean().optional(),
    loopable: z.boolean().optional(),
    featured: z.boolean().optional(),
    source_type: z.enum(sourceTypes).optional(),
    rights_owner: optionalTrimmedText(160).optional(),
    commercial_use_allowed: z.boolean().optional(),
    redistribution_allowed: z.literal(false).optional(),
    attribution_required: z.boolean().optional(),
    license_status: z.enum(licenseStatuses).optional(),
    license_notes: optionalTrimmedText(1000).optional(),
    license_confirmed: z.boolean().optional(),
    duplicate_acknowledgement: z
      .object({
        acknowledged: z.literal(true),
        reason: optionalTrimmedText(240).optional(),
      })
      .optional(),
    confirm_published_poetic_name_change: z.string().trim().optional(),
    archive_if_license_invalid: z.boolean().optional(),
  })
  .strict();

export function parseAdminSamplePatchRequest(payload: unknown): AdminSamplePatchRequest {
  const parsed = adminSamplePatchSchema.safeParse(payload);

  if (!parsed.success) {
    throw new AISUserSafeError(
      parsed.error.issues[0]?.message ?? "Invalid sample update request.",
      "invalid_admin_sample_update",
      400,
    );
  }

  return parsed.data;
}

export function parseSampleId(value: unknown) {
  const parsed = uuidSchema.safeParse(value);

  if (!parsed.success) {
    throw new AISUserSafeError("Sample ID must be a valid UUID.", "invalid_sample_id", 400);
  }

  return parsed.data;
}

export async function getAdminSampleDetail(
  sampleId: string,
  options: AdminSampleServiceOptions = {},
): Promise<AdminSampleDetailResponse> {
  const supabase = getSupabase(options);
  const storage = getStorage(options);
  const sample = await requireSample(supabase, sampleId);

  const [
    { data: categories, error: categoriesError },
    { data: sampleTypes, error: sampleTypesError },
    { data: moods, error: moodsError },
    { data: hiddenTags, error: hiddenTagsError },
    { data: sampleMoods, error: sampleMoodsError },
    { data: sampleHiddenTags, error: sampleHiddenTagsError },
    { data: albumSamples, error: albumSamplesError },
    { data: assets, error: assetsError },
    { data: jobs, error: jobsError },
  ] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order", { ascending: true }),
    supabase.from("sample_types").select("*").order("sort_order", { ascending: true }),
    supabase.from("moods").select("*").order("sort_order", { ascending: true }),
    supabase.from("hidden_tags").select("*").order("label", { ascending: true }),
    supabase.from("sample_moods").select("*").eq("sample_id", sampleId).order("sort_order", { ascending: true }),
    supabase.from("sample_hidden_tags").select("*").eq("sample_id", sampleId),
    supabase.from("album_samples").select("*").eq("sample_id", sampleId),
    supabase.from("sample_assets").select("*").eq("sample_id", sampleId),
    supabase
      .from("processing_jobs")
      .select("*")
      .eq("sample_id", sampleId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (
    categoriesError ||
    sampleTypesError ||
    moodsError ||
    hiddenTagsError ||
    sampleMoodsError ||
    sampleHiddenTagsError ||
    albumSamplesError ||
    assetsError ||
    jobsError
  ) {
    throw new AISUserSafeError("Unable to load the admin sample workspace.", "admin_sample_detail_failed", 500);
  }

  const safeCategories = categories ?? [];
  const safeSampleTypes = sampleTypes ?? [];
  const safeMoods = moods ?? [];
  const safeHiddenTags = hiddenTags ?? [];
  const safeSampleMoods = sampleMoods ?? [];
  const safeSampleHiddenTags = sampleHiddenTags ?? [];
  const safeAlbumSamples = albumSamples ?? [];
  const safeAssets = assets ?? [];
  const safeJobs = jobs ?? [];
  const assetStatuses = await resolveAssetStatuses(safeAssets, storage);
  const latestInitialUploadJob = safeJobs.find((job) => job.job_type === "initial_upload") ?? null;
  const duplicateWarning = await buildDuplicateWarning(supabase, latestInitialUploadJob?.metadata);
  const poeticNameIsUnique = await isPoeticNameUnique(supabase, sample.poetic_name, sample.id);
  const assignedMoodSlugs = safeSampleMoods.map((row) => row.mood_slug);
  const assignedHiddenTagSlugs = safeSampleHiddenTags.map((row) => row.tag_slug);
  const assignedAlbumIds = safeAlbumSamples.map((row) => row.album_id);
  const eligibility = computePublishEligibility({
    sample,
    moodSlugs: assignedMoodSlugs,
    hiddenTagSlugs: assignedHiddenTagSlugs,
    albumIds: assignedAlbumIds,
    categoryActive: safeCategories.some((category) => category.slug === sample.category_slug && category.is_active),
    sampleTypeActive: safeSampleTypes.some((sampleType) => sampleType.slug === sample.sample_type_slug && sampleType.is_active),
    poeticNameIsUnique,
    latestInitialUploadJob,
    assets: assetStatuses,
    duplicateWarning,
  });
  const previewAsset = assetStatuses.find((asset) => asset.kind === "preview_audio");
  const waveformAsset = assetStatuses.find((asset) => asset.kind === "waveform_peaks");

  return {
    sample: toAdminSample(sample),
    taxonomy: {
      categories: safeCategories.map(toLookupOption),
      sample_types: safeSampleTypes.map((sampleType) => ({
        ...toLookupOption(sampleType),
        requires_bpm: sampleType.requires_bpm,
        can_be_loopable: sampleType.can_be_loopable,
      })),
      moods: safeMoods.map(toLookupOption),
      hidden_tags: safeHiddenTags.map(toLookupOption),
    },
    assigned_mood_slugs: assignedMoodSlugs,
    assigned_hidden_tag_slugs: assignedHiddenTagSlugs,
    assigned_album_ids: assignedAlbumIds,
    assets: assetStatuses,
    latest_processing_job: latestInitialUploadJob ? toProcessingJobSummary(latestInitialUploadJob) : null,
    duplicate_warning: duplicateWarning,
    eligibility,
    preview: {
      preview_url: previewAsset?.public_url ?? null,
      waveform_peaks_url: waveformAsset?.public_url ?? null,
      asset_warnings: assetStatuses
        .filter((asset) => asset.kind !== "original_wav" && asset.status !== "present")
        .map((asset) => `${asset.label} is ${asset.status.replaceAll("_", " ")}.`),
    },
  };
}

export async function updateAdminSample(
  sampleId: string,
  patch: AdminSamplePatchRequest,
  actor: AdminSampleActor,
  options: AdminSampleServiceOptions = {},
) {
  const supabase = getSupabase(options);
  const before = await requireSample(supabase, sampleId);
  const input = adminSamplePatchSchema.parse(patch);
  const now = getNowIso(options);
  const update = await buildSampleUpdate(supabase, before, input, actor, now);

  if (Object.keys(update.sampleUpdate).length > 0) {
    const { error } = await supabase.from("samples").update(update.sampleUpdate).eq("id", sampleId);

    if (error) {
      throw new AISUserSafeError("Unable to save sample metadata.", "admin_sample_update_failed", 500);
    }
  }

  if (input.mood_slugs) {
    await replaceSampleMoods(supabase, sampleId, input.mood_slugs);
  }

  if (input.hidden_tag_slugs) {
    await replaceSampleHiddenTags(supabase, sampleId, input.hidden_tag_slugs);
  }

  if (input.duplicate_acknowledgement) {
    await acknowledgeDuplicateWarning(supabase, sampleId, input.duplicate_acknowledgement.reason ?? null, actor, now);
  }

  await writeUpdateAuditLogs(supabase, before, await requireSample(supabase, sampleId), input, actor);

  return getAdminSampleDetail(sampleId, { ...options, supabase });
}

export async function getPublishEligibility(
  sampleId: string,
  options: AdminSampleServiceOptions = {},
) {
  return (await getAdminSampleDetail(sampleId, options)).eligibility;
}

export async function publishAdminSample(
  sampleId: string,
  actor: AdminSampleActor,
  options: AdminSampleServiceOptions = {},
) {
  const supabase = getSupabase(options);
  const detail = await getAdminSampleDetail(sampleId, { ...options, supabase });

  if (!detail.eligibility.can_publish) {
    throw new PublishEligibilityError(detail.eligibility);
  }

  if (detail.sample.status === "published") {
    return {
      sample_id: detail.sample.id,
      status: detail.sample.status,
      public_path: sampleDetailRoute(detail.sample.poetic_name),
      eligibility: detail.eligibility,
    };
  }

  const before = await requireSample(supabase, sampleId);
  const now = getNowIso(options);
  const update: PublicTableUpdate<"samples"> = {
    status: "published",
    published_at: before.published_at ?? now,
    archived_at: null,
    failed_at: null,
  };
  const { data: published, error } = await supabase
    .from("samples")
    .update(update)
    .eq("id", sampleId)
    .select("*")
    .single();

  if (error || !published) {
    throw new AISUserSafeError("Unable to publish sample.", "sample_publish_failed", 500);
  }

  await refreshSearchDocument(supabase, sampleId);
  await writeAdminAuditLog(supabase, {
    actorUserId: actor.userId,
    action: "sample.publish",
    entityType: "sample",
    entityId: sampleId,
    beforeData: toAuditSampleSnapshot(before),
    afterData: toAuditSampleSnapshot(published),
  });

  return {
    sample_id: published.id,
    status: published.status,
    public_path: sampleDetailRoute(published.poetic_name),
    eligibility: (await getAdminSampleDetail(sampleId, { ...options, supabase })).eligibility,
  };
}

export async function archiveAdminSample(
  sampleId: string,
  actor: AdminSampleActor,
  options: AdminSampleServiceOptions = {},
) {
  const supabase = getSupabase(options);
  const before = await requireSample(supabase, sampleId);
  const now = getNowIso(options);
  const { data, error } = await supabase
    .from("samples")
    .update({
      status: "archived",
      archived_at: now,
    } satisfies PublicTableUpdate<"samples">)
    .eq("id", sampleId)
    .select("*")
    .single();

  if (error || !data) {
    throw new AISUserSafeError("Unable to archive sample.", "sample_archive_failed", 500);
  }

  await refreshSearchDocument(supabase, sampleId);
  await writeAdminAuditLog(supabase, {
    actorUserId: actor.userId,
    action: "sample.archive",
    entityType: "sample",
    entityId: sampleId,
    beforeData: toAuditSampleSnapshot(before),
    afterData: toAuditSampleSnapshot(data),
  });

  return {
    sample_id: data.id,
    status: data.status,
    public_path: null,
  };
}

export async function restoreAdminSampleToReview(
  sampleId: string,
  actor: AdminSampleActor,
  options: AdminSampleServiceOptions = {},
) {
  const supabase = getSupabase(options);
  const before = await requireSample(supabase, sampleId);
  const { data, error } = await supabase
    .from("samples")
    .update({
      status: "needs_review",
      archived_at: null,
    } satisfies PublicTableUpdate<"samples">)
    .eq("id", sampleId)
    .select("*")
    .single();

  if (error || !data) {
    throw new AISUserSafeError("Unable to restore sample to review.", "sample_restore_failed", 500);
  }

  await refreshSearchDocument(supabase, sampleId);
  await writeAdminAuditLog(supabase, {
    actorUserId: actor.userId,
    action: "sample.restore_to_review",
    entityType: "sample",
    entityId: sampleId,
    beforeData: toAuditSampleSnapshot(before),
    afterData: toAuditSampleSnapshot(data),
  });

  return {
    sample_id: data.id,
    status: data.status,
    public_path: null,
  };
}

export function computePublishEligibility(context: PublishEligibilityContext): PublishEligibility {
  const blockers: PublishBlocker[] = [];
  const warnings: PublishWarning[] = [];
  const { sample } = context;

  addBlockerIf(blockers, sample.poetic_name.startsWith("draft_"), {
    code: "temporary_poetic_name",
    field: "poetic_name",
    message: "Replace the temporary draft poetic name before publishing.",
    action_label: "Edit poetic name",
  });
  addBlockerIf(blockers, !poeticNamePattern.test(sample.poetic_name), {
    code: "invalid_poetic_name",
    field: "poetic_name",
    message: "Poetic name must use lowercase words separated by underscores.",
  });
  addBlockerIf(blockers, !context.poeticNameIsUnique, {
    code: "duplicate_poetic_name",
    field: "poetic_name",
    message: "Another sample already uses this poetic name.",
  });
  addBlockerIf(blockers, sample.display_title.trim().length === 0, {
    code: "missing_display_title",
    field: "display_title",
    message: "Display title is required before publish.",
  });
  addBlockerIf(blockers, !context.categoryActive, {
    code: "missing_category",
    field: "category_slug",
    message: "Choose an active category.",
  });
  addBlockerIf(blockers, !context.sampleTypeActive, {
    code: "missing_sample_type",
    field: "sample_type_slug",
    message: "Choose an active sample type.",
  });
  addBlockerIf(blockers, context.moodSlugs.length === 0, {
    code: "missing_mood",
    field: "mood_slugs",
    message: "Assign at least one mood.",
  });
  addBlockerIf(blockers, context.moodSlugs.length > 3, {
    code: "too_many_moods",
    field: "mood_slugs",
    message: "Assign no more than three moods.",
  });
  addBlockerIf(blockers, (sample.sample_type_slug === "loop" || sample.loopable) && sample.bpm === null, {
    code: "loop_missing_bpm",
    field: "bpm",
    message: "Loop and loopable samples require BPM.",
  });
  addBlockerIf(blockers, sample.bpm !== null && (sample.bpm <= 0 || sample.bpm > 400), {
    code: "invalid_bpm",
    field: "bpm",
    message: "BPM must be between 1 and 400.",
  });
  addBlockerIf(blockers, sample.is_melodic && !sample.musical_key && !sample.unknown_key_confirmed, {
    code: "melodic_missing_key",
    field: "musical_key",
    message: "Melodic samples need a key or explicit unknown-key confirmation.",
  });
  addBlockerIf(blockers, sample.license_status !== "verified", {
    code: "license_not_verified",
    field: "license_status",
    message: "License status must be verified.",
  });
  addBlockerIf(blockers, !sample.license_confirmed_at || !sample.license_confirmed_by, {
    code: "license_not_confirmed",
    field: "license_confirmed",
    message: "An admin must confirm the license before publish.",
  });
  addBlockerIf(blockers, !sample.commercial_use_allowed, {
    code: "commercial_use_not_allowed",
    field: "commercial_use_allowed",
    message: "Commercial use must be allowed.",
  });
  addBlockerIf(blockers, sample.redistribution_allowed, {
    code: "redistribution_allowed",
    field: "redistribution_allowed",
    message: "Redistribution must remain locked off.",
  });
  addBlockerIf(blockers, !sample.rights_owner?.trim(), {
    code: "missing_rights_owner",
    field: "rights_owner",
    message: "Rights owner is required before publish.",
  });
  addBlockerIf(
    blockers,
    sample.status !== "published" && context.latestInitialUploadJob?.status !== "succeeded",
    {
      code: "processing_not_complete",
      message: "The latest initial upload processing job must succeed before publish.",
    },
  );
  addBlockerIf(blockers, sample.status === "failed", {
    code: "sample_failed",
    message: "Failed samples must be reprocessed before publish.",
  });
  addBlockerIf(blockers, sample.status === "archived", {
    code: "archived_sample",
    message: "Archived samples must be restored to review before publish.",
  });

  for (const asset of context.assets) {
    if (asset.status === "present") {
      continue;
    }

    addBlockerIf(blockers, asset.kind === "original_wav", {
      code: "missing_original_asset",
      message: "Original WAV asset is missing or unreachable.",
    });
    addBlockerIf(blockers, asset.kind === "preview_audio", {
      code: "missing_preview_asset",
      message: "Preview audio asset is missing or unreachable.",
    });
    addBlockerIf(blockers, asset.kind === "waveform_peaks", {
      code: "missing_waveform_asset",
      message: "Waveform peaks asset is missing or unreachable.",
    });
  }

  addBlockerIf(blockers, context.duplicateWarning.is_duplicate && !context.duplicateWarning.acknowledged, {
    code: "duplicate_not_acknowledged",
    message: "A duplicate source warning must be acknowledged before publish.",
  });

  addWarningIf(warnings, !sample.short_description?.trim(), {
    code: "missing_short_description",
    field: "short_description",
    message: "Short description is empty.",
    requires_acknowledgement: false,
  });
  addWarningIf(warnings, context.hiddenTagSlugs.length === 0, {
    code: "no_hidden_tags",
    field: "hidden_tag_slugs",
    message: "No hidden search tags are assigned.",
    requires_acknowledgement: false,
  });
  addWarningIf(warnings, context.albumIds.length === 0, {
    code: "no_album",
    message: "Sample is not assigned to an album.",
    requires_acknowledgement: false,
  });
  addWarningIf(warnings, sample.featured && !sample.short_description?.trim(), {
    code: "featured_without_description",
    field: "featured",
    message: "Featured samples read better with a short description.",
    requires_acknowledgement: false,
  });
  addWarningIf(warnings, Number(sample.duration_seconds ?? 0) > 120, {
    code: "long_duration",
    message: "Duration is unusually long for a sample library.",
    requires_acknowledgement: false,
  });
  addWarningIf(warnings, sample.sample_rate !== null && ![44100, 48000].includes(sample.sample_rate), {
    code: "unusual_sample_rate",
    message: "Sample rate is valid but uncommon.",
    requires_acknowledgement: false,
  });
  addWarningIf(warnings, sample.channels === 1, {
    code: "mono_file",
    message: "Source is mono.",
    requires_acknowledgement: false,
  });

  return {
    can_publish: blockers.length === 0,
    blockers,
    warnings,
  };
}

function getSupabase(options: AdminSampleServiceOptions) {
  return options.supabase ?? createSupabaseAdminClient();
}

function getStorage(options: AdminSampleServiceOptions) {
  return options.storage ?? createDefaultStorageProvider();
}

function getNowIso(options: AdminSampleServiceOptions) {
  return (options.now?.() ?? new Date()).toISOString();
}

async function requireSample(supabase: SupabaseDatabaseClient, sampleId: string) {
  const { data, error } = await supabase.from("samples").select("*").eq("id", sampleId).maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load sample.", "admin_sample_lookup_failed", 500);
  }

  if (!data) {
    throw new AISUserSafeError("Sample was not found.", "admin_sample_not_found", 404);
  }

  return data;
}

async function resolveAssetStatuses(
  assets: SampleAssetRow[],
  storage: StorageProvider,
): Promise<AdminSampleAssetStatus[]> {
  return Promise.all(
    requiredAssetKinds.map(async (kind) => {
      const asset = assets.find((row) => row.kind === kind);

      if (!asset) {
        return {
          kind,
          label: assetLabel(kind),
          status: "missing_row",
          access_level: null,
          public_url: null,
        };
      }

      const exists = await storage.exists({ bucket: asset.bucket, objectPath: asset.object_path }).catch(() => false);

      return {
        kind,
        label: assetLabel(kind),
        status: exists ? "present" : "missing_object",
        access_level: asset.access_level,
        public_url: exists && kind !== "original_wav"
          ? storage.getPublicUrl({ bucket: asset.bucket, objectPath: asset.object_path })
          : null,
      };
    }),
  );
}

async function buildDuplicateWarning(
  supabase: SupabaseDatabaseClient,
  metadata: Json | null | undefined,
): Promise<AdminSampleDuplicateWarning> {
  const metadataObject = asRecord(metadata);
  const duplicateCheck = asRecord(metadataObject?.duplicate_check);
  const acknowledgement = asRecord(metadataObject?.duplicate_acknowledgement);
  const matchingSampleIds = Array.isArray(duplicateCheck?.matching_sample_ids)
    ? [...new Set(duplicateCheck.matching_sample_ids.filter((id): id is string => typeof id === "string"))]
    : [];
  const isDuplicate = duplicateCheck?.is_duplicate === true || matchingSampleIds.length > 0;
  const acknowledged = acknowledgement?.acknowledged === true;
  const matchingSamples = matchingSampleIds.length
    ? await loadDuplicateSampleSummaries(supabase, matchingSampleIds)
    : [];

  return {
    is_duplicate: isDuplicate,
    matching_sample_ids: matchingSampleIds,
    acknowledged,
    acknowledged_at: typeof acknowledgement?.acknowledged_at === "string" ? acknowledgement.acknowledged_at : null,
    acknowledged_by: typeof acknowledgement?.acknowledged_by === "string" ? acknowledgement.acknowledged_by : null,
    reason: typeof acknowledgement?.reason === "string" ? acknowledgement.reason : null,
    matching_samples: matchingSamples,
  };
}

async function loadDuplicateSampleSummaries(
  supabase: SupabaseDatabaseClient,
  ids: string[],
): Promise<AdminSampleDuplicateWarning["matching_samples"]> {
  const { data, error } = await supabase
    .from("samples")
    .select("id,poetic_name,display_title,status")
    .in("id", ids);

  if (error) {
    return [];
  }

  return data ?? [];
}

async function isPoeticNameUnique(supabase: SupabaseDatabaseClient, poeticName: string, sampleId: string) {
  const { data, error } = await supabase
    .from("samples")
    .select("id")
    .eq("poetic_name", poeticName)
    .neq("id", sampleId)
    .limit(1);

  if (error) {
    throw new AISUserSafeError("Unable to validate poetic name uniqueness.", "poetic_name_lookup_failed", 500);
  }

  return (data ?? []).length === 0;
}

async function buildSampleUpdate(
  supabase: SupabaseDatabaseClient,
  before: SampleRow,
  input: PatchInput,
  actor: AdminSampleActor,
  now: string,
) {
  const sampleUpdate: PublicTableUpdate<"samples"> = {};

  if (input.poetic_name !== undefined) {
    if (
      before.status === "published" &&
      input.poetic_name !== before.poetic_name &&
      input.confirm_published_poetic_name_change !== before.poetic_name
    ) {
      throw new AISUserSafeError(
        "Published poetic name changes require typed confirmation.",
        "published_poetic_name_confirmation_required",
        409,
      );
    }

    if (before.status === "published" && input.poetic_name !== before.poetic_name) {
      assertOwnerCanChangePublishedIdentity(actor);
    }

    sampleUpdate.poetic_name = input.poetic_name;
  }

  const nextPoeticName = sampleUpdate.poetic_name ?? before.poetic_name;

  if (input.display_title !== undefined || input.display_title_is_custom === false) {
    if (input.display_title && input.display_title_is_custom !== false) {
      sampleUpdate.display_title = input.display_title;
      sampleUpdate.display_title_is_custom = true;
    } else {
      sampleUpdate.display_title = displayTitleFromPoeticName(nextPoeticName);
      sampleUpdate.display_title_is_custom = false;
    }
  }

  assignIfDefined(sampleUpdate, "short_description", input.short_description);
  assignIfDefined(sampleUpdate, "category_slug", input.category_slug);
  assignIfDefined(sampleUpdate, "sample_type_slug", input.sample_type_slug);
  assignIfDefined(sampleUpdate, "bpm", input.bpm);
  assignIfDefined(sampleUpdate, "musical_key", input.musical_key);
  assignIfDefined(sampleUpdate, "is_melodic", input.is_melodic);
  assignIfDefined(sampleUpdate, "unknown_key_confirmed", input.unknown_key_confirmed);
  assignIfDefined(sampleUpdate, "loopable", input.loopable);
  assignIfDefined(sampleUpdate, "featured", input.featured);
  assignIfDefined(sampleUpdate, "source_type", input.source_type);
  assignIfDefined(sampleUpdate, "rights_owner", input.rights_owner);
  assignIfDefined(sampleUpdate, "commercial_use_allowed", input.commercial_use_allowed);
  assignIfDefined(sampleUpdate, "attribution_required", input.attribution_required);
  assignIfDefined(sampleUpdate, "license_status", input.license_status);
  assignIfDefined(sampleUpdate, "license_notes", input.license_notes);

  if (input.redistribution_allowed === false) {
    sampleUpdate.redistribution_allowed = false;
  }

  if (input.license_confirmed === true) {
    sampleUpdate.license_confirmed_at = now;
    sampleUpdate.license_confirmed_by = actor.userId;
  } else if (input.license_confirmed === false) {
    sampleUpdate.license_confirmed_at = null;
    sampleUpdate.license_confirmed_by = null;
  }

  await validateLookupValues(supabase, input);

  const afterForLicense = {
    ...before,
    ...sampleUpdate,
  };

  if (before.status === "published" && !isLicensePublishSafe(afterForLicense)) {
    if (!input.archive_if_license_invalid) {
      throw new AISUserSafeError(
        "Invalid license changes on a published sample must archive the sample in the same action.",
        "published_license_change_requires_archive",
        409,
      );
    }

    sampleUpdate.status = "archived";
    sampleUpdate.archived_at = now;
  }

  return { sampleUpdate };
}

async function validateLookupValues(supabase: SupabaseDatabaseClient, input: PatchInput) {
  const checks: Array<Promise<void>> = [];

  if (input.category_slug) {
    checks.push(assertLookupExists(supabase, "categories", input.category_slug, "invalid_category"));
  }

  if (input.sample_type_slug) {
    checks.push(assertLookupExists(supabase, "sample_types", input.sample_type_slug, "invalid_sample_type"));
  }

  if (input.mood_slugs) {
    checks.push(...input.mood_slugs.map((slug) => assertLookupExists(supabase, "moods", slug, "invalid_mood")));
  }

  if (input.hidden_tag_slugs) {
    checks.push(
      ...input.hidden_tag_slugs.map((slug) => assertLookupExists(supabase, "hidden_tags", slug, "invalid_hidden_tag")),
    );
  }

  await Promise.all(checks);
}

async function assertLookupExists(
  supabase: SupabaseDatabaseClient,
  table: "categories" | "sample_types" | "moods" | "hidden_tags",
  slug: string,
  code: string,
) {
  const { data, error } = await supabase
    .from(table)
    .select("slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to validate taxonomy.", "taxonomy_lookup_failed", 500);
  }

  if (!data) {
    throw new AISUserSafeError("Taxonomy value is not available.", code, 400);
  }
}

async function replaceSampleMoods(supabase: SupabaseDatabaseClient, sampleId: string, moodSlugs: string[]) {
  const rows: PublicTableInsert<"sample_moods">[] = moodSlugs.map((moodSlug, index) => ({
    sample_id: sampleId,
    mood_slug: moodSlug,
    sort_order: index,
  }));

  const deleteResult = await supabase.from("sample_moods").delete().eq("sample_id", sampleId);

  if (deleteResult.error) {
    throw new AISUserSafeError("Unable to replace sample moods.", "sample_moods_update_failed", 500);
  }

  if (rows.length === 0) {
    return;
  }

  const insertResult = await supabase.from("sample_moods").insert(rows);

  if (insertResult.error) {
    throw new AISUserSafeError("Unable to save sample moods.", "sample_moods_update_failed", 500);
  }
}

async function replaceSampleHiddenTags(
  supabase: SupabaseDatabaseClient,
  sampleId: string,
  tagSlugs: string[],
) {
  const rows: PublicTableInsert<"sample_hidden_tags">[] = tagSlugs.map((tagSlug) => ({
    sample_id: sampleId,
    tag_slug: tagSlug,
  }));

  const deleteResult = await supabase.from("sample_hidden_tags").delete().eq("sample_id", sampleId);

  if (deleteResult.error) {
    throw new AISUserSafeError("Unable to replace sample hidden tags.", "sample_hidden_tags_update_failed", 500);
  }

  if (rows.length === 0) {
    return;
  }

  const insertResult = await supabase.from("sample_hidden_tags").insert(rows);

  if (insertResult.error) {
    throw new AISUserSafeError("Unable to save sample hidden tags.", "sample_hidden_tags_update_failed", 500);
  }
}

async function acknowledgeDuplicateWarning(
  supabase: SupabaseDatabaseClient,
  sampleId: string,
  reason: string | null,
  actor: AdminSampleActor,
  now: string,
) {
  const { data: job, error } = await supabase
    .from("processing_jobs")
    .select("*")
    .eq("sample_id", sampleId)
    .eq("job_type", "initial_upload")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !job) {
    throw new AISUserSafeError("Unable to load duplicate warning metadata.", "duplicate_warning_lookup_failed", 500);
  }

  const metadata = {
    ...(asRecord(job.metadata) ?? {}),
    duplicate_acknowledgement: {
      acknowledged: true,
      acknowledged_by: actor.userId,
      acknowledged_at: now,
      reason,
    },
  };

  const { error: updateError } = await supabase
    .from("processing_jobs")
    .update({ metadata } satisfies PublicTableUpdate<"processing_jobs">)
    .eq("id", job.id);

  if (updateError) {
    throw new AISUserSafeError("Unable to acknowledge duplicate warning.", "duplicate_acknowledgement_failed", 500);
  }

  await writeAdminAuditLog(supabase, {
    actorUserId: actor.userId,
    action: "sample.duplicate_acknowledge",
    entityType: "sample",
    entityId: sampleId,
    beforeData: {
      processing_job_id: job.id,
      duplicate_acknowledgement: (asRecord(job.metadata)?.duplicate_acknowledgement as Json | undefined) ?? null,
    },
    afterData: {
      processing_job_id: job.id,
      duplicate_acknowledgement: metadata.duplicate_acknowledgement,
    },
  });
}

async function writeUpdateAuditLogs(
  supabase: SupabaseDatabaseClient,
  before: SampleRow,
  after: SampleRow,
  input: PatchInput,
  actor: AdminSampleActor,
) {
  const writes: Array<Promise<void>> = [];

  if (hasAnyKey(input, ["poetic_name", "display_title", "short_description", "bpm", "musical_key", "is_melodic", "unknown_key_confirmed", "loopable"])) {
    writes.push(writeSampleAudit(supabase, "sample.metadata_update", before, after, actor));
  }

  if (hasAnyKey(input, ["category_slug", "sample_type_slug", "mood_slugs", "hidden_tag_slugs"])) {
    writes.push(writeSampleAudit(supabase, "sample.taxonomy_update", before, after, actor));
  }

  if (
    hasAnyKey(input, [
      "source_type",
      "rights_owner",
      "commercial_use_allowed",
      "redistribution_allowed",
      "attribution_required",
      "license_status",
      "license_notes",
      "license_confirmed",
    ])
  ) {
    writes.push(writeSampleAudit(supabase, "sample.license_update", before, after, actor));
  }

  if (input.featured !== undefined && before.featured !== after.featured) {
    writes.push(writeSampleAudit(supabase, "sample.featured_toggle", before, after, actor));
  }

  if (before.status !== "archived" && after.status === "archived") {
    writes.push(writeSampleAudit(supabase, "sample.archive", before, after, actor));
  }

  await Promise.all(writes);
  await refreshSearchDocument(supabase, before.id);
}

function writeSampleAudit(
  supabase: SupabaseDatabaseClient,
  action: string,
  before: SampleRow,
  after: SampleRow,
  actor: AdminSampleActor,
) {
  return writeAdminAuditLog(supabase, {
    actorUserId: actor.userId,
    action,
    entityType: "sample",
    entityId: before.id,
    beforeData: toAuditSampleSnapshot(before),
    afterData: toAuditSampleSnapshot(after),
  });
}

async function refreshSearchDocument(supabase: SupabaseDatabaseClient, sampleId: string) {
  await supabase.rpc("refresh_sample_search_document", { target_sample_id: sampleId });
}

function toAdminSample(sample: SampleRow): AdminSampleDetailResponse["sample"] {
  return {
    id: sample.id,
    poetic_name: sample.poetic_name,
    display_title: sample.display_title,
    display_title_is_custom: sample.display_title_is_custom,
    short_description: sample.short_description,
    category_slug: sample.category_slug,
    sample_type_slug: sample.sample_type_slug,
    bpm: sample.bpm,
    musical_key: sample.musical_key,
    is_melodic: sample.is_melodic,
    unknown_key_confirmed: sample.unknown_key_confirmed,
    duration_seconds: sample.duration_seconds,
    loopable: sample.loopable,
    file_hash_sha256: sample.file_hash_sha256,
    file_size_bytes: sample.file_size_bytes,
    sample_rate: sample.sample_rate,
    bit_depth: sample.bit_depth,
    channels: sample.channels,
    status: sample.status,
    license_status: sample.license_status,
    source_type: sample.source_type,
    rights_owner: sample.rights_owner,
    commercial_use_allowed: sample.commercial_use_allowed,
    redistribution_allowed: sample.redistribution_allowed,
    attribution_required: sample.attribution_required,
    license_notes: sample.license_notes,
    license_confirmed_at: sample.license_confirmed_at,
    license_confirmed_by: sample.license_confirmed_by,
    featured: sample.featured,
    published_at: sample.published_at,
    archived_at: sample.archived_at,
    failed_at: sample.failed_at,
    updated_at: sample.updated_at,
  };
}

function toLookupOption(row: CategoryRow | MoodRow | HiddenTagRow) {
  return {
    slug: row.slug,
    label: row.label,
    description: row.description,
    is_active: row.is_active,
  };
}

function toProcessingJobSummary(job: ProcessingJobRow): AdminSampleProcessingJobSummary {
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

function assetLabel(kind: (typeof requiredAssetKinds)[number]) {
  if (kind === "original_wav") {
    return "Original WAV";
  }

  if (kind === "preview_audio") {
    return "Preview audio";
  }

  return "Waveform peaks";
}

function displayTitleFromPoeticName(poeticName: string) {
  return poeticName
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function assignIfDefined<
  Key extends keyof PublicTableUpdate<"samples">,
>(target: PublicTableUpdate<"samples">, key: Key, value: PublicTableUpdate<"samples">[Key] | undefined) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function isLicensePublishSafe(sample: Pick<SampleRow, "license_status" | "commercial_use_allowed" | "redistribution_allowed" | "license_confirmed_at" | "license_confirmed_by">) {
  return (
    sample.license_status === "verified" &&
    sample.commercial_use_allowed === true &&
    sample.redistribution_allowed === false &&
    Boolean(sample.license_confirmed_at) &&
    Boolean(sample.license_confirmed_by)
  );
}

function toAuditSampleSnapshot(sample: SampleRow): Json {
  return {
    id: sample.id,
    poetic_name: sample.poetic_name,
    display_title: sample.display_title,
    category_slug: sample.category_slug,
    sample_type_slug: sample.sample_type_slug,
    status: sample.status,
    license_status: sample.license_status,
    source_type: sample.source_type,
    rights_owner: sample.rights_owner,
    commercial_use_allowed: sample.commercial_use_allowed,
    redistribution_allowed: sample.redistribution_allowed,
    attribution_required: sample.attribution_required,
    featured: sample.featured,
    published_at: sample.published_at,
    archived_at: sample.archived_at,
  };
}

function addBlockerIf(blockers: PublishBlocker[], condition: boolean, blocker: PublishBlocker) {
  if (condition) {
    blockers.push(blocker);
  }
}

function addWarningIf(warnings: PublishWarning[], condition: boolean, warning: PublishWarning) {
  if (condition) {
    warnings.push(warning);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasAnyKey(input: PatchInput, keys: Array<keyof PatchInput>) {
  return keys.some((key) => input[key] !== undefined);
}

function assertOwnerCanChangePublishedIdentity(actor: AdminSampleActor) {
  const ownerEmail = process.env.AIS_OWNER_EMAIL?.trim().toLowerCase();

  if (!ownerEmail) {
    throw new AISUserSafeError(
      "AIS_OWNER_EMAIL must be configured before changing a published poetic name.",
      "owner_email_required_for_identity_change",
      409,
    );
  }

  if (actor.email?.trim().toLowerCase() !== ownerEmail) {
    throw new AISUserSafeError(
      "Only the configured AIS owner can change a published poetic name.",
      "owner_required_for_published_identity_change",
      403,
    );
  }
}
