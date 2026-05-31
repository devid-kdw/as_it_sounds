# Backend Agent Handoff - Storage / Audio Worker Foundation

## Scope Completed

- Added processing job service helpers in `lib/processing-jobs.ts`:
  - claim queued job with a conditional queued -> running update
  - mark running and increment `attempts`
  - mark succeeded and move initial uploads to `needs_review` only after required DB writes
  - mark failed / timed out and set failed initial uploads to `samples.status = 'failed'`
  - determine retry eligibility for failed/canceled/timed_out jobs with attempt and retryable error checks
  - queue admin retry back to `queued`
- Added PIPE-20 error catalog in `lib/errors.ts` with retryability, admin/public-safe short messages, and unknown-error fallback without stack trace exposure.
- Added upload session request/response contracts in `types/api.ts`.
- Added `lib/upload-sessions.ts` server-only validation for single/bulk upload session payloads:
  - WAV filename/content type only
  - max 500 MiB upload size
  - required category/sample type draft fields
  - BPM required for loop drafts to avoid invalid sample rows
  - bulk batch ID/position consistency checks
- Strengthened admin upload route guard behavior:
  - `requireAdmin("/admin/upload")` runs before payload validation
  - invalid JSON/non-WAV/invalid draft payloads return safe JSON errors
  - actual signed upload creation remains phase-gated with `501`
- Wired admin retry route to `queueProcessingJobRetry`.

## Files Changed

- `app/api/admin/upload-sessions/route.ts`
- `app/api/admin/processing-jobs/[jobId]/retry/route.ts`
- `lib/errors.ts`
- `lib/processing-jobs.ts`
- `lib/upload-sessions.ts`
- `types/api.ts`
- `tests/processing-jobs-static.test.mjs`
- `handoff/phase-storage-audio-worker-foundation/backend-agent.md`

## Commands Run

- `npm run typecheck`
  - Result: pass.
- `node --test tests/processing-jobs-static.test.mjs`
  - Result: pass, 4 tests.
- `node --test tests/processing-jobs-foundation.test.mjs`
  - Result: pass, 4 tests.
- `node --test tests/processing-jobs-static.test.mjs tests/processing-jobs-foundation.test.mjs`
  - Result: pass, 8 tests.
- `npm run lint`
  - Result: failed in parallel/unowned foundation test files:
    - `tests/audio-worker-foundation.test.mjs`
    - `tests/processing-jobs-foundation.test.mjs`
  - Failure rule: `@next/next/no-assign-module-variable`.
  - No lint errors were reported for backend files touched here.

## Remaining Risks / Follow-Ups

- `POST /api/admin/upload-sessions` validates the admin-only contract but does not yet create samples/jobs or signed upload URLs. When completing it, use the Storage Agent abstraction in `lib/storage.ts` and the bucket/path helpers now present in `lib/storage-paths.ts`.
- `markProcessingJobSucceeded()` uses sequential Supabase writes because no transaction/RPC helper exists yet. It deliberately writes `samples.status = 'needs_review'` last, but a future database function would be stronger for all-or-nothing PIPE-16 behavior.
- Processing helper tests are focused/static plus pure eligibility checks; real Supabase mutation behavior still needs integration coverage once the local DB/audio worker path is ready.
- Upload validation requires taxonomy fields because current `samples` schema cannot create valid drafts without `category_slug` and `sample_type_slug`.
