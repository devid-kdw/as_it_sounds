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

export type UploadSessionCreateApiResponse =
  | UploadSessionCreateResponse
  | ApiErrorResponse;

export type ProcessingJobRetryResponse = {
  processing_job_id: string;
  status: "queued";
  retry_eligible: boolean;
  reason: string | null;
};
