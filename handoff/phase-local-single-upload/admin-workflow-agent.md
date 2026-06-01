# Admin Workflow Agent Handoff - Local Single WAV Upload

Date: 2026-05-31

Agent role: Admin Workflow Agent

Scope: Admin workflow/spec reconciliation only for the local single-upload phase. No production app code was changed.

## Phase Goal

Make the local single-WAV admin path work end to end:

- Admin selects one real WAV in `/admin/upload`.
- Upload session creates a draft sample and queued processing job.
- Browser uploads directly to private intake storage.
- Processing starts locally, moves through visible job/sample states, and generates real assets.
- Successful processing moves the sample to `needs_review`.
- Admin can open the review workspace and see playable preview audio plus waveform peaks generated from the WAV.

Publishing is outside this phase, but the review UI must expose enough blockers/warnings to prove the sample is ready for the later publish gate.

## Spec Summary

The canonical single-upload path is shared across Doc 01 Section 7.1, Doc 01 Section 8, PIPE-07 through PIPE-21, ADM-08 through ADM-10, ADM-17/ADM-18, and LOCAL-14.2.

Required workflow:

1. Admin chooses exactly one WAV.
2. Browser performs early checks for extension, WAV MIME hint, and size.
3. Admin selects initial category and sample type before session creation because current schema needs valid taxonomy on draft rows.
4. Client calls `POST /api/admin/upload-sessions`.
5. Server verifies admin, validates the request, creates a temporary draft sample, creates a queued `initial_upload` processing job, and returns a scoped signed upload target for `ais-processing-temp`.
6. Browser uploads the WAV to `intake/{sample_id}/{upload_session_id}/source.wav`.
7. Browser calls an idempotent finalize endpoint, or the storage event starts processing. Local phase can use a direct finalize/controller path as long as it is idempotent.
8. Local worker claims the queued job, marks the job `running`, and moves the sample to `processing`.
9. Worker validates WAV, computes SHA-256, detects duplicates, extracts metadata, writes canonical original, generates MP3 preview, and generates real waveform peaks JSON.
10. Server writes `sample_assets` rows for `original_wav`, `preview_audio`, and `waveform_peaks`, marks the job `succeeded`, then moves the sample to `needs_review`.
11. Admin sees "Ready for review", opens `/admin/samples/[sampleId]/edit`, plays the preview, and sees the waveform from peaks JSON.

Processing success never publishes the sample. Public browse/search must continue to hide `draft`, `processing`, `needs_review`, `failed`, and `archived` samples.

## Required States

Sample statuses:

- `draft`: sample row exists before processing starts.
- `processing`: worker has claimed an initial upload job.
- `needs_review`: all required processing outputs and DB writes succeeded.
- `failed`: initial upload processing failed or timed out.
- `published`: later publish phase only.
- `archived`: later archive phase only.

Processing job statuses:

- `queued`: job exists and can be claimed.
- `running`: worker is processing; attempts increment when entering this state.
- `succeeded`: all required outputs and DB updates completed.
- `failed`: permanent failure or exhausted retry.
- `timed_out`: stale running worker exceeded expected duration.
- `canceled`: retryable only through admin/system action.

Admin asset statuses for review:

- `present`
- `missing_row`
- `missing_object`
- `invalid`
- `stale`
- `reprocessing`

`needs_review` requires all three required asset slots to be present and resolvable: `original_wav`, `preview_audio`, and `waveform_peaks`.

## API Contract

`POST /api/admin/upload-sessions`

- Admin-only.
- Validates WAV filename/content type hint and max file size.
- Validates active initial category and sample type.
- Creates `samples.status = 'draft'` with temporary draft identity, not the original filename.
- Creates `processing_jobs.status = 'queued'`, `job_type = 'initial_upload'`, `input_bucket = 'ais-processing-temp'`, and `input_path = 'intake/{sample_id}/{upload_session_id}/source.wav'`.
- Stores original filename only in `processing_jobs.metadata.original_filename`.
- Returns safe IDs and a signed upload target only. Never returns service role credentials.

