import type { Database } from "./database.types";
import type { SampleTaxonomyValue } from "./sample";

export type ApiErrorResponse = {
  ok: false;
  code: string;
  message: string;
  blockers?: PublishBlocker[];
  warnings?: PublishWarning[];
  field_errors?: Record<string, string>;
};

export type ApiSuccessResponse<T> = {
  ok: true;
  data: T;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type SearchSort =
  | "relevance"
  | "newest"
  | "most_played"
  | "most_downloaded"
  | "most_favorited"
  | "featured"
  | "random_seeded";

export type SearchSource = "web" | "plugin";

export type SearchInput = {
  query?: string | null;
  moods?: string[];
  categories?: string[];
  sampleTypes?: string[];
  bpmMin?: number | null;
  bpmMax?: number | null;
  musicalKey?: string | null;
  loopable?: boolean | null;
  featuredOnly?: boolean;
  albumId?: string | null;
  sort?: SearchSort | null;
  page?: number | null;
  pageSize?: number | null;
  seed?: string | null;
  source?: SearchSource;
};

export type SearchSampleAsset = {
  bucket: string;
  objectPath: string;
  publicUrl?: string;
};

export type SearchSampleResult = {
  id: string;
  poeticName: string;
  displayTitle: string;
  displayTitleIsCustom: boolean;
  shortDescription: string | null;
  category: SampleTaxonomyValue;
  sampleType: SampleTaxonomyValue;
  moods: SampleTaxonomyValue[];
  bpm: number | null;
  musicalKey: string | null;
  durationSeconds: number | null;
  loopable: boolean;
  featured: boolean;
  publishedAt: string | null;
  previewAsset: SearchSampleAsset | null;
  waveformAsset: SearchSampleAsset | null;
  previewAssetUrl: string | null;
  waveformPeaksUrl: string | null;
  stats?: {
    playCount: number;
    downloadCount: number;
    favoriteCount: number;
  };
  score?: number;
  isFavoritedByCurrentUser: boolean;
};

export type SuggestedCategory = SampleTaxonomyValue & {
  weight: number;
  reason: "mood_suggestion";
};

export type SearchResponse = {
  results: SearchSampleResult[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  normalizedQuery: string | null;
  appliedFilters: SearchInput;
  suggestedCategories?: SuggestedCategory[];
};

export type SearchLogInput = {
  userId?: string | null;
  source?: SearchSource | null;
  query?: string | null;
  filters?: SearchInput;
  resultCount?: number | null;
  clickedSampleId?: string | null;
};

export type SimilarOptions = {
  limit?: number | null;
  albumContext?: boolean | null;
  source?: SearchSource | null;
};

export type WanderInput = SearchInput & {
  limit?: number | null;
  excludeSampleIds?: string[];
};

export type LocalActionKind = "exported_to_dropzone" | "revealed" | "copy_path";
export type LocalUsageEventName =
  | "browse_viewed"
  | "sample_played"
  | "sample_previewed"
  | "sample_exported_to_dropzone"
  | "local_path_revealed"
  | "local_path_copied"
  | "sample_added_to_project_crate"
  | "sample_marked_used"
  | "sample_favorited"
  | "collection_created"
  | "wander_started"
  | "wander_skipped"
  | "search_submitted"
  | "no_results_search";
export type ProjectCrateSampleStatus = "considered" | "exported" | "used";
export type LocalCrateSampleStatus = ProjectCrateSampleStatus;
export type ProjectCrateSyncAction =
  | "create_crate"
  | "select_active"
  | "create_or_select"
  | "add_sample"
  | "mark_used"
  | "sync_exported_path"
  | "sync_exported_paths";

export type LocalDropzoneExportRequest = {
  sampleId: string;
  projectName?: string | null;
  sourceCollectionId?: string | null;
  sourceCollectionName?: string | null;
  notes?: string | null;
};

export type LocalDropzoneExportResponse = {
  filename: string;
  tokenizedPath: string;
  dropzoneTokenizedPath: string;
  sampleId: string;
  action: Extract<LocalActionKind, "exported_to_dropzone">;
  projectCrate?: ProjectCrateSyncResponse | null;
};

export type LocalPathActionRequest = {
  tokenizedPath: string;
};

export type LocalRevealResponse = {
  tokenizedPath: string;
  revealed: boolean;
  action: Extract<LocalActionKind, "revealed">;
};

export type LocalCopyPathResponse = {
  tokenizedPath: string;
  absolutePath: string;
  action: Extract<LocalActionKind, "copy_path">;
};

export type LocalUsageEventRequest = {
  event: LocalUsageEventName;
  sampleId?: string | null;
  projectName?: string | null;
  sourceSurface?: "browse" | "detail" | "wander" | "collection" | "admin-preview" | "local-crate" | null;
  tokenizedPath?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type LocalUsageEventResponse = {
  accepted: true;
  logged: true;
  event: LocalUsageEventName;
  loggedAt: string;
};

export type ActiveProjectCrateRequest = {
  projectName: string;
};

export type ActiveProjectCrateResponse = {
  activeProjectName: string | null;
};

export type LocalDropzoneExportApiResponse = ApiResponse<LocalDropzoneExportResponse>;
export type LocalRevealApiResponse = ApiResponse<LocalRevealResponse>;
export type LocalCopyPathApiResponse = ApiResponse<LocalCopyPathResponse>;
export type LocalUsageEventApiResponse = ApiResponse<LocalUsageEventResponse>;
export type ActiveProjectCrateApiResponse = ApiResponse<ActiveProjectCrateResponse>;

export type ProjectCrateSampleSyncInput = {
  sampleId: string;
  sample_id?: string | null;
  poeticName?: string | null;
  poetic_name?: string | null;
  status?: ProjectCrateSampleStatus;
  exportedPath?: string | null;
  exported_path?: string | null;
  exportedPathTokenized?: string | null;
  exportedPathsTokenized?: string[];
  sourceCollectionId?: string | null;
  source_collection_id?: string | null;
  sourceCollectionName?: string | null;
  source_collection_name?: string | null;
  notes?: string | null;
};

export type ProjectCrateSyncRequest = {
  projectName?: string | null;
  crateName?: string | null;
  daw?: string | null;
  action?: ProjectCrateSyncAction;
  sample?: ProjectCrateSampleSyncInput | null;
  sampleId?: string | null;
  sample_id?: string | null;
  poeticName?: string | null;
  poetic_name?: string | null;
  status?: ProjectCrateSampleStatus | null;
  exportedPath?: string | null;
  exported_path?: string | null;
  exportedPathTokenized?: string | null;
  exportedPathsTokenized?: string[];
  sourceCollectionId?: string | null;
  source_collection_id?: string | null;
  sourceCollectionName?: string | null;
  source_collection_name?: string | null;
  notes?: string | null;
};

export type ProjectCrateSampleEntryResponse = {
  sample_id: string;
  poetic_name: string | null;
  status: ProjectCrateSampleStatus;
  exported_path: string | null;
  exported_paths: string[];
  source_collection_id: string | null;
  source_collection_name: string | null;
  first_added_at: string;
  last_updated_at: string;
  used_in_project: boolean;
  notes: string | null;
};

export type ProjectCrateManifestResponse = {
  schema_version: 1;
  project_name: string;
  daw: string;
  created_at: string;
  updated_at: string;
  active: boolean;
  selected_at: string | null;
  crate_path: string;
  exports_path: string;
  considered_samples_path: string;
  used_samples_path: string;
  samples: Record<string, ProjectCrateSampleEntryResponse>;
};

export type ProjectCrateSyncResponse = {
  action: ProjectCrateSyncAction;
  projectName: string;
  crateTokenizedPath: string;
  manifestTokenizedPath: string;
  tokenizedCratePath: string;
  tokenizedManifestPath: string;
  tokenizedExportsPath: string;
  activeProjectName: string;
  active: boolean;
  crate: ProjectCrateManifestResponse;
  manifest: ProjectCrateManifestResponse;
  entry: ProjectCrateSampleEntryResponse | null;
  missingExportedPaths: string[];
};

export type ProjectCrateSyncApiResponse = ApiResponse<ProjectCrateSyncResponse>;

export type LocalProjectCrateEntry = {
  sampleId: string;
  poeticName: string;
  displayTitle: string;
  bpm: number | null;
  musicalKey: string | null;
  status: LocalCrateSampleStatus;
  exportedPath: string | null;
  sourceCollectionId: string | null;
  sourceCollectionName: string | null;
  firstAddedAt: string;
  lastUpdatedAt: string;
  usedInProject: boolean;
  notes: string | null;
};

export type LocalCrateSyncRequest = {
  crateName: string;
  sample: {
    sampleId: string;
    poeticName: string;
    displayTitle?: string;
    bpm?: number | null;
    musicalKey?: string | null;
  };
  status: LocalCrateSampleStatus;
  exportedPath?: string | null;
  sourceCollectionId?: string | null;
  sourceCollectionName?: string | null;
  notes?: string | null;
};

export type LocalCrateSyncResponse = {
  crateName: string;
  entry: LocalProjectCrateEntry;
};

export type LocalCrateSyncApiResponse = ApiResponse<LocalCrateSyncResponse>;

export type UploadSessionMode = "single" | "bulk";

export type UploadSessionCreateRequest = {
  mode: UploadSessionMode;
  filename: string;
  content_type: string;
  file_size_bytes: number;
  category_slug: string;
  sample_type_slug: string;
  bpm?: number | null;
  batch_id?: string | null;
  bulk_position?: number | null;
};

export type UploadSessionCreateFileInput = {
  client_file_id?: string | null;
  filename: string;
  content_type: string;
  file_size_bytes: number;
};

export type UploadSessionsCreateRequest = {
  mode: UploadSessionMode;
  files: UploadSessionCreateFileInput[];
  initial_category_slug: string;
  initial_sample_type_slug: string;
  initial_bpm?: number | null;
  album_id?: string | null;
};

export type SignedUploadResponse = {
  url: string;
  token: string | null;
  expires_at: string;
};

export type UploadSessionCreateResponse = {
  sample_id: string;
  processing_job_id: string;
  upload_bucket: string;
  upload_path: string;
  signed_upload: SignedUploadResponse;
};

export type UploadSessionCreateApiResponse = ApiResponse<UploadSessionCreateResponse>;

export type UploadSessionBatchItemResponse = UploadSessionCreateResponse & {
  client_file_id: string | null;
  bulk_position: number;
  original_filename: string;
};

export type UploadSessionsCreateResponse = {
  batch_id: string | null;
  sessions: UploadSessionBatchItemResponse[];
};

export type UploadSessionsCreateApiResponse = ApiResponse<UploadSessionsCreateResponse>;

export type UploadSessionFinalizeRequest = {
  mode?: "single";
  sample_id: string;
  processing_job_id: string;
};

export type UploadSessionFinalizeResponse = {
  sample_id: string;
  processing_job_id: string;
  processing_status: string;
  sample_processing_status: string | null;
  finalized: true;
};

export type UploadSessionFinalizeApiResponse = ApiResponse<UploadSessionFinalizeResponse>;

export type BulkUploadFinalizeRequest = {
  batch_id: string;
  processing_job_ids?: string[];
};

export type BulkUploadFinalizeResponse = {
  batch_id: string;
  finalized_count: number;
  sessions: UploadSessionFinalizeResponse[];
};

export type BulkUploadStatusRow = {
  batch_id: string;
  client_file_id: string | null;
  bulk_position: number | null;
  original_filename: string | null;
  sample_id: string;
  processing_job_id: string;
  upload_finalized_at: string | null;
  processing_status: ProcessingJobStatus;
  sample_status: SampleStatus;
  job_type: ProcessingJobType;
  attempts: number;
  max_attempts: number;
  retry_eligible: boolean;
  retry_reason: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  duplicate_check: unknown;
  warnings: unknown;
  asset_status: Array<{
    kind: "original_wav" | "preview_audio" | "waveform_peaks";
    status: "present" | "missing_row";
    access_level: string | null;
  }>;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type BulkUploadStatusResponse = {
  batch_id: string;
  rows: BulkUploadStatusRow[];
};

export type ProcessingJobRetryResponse = {
  processing_job_id: string;
  status: "queued";
  retry_eligible: boolean;
  reason: string | null;
};

export type ProcessingJobStatusResponse = {
  processing_job_id: string;
  sample_id: string | null;
  job_type: string;
  processing_status: string;
  sample_processing_status: string | null;
  attempts: number;
  max_attempts: number;
  retry_eligible: boolean;
  retry_reason: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  warnings: unknown;
  duplicate_check: unknown;
  asset_status: Array<{
    kind: string;
    status: "present" | "missing_row";
    access_level: string | null;
  }>;
};

export type ProcessingJobStatusApiResponse = ApiResponse<ProcessingJobStatusResponse>;

export type SampleStatus = Database["public"]["Enums"]["sample_status"];
export type AlbumStatus = Database["public"]["Enums"]["album_status"];
export type LicenseStatus = Database["public"]["Enums"]["license_status"];
export type SourceType = Database["public"]["Enums"]["source_type"];
export type ProcessingJobStatus = Database["public"]["Enums"]["processing_job_status"];
export type ProcessingJobType = Database["public"]["Enums"]["processing_job_type"];

export type PublishBlocker = {
  code: string;
  field?: string;
  message: string;
  action_label?: string;
};

export type PublishWarning = {
  code: string;
  field?: string;
  message: string;
  requires_acknowledgement: boolean;
};

export type PublishEligibility = {
  can_publish: boolean;
  blockers: PublishBlocker[];
  warnings: PublishWarning[];
};

export type AdminLookupOption = {
  slug: string;
  label: string;
  description: string | null;
  is_active: boolean;
};

export type AdminSampleAssetStatus = {
  kind: "original_wav" | "preview_audio" | "waveform_peaks";
  label: string;
  status: "present" | "missing_row" | "missing_object";
  access_level: string | null;
  public_url: string | null;
};

export type AdminSampleProcessingJobSummary = {
  id: string;
  job_type: ProcessingJobType;
  status: ProcessingJobStatus;
  attempts: number;
  max_attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type AdminSampleDuplicateWarning = {
  is_duplicate: boolean;
  matching_sample_ids: string[];
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  reason: string | null;
  matching_samples: Array<{
    id: string;
    poetic_name: string;
    display_title: string;
    status: SampleStatus;
  }>;
};

export type AdminSampleReviewSample = {
  id: string;
  poetic_name: string;
  display_title: string;
  display_title_is_custom: boolean;
  short_description: string | null;
  category_slug: string;
  sample_type_slug: string;
  bpm: number | null;
  musical_key: string | null;
  is_melodic: boolean;
  unknown_key_confirmed: boolean;
  duration_seconds: number | null;
  loopable: boolean;
  file_hash_sha256: string | null;
  file_size_bytes: number | null;
  sample_rate: number | null;
  bit_depth: number | null;
  channels: number | null;
  status: SampleStatus;
  license_status: LicenseStatus;
  source_type: SourceType;
  rights_owner: string | null;
  commercial_use_allowed: boolean;
  redistribution_allowed: boolean;
  attribution_required: boolean;
  license_notes: string | null;
  license_confirmed_at: string | null;
  license_confirmed_by: string | null;
  featured: boolean;
  published_at: string | null;
  archived_at: string | null;
  failed_at: string | null;
  updated_at: string;
};

export type AdminSampleDetailResponse = {
  sample: AdminSampleReviewSample;
  taxonomy: {
    categories: AdminLookupOption[];
    sample_types: Array<AdminLookupOption & { requires_bpm: boolean; can_be_loopable: boolean }>;
    moods: AdminLookupOption[];
    hidden_tags: AdminLookupOption[];
  };
  assigned_mood_slugs: string[];
  assigned_hidden_tag_slugs: string[];
  assigned_album_ids: string[];
  assets: AdminSampleAssetStatus[];
  latest_processing_job: AdminSampleProcessingJobSummary | null;
  duplicate_warning: AdminSampleDuplicateWarning;
  eligibility: PublishEligibility;
  preview: {
    preview_url: string | null;
    waveform_peaks_url: string | null;
    asset_warnings: string[];
  };
};

export type AdminSamplePatchRequest = {
  poetic_name?: string;
  display_title?: string | null;
  display_title_is_custom?: boolean;
  short_description?: string | null;
  category_slug?: string;
  sample_type_slug?: string;
  mood_slugs?: string[];
  hidden_tag_slugs?: string[];
  bpm?: number | null;
  musical_key?: string | null;
  is_melodic?: boolean;
  unknown_key_confirmed?: boolean;
  loopable?: boolean;
  featured?: boolean;
  source_type?: SourceType;
  rights_owner?: string | null;
  commercial_use_allowed?: boolean;
  redistribution_allowed?: false;
  attribution_required?: boolean;
  license_status?: LicenseStatus;
  license_notes?: string | null;
  license_confirmed?: boolean;
  duplicate_acknowledgement?: {
    acknowledged: true;
    reason?: string | null;
  };
  confirm_published_poetic_name_change?: string;
  archive_if_license_invalid?: boolean;
};

export type AdminSampleDetailApiResponse = ApiResponse<AdminSampleDetailResponse>;
export type AdminSamplePatchApiResponse = ApiResponse<AdminSampleDetailResponse>;
export type PublishEligibilityApiResponse = ApiResponse<PublishEligibility>;

export type AdminSampleActionResponse = {
  sample_id: string;
  status: SampleStatus;
  public_path: string | null;
  eligibility?: PublishEligibility;
};

export type AdminSampleActionApiResponse = ApiResponse<AdminSampleActionResponse>;

export type AdminSampleListFilters = {
  status?: SampleStatus | "all";
  processing_status?: ProcessingJobStatus | "all";
  category_slug?: string;
  sample_type_slug?: string;
  mood_slug?: string;
  license_status?: LicenseStatus | "all";
  featured?: boolean;
  duplicate_warning?: boolean;
  missing_asset?: "any" | "original_wav" | "preview_audio" | "waveform_peaks";
  album_id?: string;
  publish_eligibility?: "eligible" | "blocked";
  query?: string;
  limit?: number;
  offset?: number;
};

export type AdminSampleListItem = {
  id: string;
  poetic_name: string;
  display_title: string;
  short_description: string | null;
  status: SampleStatus;
  category_slug: string;
  sample_type_slug: string;
  license_status: LicenseStatus;
  bpm: number | null;
  duration_seconds: number | null;
  featured: boolean;
  published_at: string | null;
  updated_at: string;
  original_filename: string | null;
  mood_slugs: string[];
  album_ids: string[];
  asset_status: Array<{
    kind: "original_wav" | "preview_audio" | "waveform_peaks";
    status: "present" | "missing_row";
    access_level: string | null;
  }>;
  latest_processing_job: AdminSampleProcessingJobSummary | null;
  duplicate_warning: {
    present: boolean;
    acknowledged: boolean;
    matching_sample_ids: string[];
  };
  publish_eligibility: Pick<PublishEligibility, "can_publish" | "blockers" | "warnings">;
};

export type AdminSampleListResponse = {
  filters: AdminSampleListFilters;
  items: AdminSampleListItem[];
  limit: number;
  offset: number;
};

export type AdminProcessingJobListFilters = {
  status?: ProcessingJobStatus | "all";
  job_type?: ProcessingJobType | "all";
  batch_id?: string;
  stuck?: boolean;
  limit?: number;
  offset?: number;
};

export type AdminProcessingJobListItem = {
  id: string;
  sample_id: string | null;
  sample_poetic_name: string | null;
  sample_display_title: string | null;
  sample_status: SampleStatus | null;
  original_filename: string | null;
  batch_id: string | null;
  bulk_position: number | null;
  job_type: ProcessingJobType;
  status: ProcessingJobStatus;
  attempts: number;
  max_attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  retry_eligible: boolean;
  retry_reason: string | null;
  is_stuck: boolean;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminProcessingJobListResponse = {
  filters: AdminProcessingJobListFilters;
  items: AdminProcessingJobListItem[];
  limit: number;
  offset: number;
};

export type AdminProcessingStuckResponse = {
  timed_out_count: number;
  jobs: AdminProcessingJobListItem[];
};

export type AdminReprocessJobResponse = {
  sample_id: string;
  processing_job_id: string;
  job_type: "reprocess_preview" | "reprocess_waveform";
  status: "queued";
};

export type AdminAlbumListItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: AlbumStatus;
  cover_image_path: string | null;
  sample_count: number;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminAlbumSampleItem = {
  album_id: string;
  sample_id: string;
  sort_order: number;
  poetic_name: string;
  display_title: string;
  status: SampleStatus;
};

export type AdminAlbumDetailResponse = {
  album: AdminAlbumListItem;
  samples: AdminAlbumSampleItem[];
};

export type AdminAlbumListResponse = {
  albums: AdminAlbumListItem[];
};

export type AdminAlbumMutationResponse = AdminAlbumDetailResponse;
