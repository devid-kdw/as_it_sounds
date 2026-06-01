# Audio Processing Agent Handoff - Phase 7 Bulk Albums Admin

Agent role: AIS Phase 7 audio-processing agent

Scope requested:
- Own only `workers/audio/**`, `lib/processing-jobs.ts` if needed, tightly scoped processing/reprocess tests, and this handoff.
- Do not edit frontend pages or non-processing admin service files.

## What I Changed So Far

Current processing-file diff from this lane:

- `workers/audio/initial-upload-worker.mjs`
  - Added `processAudioJob()` while keeping `processInitialUploadJob()` as a compatibility wrapper.
  - Added a unified audio claim path for `initial_upload`, `reprocess_preview`, and `reprocess_waveform`.
  - Changed polling without an explicit job ID to look for queued audio job types, not only `initial_upload`.
  - Added an attempts guard during claim so jobs at `max_attempts` are not claimed again.
  - Added stuck-running-job helpers in the worker:
    - `markStuckAudioJobsTimedOut()`
    - `isAudioJobStuck()`
  - Added reprocess preview and waveform pipeline branches that:
    - load the existing `original_wav` asset from `sample_assets`
    - download and validate the original WAV again
    - generate preview or waveform into job-specific output paths
    - upload generated output with `upsert: false`
    - return only the newly generated asset in the success payload
  - Preserved the existing original-copy behavior for initial upload: original WAV path remains content-addressed by SHA-256, and generated assets remain job-versioned paths.

- `lib/processing-jobs.ts`
  - Made success payload assets optional so reprocess jobs can update only the asset they regenerate.
  - Changed `markProcessingJobSucceeded()` so:
    - `initial_upload` still requires and upserts `original_wav`, `preview_audio`, and `waveform_peaks`
    - `reprocess_preview` upserts only `preview_audio`
    - `reprocess_waveform` upserts only `waveform_peaks`
    - sample lifecycle/status metadata is updated only for `initial_upload`, so published samples are not unpublished by reprocess success
    - `output_preview_path` / `output_waveform_path` are updated only when the relevant asset exists in the payload
  - Added retry source verification before queueing a retry:
    - `initial_upload` checks the input source ref
    - reprocess jobs check the original WAV asset ref
  - Added processing stuck-job helpers:
    - `isProcessingJobStuck()`
    - `markStuckProcessingJobsTimedOut()`
  - Added `createSampleReprocessJob()` in this file’s current diff, which creates queued `reprocess_preview` / `reprocess_waveform` jobs using the original WAV asset and records `replacement_policy: "swap_after_success"` metadata.

- `tests/local-single-upload.test.mjs`
  - Added focused tests for:
    - `reprocess_preview` success upserting only `preview_audio`
    - `reprocess_waveform` success upserting only `waveform_peaks`
    - reprocess success leaving a published sample status unchanged

## Verification

No focused test command was run before the user asked me to stop.

Read-only checks run after stopping:

- `git status --short`
- `git diff --stat -- workers/audio lib/processing-jobs.ts tests handoff`
- scoped `git diff` inspection for the touched processing files

Current processing diff size observed:

- `workers/audio/initial-upload-worker.mjs`
- `lib/processing-jobs.ts`
- `tests/local-single-upload.test.mjs`

## Remaining Gaps / Risks

- I stopped mid-stream by request. The changed files have not been typechecked or tested.
- `lib/processing-jobs.ts` should be reviewed before signoff; it now contains a larger processing surface, including retry source checks that may require Supabase storage mocks in tests.
- The worker’s new `.in("job_type", AUDIO_JOB_TYPES)` query may require test mocks to implement `.in()` if any existing worker unit tests exercise job claiming.
- Reprocess worker payloads intentionally do not include a new original SHA because they do not replace the original WAV or update sample file metadata. If a downstream TypeScript-only service path expects `source.sha256` for every success payload, that path needs tightening or a reprocess-specific payload type.
- Stuck-job timeout behavior was added in both worker and service helper form, but not connected to an admin route here.
- I observed other concurrent Phase 7 changes outside this lane, including admin UI/API/upload files. I did not edit those files in this stop-and-handoff pass.

## Suggested Next Steps

1. Run `node --test tests/local-single-upload.test.mjs tests/processing-jobs-static.test.mjs`.
2. Run `pnpm typecheck` if the wider shared worktree is stable enough.
3. Review `lib/processing-jobs.ts` for duplicate or overlapping helper responsibilities before merging with backend/admin agents.
4. Add/adjust mocks for storage existence checks and `.in()` query support if focused tests fail.
