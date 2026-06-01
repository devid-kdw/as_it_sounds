# Backend Agent Handoff - Local Single WAV Upload

Date: 2026-05-31

Agent role: Backend Agent

Scope: Backend API/session/job status work for the local single-upload phase.

## Implemented Files

- `app/api/admin/upload-sessions/route.ts`
- `app/api/admin/upload-sessions/finalize/route.ts`
- `app/api/admin/upload-sessions/[processingJobId]/finalize/route.ts`
- `app/api/admin/processing-jobs/[jobId]/route.ts`
- `lib/upload-sessions.ts`
- `lib/processing-jobs.ts`
- `types/api.ts`

## Behavior

`POST /api/admin/upload-sessions`

- Requires `requireAdmin("/admin/upload")` before request parsing or any privileged work.
- Supports `mode = "single"` only for this route.
- Validates declared filename, WAV content type, positive bounded file size, initial `category_slug`, `sample_type_slug`, and loop BPM requirements.
- Rejects filenames with path separators/control characters.
- Verifies category and sample type are active lookup rows before creating the upload session.
- Creates one draft `samples` row with generated draft-safe identity:
  - `poetic_name = draft_upload_{sample uuid prefix}`
  - `display_title = "Draft Upload"`
  - original filename is not stored on the sample row.
- Creates one `processing_jobs` row:
  - `job_type = "initial_upload"`
  - `status = "queued"`
  - `input_bucket = "ais-processing-temp"`
  - `input_path = intake/{sample_id}/{processing_job_id}/source.wav`
  - declared/original upload metadata is stored only in `processing_jobs.metadata`.
- Returns only:
  - `sample_id`
  - `processing_job_id`
  - `upload_bucket`
  - `upload_path`
  - `signed_upload: { url, token, expires_at }`

Finalize endpoints

- Canonical path-style endpoint added at `POST /api/admin/upload-sessions/[processingJobId]/finalize`.
- Body-style endpoint also available at `POST /api/admin/upload-sessions/finalize`.
- Both require admin and call the same idempotent service helper.
- The body must include `sample_id`; `processing_job_id` is supplied by path or body depending on endpoint.
- Confirms the queued intake object exists before finalizing.
- Does not create any new processing jobs.
- Repeated finalize calls for already running/succeeded jobs no-op successfully without requiring the intake object to still exist.
- Writes/keeps `metadata.upload_finalized_at` and `metadata.upload_finalized_by`.

Polling endpoint

- `GET /api/admin/processing-jobs/[jobId]`
- Requires `requireAdmin("/admin/processing")`.
- Returns processing and sample status, attempts, retry eligibility, safe last error fields, and timestamps.
- Does not return intake paths, private original paths, or signed URLs.

## Verification

- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm test` passed: 59 passed, 1 skipped DB/RLS integration test gated by `AIS_RUN_DB_TESTS=1`.
- Focused local upload/processing/storage tests passed, including `tests/local-single-upload.test.mjs`.

## Notes / Blockers

- `pnpm run build` was attempted but Turbopack failed inside the sandbox while binding an internal local process port. I requested an outside-sandbox rerun and that approval was rejected, so production build remains unverified.
- Finalize queues/signals via the existing queued `initial_upload` job. Actual processing completion depends on the audio worker consuming queued jobs and using the existing `markProcessingJob*` helpers.
