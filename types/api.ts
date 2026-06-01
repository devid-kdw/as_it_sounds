export type ApiErrorResponse = {
  ok: false;
  code: string;
  message: string;
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
};

export type ProcessingJobStatusApiResponse = ApiResponse<ProcessingJobStatusResponse>;
