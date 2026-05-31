# Audio Processing Agent Handoff

## Scope Completed

- Added the local audio worker foundation under `workers/audio/`.
- Replaced `scripts/placeholders/audio-worker.mjs` with a bridge to the real worker startup.
- Added deterministic binary resolution for `ffmpeg`, `ffprobe`, and `audiowaveform`.
- Added config parsing for preview, waveform, upload size, duration, channel, sample-rate, and bit-depth settings.
- Added pure helpers for WAV metadata/source/decode validation, SHA-256 hashing, ffprobe parsing, preview command construction, and waveform command construction.
- Added structured processing errors and worker success/failure payload helpers aligned with PIPE-18/PIPE-20.
- Added focused audio-worker tests in `tests/audio-worker.test.mjs`.

## Files Changed

- `scripts/placeholders/audio-worker.mjs`
- `workers/audio/audio-binaries.mjs`
- `workers/audio/audio-validation.mjs`
- `workers/audio/config.mjs`
- `workers/audio/errors.mjs`
- `workers/audio/hashing.mjs`
- `workers/audio/index.mjs`
- `workers/audio/local-audio-processor.mjs`
- `workers/audio/metadata.mjs`
- `workers/audio/peaks.mjs`
- `workers/audio/preview.mjs`
- `workers/audio/result-types.mjs`
- `workers/audio/validation.mjs`
- `workers/audio/wav-validation.mjs`
- `tests/audio-worker.test.mjs`
- `handoff/phase-storage-audio-worker-foundation/audio-processing-agent.md`

## Verification

- PASS: `node --test tests/audio-worker.test.mjs tests/audio-worker-foundation.test.mjs`
- Latest broad test run: `pnpm test` currently fails in `tests/processing-jobs-foundation.test.mjs` on a processing-job helper assertion outside this agent's owned audio scope. Audio-worker tests pass.
- Latest lint run: `pnpm lint` fails on `@next/next/no-assign-module-variable` in parallel foundation test files (`tests/audio-worker-foundation.test.mjs`, `tests/processing-jobs-foundation.test.mjs`), not in the worker modules added here.
- Expected startup failure verified: `pnpm worker:audio` exits with a visible JSON configuration error when no env or project-pinned binaries are configured. It reports missing `ffmpeg`, `ffprobe`, and `audiowaveform` and does not process jobs.

## Known Gaps

- This is a foundation worker only. It does not poll `processing_jobs`, download/upload storage objects, or mutate database rows.
- No real audio transcoding or waveform command execution is wired into a job runner yet; command construction is implemented and testable.
- No project-pinned binary packages or checked-in local binary paths were added. The worker supports env overrides, project-pinned paths if present, and PATH lookup only with `AIS_AUDIO_BINARY_MODE=system`.
- Duplicate hash database lookup is not implemented; only the warning/result shape exists.
