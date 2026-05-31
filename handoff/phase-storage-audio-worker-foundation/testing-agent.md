# Storage / Audio Worker Foundation - Testing Agent Handoff

## Scope

Added focused automated tests for the current storage, audio-worker, and processing-job foundation state without editing implementation files. Other workers landed storage and audio-worker seams during this pass, so the tests now run against the current helper modules where available and skip only the seams that are still absent.

## Changed Files

- `tests/storage-foundation.test.mjs`
  - Verifies `lib/storage.ts` is server-only and visibly rejects public `original_wav` exposure.
  - Verifies public `sample_assets` RLS can expose only `preview_audio` and `waveform_peaks`, not `original_wav`.
  - Verifies Doc 03 bucket constants and public/private bucket grouping in `lib/storage-paths.ts`.
  - Verifies deterministic original, intake, bulk intake, preview, waveform, and artwork path templates.
  - Adds a skipped contract check for scoped signed upload session responses because the upload session route is still phase-gated.
- `tests/audio-worker-foundation.test.mjs`
  - Verifies the worker entrypoint does not contain fake accepted waveform outputs.
  - Verifies FFmpeg/ffprobe/audiowaveform binary resolution succeeds with temp executable fixtures and fails visibly for missing binaries.
  - Verifies fixture-like WAV metadata validation for valid WAV, invalid container, unsupported sample rate, unsupported bit depth, unsupported channels, zero duration, and too-large file.
  - Verifies source descriptor validation for unsupported extension and too-large source descriptors.
  - Verifies decode failure validation maps to `DECODE_FAILED`.
- `tests/processing-jobs-foundation.test.mjs`
  - Verifies processing job schema status enum, attempts/max attempts defaults, error fields, and terminal consistency constraints.
  - Verifies retry route is admin-only and does not expose trusted credential names.
  - Verifies current processing job transition guards and retry eligibility logic are present.

## Commands Run

- `node --test tests/storage-foundation.test.mjs tests/audio-worker-foundation.test.mjs tests/processing-jobs-foundation.test.mjs`
  - Result: pass. 15 tests total, 14 passing, 1 skipped, 0 failures.
- `pnpm test`
  - Result: pass. 46 tests total, 44 passing, 2 skipped, 0 failures.

## Skipped / Not Yet Covered

- Signed upload helper response shape is not runtime-tested because `POST /api/admin/upload-sessions` is still phase-gated via `notImplementedRoute`.
- Existing database/RLS integration tests remain skipped unless `AIS_RUN_DB_TESTS=1` is set against local Supabase.
- No real audio fixtures or generated preview/waveform outputs were created, per instruction not to fake accepted waveform outputs.

## Implementation Gaps To Hand Off

- Implement the signed upload session route/helper and return only scoped upload data (`upload_bucket`, `upload_path`, `signed_upload`, expiration), never service role material.
- Keep accepted waveform generation tied to real `audiowaveform` output. Tests intentionally do not accept fabricated waveform success payloads.