Contract reconciliation note:

- PIPE-07 uses a single-session snake_case response shape.
- ADM-09/ADM-31 use UI-facing initial taxonomy names and a `sessions[]` response.
- Current repo `types/api.ts` uses a singular snake_case shape: `filename`, `content_type`, `file_size_bytes`, `category_slug`, `sample_type_slug`.
- Orchestrator should pick one adapter boundary and keep client/server names consistent. For this phase, keeping the existing server parser shape is acceptable if the admin UI maps its form fields explicitly.

Finalize route:

- Required path per ADM-31: `POST /api/admin/upload-sessions/[processingJobId]/finalize`.
- Admin-only and idempotent.
- Verifies the processing job is queued and the input object exists.
- Starts or signals the local processing controller.
- Duplicate finalize calls must not create duplicate jobs or reprocess succeeded jobs.
- If upload succeeded but finalize failed, UI label must be `Upload complete - processing not started` with a retry-finalize action.

Retry route:

- `POST /api/admin/processing-jobs/[jobId]/retry` should be visible from upload status, processing monitor, and review workspace for eligible failed/timed-out jobs.
- Retry eligibility must reflect PIPE-20 retryability plus attempts/max_attempts and input/original existence.

## Worker Contract

For local single upload, the worker must do real processing rather than placeholder asset generation:

- Poll or otherwise consume queued `initial_upload` jobs.
- Claim jobs atomically from `queued` to `running`.
- Set sample status to `processing` when running.
- Download/read the private intake WAV.
- Validate RIFF/WAVE or accepted RF64, PCM or IEEE float, 1-2 channels, allowed sample rates, allowed bit depths, positive duration, max upload size, and decodeability.
- Compute SHA-256 from original bytes.
- Detect duplicate hashes against other samples and write `processing_jobs.metadata.duplicate_check`.
- Extract duration, file size, sample rate, bit depth, channels, and hash.
- Preserve the original WAV exactly in `ais-originals`.
- Generate full-length MP3 preview in `ais-previews`.
- Generate real waveform peaks JSON in `ais-waveforms`; no fake, random, or simulated waveform data.
- Upsert `sample_assets` for original, preview, and waveform.
- Mark job `succeeded` and sample `needs_review` only after all required assets and DB writes succeed.
- On failure, write safe `last_error_code`, `last_error_message`, `finished_at`, and set initial-upload sample status to `failed`.

Required error visibility comes from PIPE-20: admin must see job status, job type, attempts/max_attempts, timestamps, last error code/message, duplicate warnings, asset status, and retry eligibility. Public users must not see processing errors or job state.

## UI Contract

`/admin/upload`:

- Single WAV dropzone/file picker.
- Initial category selector.
- Initial sample type selector.
- Upload progress state separate from processing state.
- Distinct labels/actions for upload failure vs processing failure.
- Link to review workspace as soon as `sample_id` exists.
- Visible retry-finalize or retry-processing action when upload succeeded but processing did not start or failed.
- Must be reload-safe because persisted DB state is the source of truth.

`/admin/processing`:

- Shows queued/running/failed/timed-out/succeeded jobs.
- Shows attempts, timestamps, errors, duplicate warnings, asset status, and retry eligibility.
- Failed jobs must be visible in rows, not hidden behind a modal.

`/admin/samples/[sampleId]/edit` review workspace:

- Shows lifecycle status plus latest processing job summary.
- Persistent preview panel, not modal-only.
- Plays preview audio from `preview_audio`, never the original WAV.
- Renders waveform from `waveform_peaks` JSON before/lazily attaching preview audio.
- Displays original/preview/waveform asset status.
- Blocks later publish when any required asset is missing or invalid:
  - `missing_original_asset`
  - `missing_preview_asset`
  - `missing_waveform_asset`
