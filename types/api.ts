import type { Database } from "./database.types";

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
