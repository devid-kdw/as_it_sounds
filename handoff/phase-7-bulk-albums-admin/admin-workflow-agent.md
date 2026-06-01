# Admin Workflow Agent Handoff - Phase 7 Bulk Upload, Albums, Admin Workflow

Date: 2026-06-01

Agent role: Admin Workflow Agent

Scope: Admin workflow/spec interpretation and implementation guidance only. No implementation files were edited.

## References Reviewed

- Phase 7 prompt in `/Users/grzzi/.codex/attachments/db210f59-680b-4766-845b-34d4d9854964/pasted-text.txt`
- `../01_Project_Overview_AIS-v1.md` sections 7.2 and 7.3
- `../07_Admin_Upload_Curation_Workflow_AIS_v1.md` ADM-04, ADM-06, ADM-23 through ADM-28, ADM-31, ADM-32, ADM-34, ADM-35
- `../03_Storage_Audio_Processing_Pipeline_AIS_v1.md` PIPE-09, PIPE-20, PIPE-27
- `../09_UI_Design_System_AIS_v1.md` UI-16 and UI-17

## Current Repo Context

- `/admin/bulk-upload`, `/admin/samples`, and `/admin/albums` are present as route shells.
- `/admin/processing` is partially database-backed and already exposes recent jobs plus retry actions for failed/timed-out jobs.
- `POST /api/admin/upload-sessions` currently rejects non-single modes; Phase 7 needs the ADM-31 bulk `files[]` contract.
- `lib/upload-sessions.ts`, `types/api.ts`, and `stores/admin-upload-store.ts` are currently shaped around single-file upload sessions.
- The schema already includes `albums`, `album_samples`, album status, album artwork bucket/path support, processing job status fields, and prior Phase 6 admin sample review/publish utilities.

## Phase Goal

Make the admin area practical at library scale. An admin should be able to upload many WAV files as a batch, watch each file process independently, apply shared metadata without losing per-file overrides, publish eligible rows partially, manage the full sample library from tables, recover failed processing work, and curate albums as draft/published/archived groupings.

Bulk upload is many independent single-file workflows grouped by `batch_id`. Albums organize discovery, but samples remain independently publishable and searchable.

## Required Behavior

### Admin Surfaces

- Admin navigation must expose Overview, Upload, Bulk Upload, Samples, Albums, Processing, and Analytics when implemented.
- `/admin` is a work queue dashboard, not an analytics page. Required cards: needs review, drafts, active processing, failed processing, published library, duplicate warnings, and license incomplete.
- Dashboard quick actions should link to upload one WAV, bulk upload WAVs, review latest item, failed processing jobs, and create album.
- Every admin page and every admin API route must verify session and admin role server-side. API routes must not rely only on layout protection.

### Bulk Upload

- `/admin/bulk-upload` must include a multi-file WAV dropzone, shared initial category/sample type selectors, optional album assignment, upload queue table, per-file upload progress, per-file processing status, shared metadata panel, per-file overrides, row validation, partial publish controls, and persistent failed rows.
- `POST /api/admin/upload-sessions` should accept the ADM-31 shape: `mode: "bulk"`, `files[]`, `initialCategorySlug`, `initialSampleTypeSlug`, and optional `albumId`.
- Server behavior for bulk creation: generate a `batchId`, create one `samples` row and one `processing_jobs` row per file, return one signed upload target per file, and store `batch_id`, `original_filename`, `bulk_position`, declared content type/size, and created-by metadata in each job.
- A failed row must not block upload, processing, metadata editing, or publishing for successful rows.
- Refreshing the page must recover persisted batch rows from Supabase via `batch_id`; only pre-session drag/drop rows may live solely in Zustand.
- Original filenames may appear only as admin reference text. Final `poetic_name` must be entered or explicitly confirmed by the admin, never inferred from filenames.

### Bulk Finalize And Status

- Bulk finalize should be idempotent and row-aware. It may finalize rows individually by `processingJobId` or by batch, but it must never require every file to have uploaded successfully.
- Add a bulk status read model or endpoint that returns per-file upload, processing, asset, duplicate, validation, and publish eligibility state for a `batch_id`.
- Processing status is authoritative from Supabase. Browser progress is transient client state only.
- Signed upload URLs expire and must not be persisted in Zustand, localStorage, logs, audit rows, or handoff payloads.

### Bulk Metadata Editor

- Shared metadata fields: category, sample type, moods, hidden tags, album, source type, rights owner, commercial use allowed, attribution required, license notes, and featured flag.
- Apply modes: fill empty only, replace selected with confirmation, append tags, and clear selected optional field with confirmation.
- Per-row editable fields: poetic name, display title, short description, category, sample type, moods, BPM, musical key, loopable, duplicate acknowledgement, license state, and publish action.
- Shared metadata must not overwrite final poetic names unless the admin explicitly chooses a replace mode.
- Publish selected must skip ineligible rows and report blockers/warnings per row. It must not fail silently or force all rows to publish together.
- Persisted sample rows are not deleted in MVP. A remove action is allowed only for unsaved local failed rows before upload session creation.

### Sample Management Table