- Shows duplicate warning from `processing_jobs.metadata.duplicate_check` with matching count, matching admin sample links, statuses/names where available, and explicit acknowledgement control for the later publish gate.

## Current Repo Risks / Gaps Observed

- `app/admin/upload/page.tsx` is still a shell and has no dropzone, taxonomy selectors, upload progress, processing status, finalize retry, or review link.
- `app/api/admin/upload-sessions/route.ts` currently validates and returns `501 upload_session_creation_phase_gated`; it does not create samples, jobs, signed upload URLs, or storage paths.
- No finalize route exists under `app/api/admin/upload-sessions/[processingJobId]/finalize`.
- `app/admin/processing/page.tsx` is still a shell and does not list jobs or expose retries/errors.
- `app/admin/samples/[sampleId]/edit/page.tsx` is still a shell and does not load sample data, assets, preview audio, waveform peaks, duplicate warnings, or blockers.
- `lib/data/admin.ts` is marked `not_implemented`, so admin pages lack shared data loaders for upload/review/processing surfaces.
- `workers/audio/index.mjs` verifies settings and binaries, but explicitly does not poll jobs or mutate storage/database yet.
- `workers/audio/local-audio-processor.mjs` builds local command plans but does not execute commands, upload generated assets, or return a full worker success payload.
- Current upload-session parser uses `category_slug` and `sample_type_slug`, while ADM-09 names these `initial_category_slug` and `initial_sample_type_slug`; UI/API mapping needs an explicit decision.
- Current sample schema enforces BPM when `sample_type_slug = 'loop'`. Either the single-upload UI must collect BPM for loop drafts before session creation, or the backend must use a non-loop draft placeholder strategy approved by the schema/spec owners.
- Processing success writes in `lib/processing-jobs.ts` are sequential rather than transactional/RPC-backed; status moves to `needs_review` last, but partial DB failure remains a risk already called out by the previous backend handoff.
- `sample_assets` rows can indicate asset paths, but this phase still needs server-side URL resolution/asset-status checks for preview and waveform without exposing private originals or signed URLs in debug UI.

## Final Acceptance Checklist For Orchestrator

- Admin can sign in as local owner/admin and open `/admin/upload`.
- Admin can choose a real WAV file; non-WAV files are rejected before upload-session creation.
- Admin can choose initial category and sample type; loop uploads either collect BPM or avoid violating the current loop/BPM DB constraint.
- `POST /api/admin/upload-sessions` creates one draft sample and one queued `initial_upload` job.
- Response includes `sample_id`, `processing_job_id`, `ais-processing-temp` upload bucket/path, and expiring signed upload target.
- Browser uploads the WAV directly to the signed private intake target without exposing service role credentials.
- Finalize or storage trigger starts processing idempotently.
- UI shows upload completion separately from processing queued/running status.
- Local worker claims the job, marks job `running`, increments attempts, and marks sample `processing`.
- Worker uses real WAV bytes for validation, SHA-256, metadata, preview MP3, and waveform peaks JSON.
- Worker writes canonical original WAV, preview audio, and waveform JSON to the documented buckets/paths.
- DB contains three `sample_assets` rows with correct kinds and access levels.
- Successful job has `status = 'succeeded'`, preview/waveform output paths, timestamps, and processing metadata.
- Successful sample has `status = 'needs_review'` and extracted technical metadata.
- Review workspace plays preview audio and renders waveform from peaks JSON, not from the original WAV.
- Duplicate hash warnings appear in review if present and do not hard-block processing completion.
- Failed or timed-out jobs show safe error code/message, attempts/max_attempts, timestamps, and retry eligibility in admin UI.
- Public browse/search/discovery do not show the uploaded sample while it is `draft`, `processing`, `needs_review`, or `failed`.
- No browser/client code receives service role credentials, private original paths as public URLs, raw worker logs, stack traces, or signed URLs in debug text.
