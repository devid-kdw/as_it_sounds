# Phase 7 Testing Agent Handoff

Date: 2026-06-01

## Scope

- Read the Phase 7 prompt in `../AIS_Implementation_Plan_Orchestrator_Prompts_v1.md`.
- Cross-checked Doc 07 ADM-23 through ADM-28, ADM-31, ADM-35, and UI-17.4 bulk upload rules.
- Added focused Phase 7 static contract coverage only under `tests/`.
- Did not edit implementation files.

## Tests Added

- `tests/phase-7-bulk-albums-admin-static.test.mjs`
  - Bulk upload session contract:
    - supports `mode = "bulk"`
    - accepts `files[]`
    - creates one `samples` row and one `processing_jobs` row per file
    - stores shared `batch_id` plus per-file `client_file_id` and `bulk_position`
    - requires the bulk intake path convention
    - rejects single-only route behavior
  - Bulk upload UI contract:
    - multi-file WAV input/dropzone
    - shared metadata panel
    - explicit apply modes
    - per-file override columns
    - upload/processing/validation/duplicate row states
    - partial publish and failed row visibility
  - Admin sample management contract:
    - guarded list API
    - lifecycle/query/taxonomy/license/featured/duplicate/missing asset/album filters
    - row actions for edit, preview, publish, archive, restore, retry, reprocess, and featured toggle
  - Processing monitor/retry contract:
    - retry route guard and queuing
    - failed and timed-out retry eligibility
    - batch-scoped recovery signal
  - Reprocess contract:
    - guarded preview/waveform reprocess routes
    - original asset prerequisite
    - reprocess job creation
    - audit logging
    - no early `sample_assets` replacement in request handler
    - job-type-specific replacement after processing success
  - Album management contract:
    - guarded create/list/edit/sample membership/publish/archive route surface
    - draft/edit/assign/remove/reorder/publish/archive signals
    - audit logging
  - Admin API guard sweep:
    - every existing `app/api/admin/**/route.ts` calls `requireAdminApi()`
    - existing admin API routes do not expose privileged secret names, signed URLs, or original WAV URLs

## Commands Run

```bash
node --test tests/phase-7-bulk-albums-admin-static.test.mjs
```

Result: failed as expected for not-yet-complete Phase 7 implementation.

- 7 tests total
- 1 passed
- 6 failed

Passing:

- Existing admin API routes are independently guarded against normal users.

Current failures/blockers:

- `POST /api/admin/upload-sessions` still uses the single-upload parser/helper and rejects bulk mode, even though concurrent work has added bulk helper/type signals in `lib/upload-sessions.ts` and `types/api.ts`.
- `/admin/bulk-upload` is still a shell and lacks multi-file dropzone, shared metadata, per-file overrides, and actionable partial publish UI.
- `app/api/admin/samples/route.ts` is missing for the Phase 7 sample management list/filter API.
- `/admin/processing` shows failed/timed-out retry actions, but does not yet expose batch ID filtering/grouping for bulk recovery.
- `app/api/admin/samples/[sampleId]/reprocess-preview/route.ts` is missing.
- `app/api/admin/samples/[sampleId]/reprocess-waveform/route.ts` is missing.
- `app/api/admin/albums/route.ts` and the album edit/membership/publish/archive route surface are missing.

## Concurrent Work Observed

Left these non-testing changes untouched:

- `lib/upload-sessions.ts`
- `types/api.ts`
- `workers/audio/initial-upload-worker.mjs`
- `components/admin/sample-row-actions.tsx`
- `components/admin/status-badge.tsx`
- `handoff/phase-7-bulk-albums-admin/admin-workflow-agent.md`

Notable current signal from that concurrent work: `lib/upload-sessions.ts` now contains `createBulkUploadSessions`, `finalizeBulkUploadSessions`, and `getBulkUploadStatus`, but `app/api/admin/upload-sessions/route.ts` has not been wired to the new bulk parser/helper yet.

## Next Agent Notes

- Wire `POST /api/admin/upload-sessions` to the Phase 7 `files[]` parser/helper and remove the single-only rejection.
- Confirm bulk intake paths use `intake/batches/{batch_id}/{sample_id}/source.wav`; the current helper path still appears to use the single-upload intake path.
- Add the missing admin sample list/filter API, reprocess routes, and album routes with independent `requireAdminApi()` guards.
- Expand `/admin/bulk-upload`, `/admin/samples`, `/admin/albums`, and `/admin/processing` beyond shells/partial monitor behavior.
- Re-run the focused test after each implementation slice:

```bash
node --test tests/phase-7-bulk-albums-admin-static.test.mjs
```