- `/admin/samples` is the main triage view across all lifecycle states.
- Required filters: lifecycle status, processing job status, category, sample type, mood, license status, featured flag, duplicate warning, missing asset, album, and text search by poetic name, display title, or original filename reference.
- Required row visibility: identity, lifecycle badge, processing badge, asset indicators, license, taxonomy, moods, duration, BPM, featured state, published date, updated date, and row actions.
- Row actions: open edit workspace, preview, publish if eligible, archive, restore to review, retry failed processing, reprocess preview, reprocess waveform, and toggle featured.
- Missing preview, missing waveform, failed processing, timed-out processing, duplicate warnings, and retry availability must be visible directly in rows.

### Processing Monitor

- `/admin/processing` should become the recovery center for queued, running, failed, timed-out, recently succeeded, reprocess jobs, and jobs grouped by batch ID.
- Each job row needs job ID copy affordance, sample identity, original filename reference, job type, status, attempts/max attempts, error code/message, timestamps, retry eligibility, and a link to the sample edit workspace.
- Retry must follow PIPE-20/PIPE-21 eligibility: retry transient errors with attempts remaining; do not encourage retry for permanent validation failures.
- Stuck running jobs should be detected using the Doc 03 threshold and surfaced as timed-out/retryable when implemented server-side.
- This page must be useful without worker logs and must never expose secrets, signed URLs, Service Role details, or original storage paths.

### Retry And Reprocess

- Retry initial upload jobs through `POST /api/admin/processing-jobs/[jobId]/retry`; clear last error fields only when the new attempt starts.
- Reprocess preview and waveform actions should create new jobs and leave existing valid assets in place until replacement output validates.
- Reprocess controls must appear in the edit workspace, sample table, and processing monitor where eligible.
- Permanent validation failures should show fix guidance rather than repeated retry prompts.

### Albums

- `/admin/albums` must support create draft, edit metadata, assign/remove/reorder samples, publish, archive, and optional artwork handoff.
- Album publish requires title and unique slug at minimum. Missing artwork must not block album publish or sample publish.
- Public album pages may show only published albums and published samples. Draft and archived albums are admin-only.
- Album assignment during bulk upload is required, but sample-level discovery remains independent of albums.
- Published sample album assignment changes should be audit logged and should refresh search documents where album text contributes to search.

### State, Audit, And Security

- Zustand may hold only transient UI state: pre-session drag/drop rows, browser upload progress, selected rows, open panels, dirty indicators, optimistic feedback, and current preview selection.
- Persisted draft metadata, batch identity, processing status, publish eligibility, duplicate acknowledgement, license confirmation, and audit events must live in Supabase.
- Admin routes must use Service Role or privileged Supabase clients only after admin authorization.
- Browser payloads must never include raw original WAV object paths or signed original download URLs. Admin preview uses generated preview audio and waveform peaks only.
- Significant actions need append-only audit rows: upload session creation/finalize, bulk metadata updates, duplicate acknowledgement, publish/archive/restore, retry, reprocess, album create/update/publish/archive, membership/order changes, and featured toggles.

## Risks

- All-or-nothing batch design would violate ADM-24 and PIPE-09. Keep every file independently recoverable and publishable.
- Adapting the current single-upload API too narrowly may leave the response incompatible with ADM-31 `sessions[]` and `batchId`.
- Client-only batch state would lose work on refresh. Persist rows and recover by `processing_jobs.metadata.batch_id`.
- Shared metadata actions can accidentally overwrite curated row identity. Treat final poetic names as protected unless replace is explicit.
- Retry buttons for permanent validation errors create noisy loops. Use error catalog retryability.
- Reprocess jobs can break published samples if valid current assets are replaced before the new asset validates.
- Album public routes can leak drafts if they query album membership without filtering both album and sample status.
- Original filename is useful for admins but must not become public identity or appear in public bundles.
- Signed upload URLs and private storage paths are easy to leak through debug UI, logs, audit payloads, or local persisted state.

## Verification Recommendations

1. Test `POST /api/admin/upload-sessions` with `mode: "bulk"` creates one sample and one processing job per file, returns one signed upload target per file, and stores a shared `batch_id`.
2. Test one invalid or failed file does not block successful rows from processing, editing, or publishing.
3. Test batch recovery after refresh loads rows by `batch_id` from Supabase.
4. Test shared metadata apply modes, including fill-empty, replace selected confirmation, append tags, and clear optional field.
5. Test per-file overrides survive shared metadata application and final poetic names are not overwritten unintentionally.
6. Test publish selected skips ineligible rows and returns row-level blockers/warnings.
7. Test `/admin/samples` filters by lifecycle status, processing status, search query, taxonomy, license state, duplicate warning, missing asset, album, and featured flag.
8. Test failed/timed-out/stuck processing jobs show retry eligibility and permanent validation failures do not show unsafe retry prompts.
9. Test preview and waveform reprocess jobs do not replace existing valid assets until new assets validate.
10. Test album draft creation, metadata edit, sample assignment, reorder, publish, archive, and public visibility filtering.
11. Test normal users cannot access any admin API route, create samples/jobs/albums, or read admin-only lifecycle states.
12. Test local owner workflow without Stripe: promote owner, bulk upload WAVs, process through local worker, curate, publish selected rows, create album, and browse/download as owner.

## Verification Performed

Read the Phase 7 prompt, referenced specs, existing Phase 6 admin workflow handoff, and current admin route/API/store context. Created only this handoff file under `handoff/phase-7-bulk-albums-admin/`.

No application tests were run because this agent did not edit implementation files and the requested output is implementation guidance.
