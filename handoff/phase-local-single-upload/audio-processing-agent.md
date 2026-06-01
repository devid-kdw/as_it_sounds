# Audio Processing Agent Handoff - Local Single WAV Upload

Date: 2026-05-31

Agent role: Audio Processing Agent

## Scope Completed

- Implemented local `initial_upload` processing under `workers/audio/**`.
- Added a shared audio command runner with timeout/error mapping.
- Reused existing worker helpers for binary resolution, WAV validation, ffprobe parsing, preview command construction, waveform command construction, hashing, and result payload shaping.
- Added Supabase service-role worker orchestration that can process one job by ID, process the next queued job once, or poll queued jobs.
- Kept DB/storage writes in the worker lane and did not edit API routes, frontend pages/stores, or tests.

## Files Changed

- `workers/audio/commands.mjs`
- `workers/audio/initial-upload-worker.mjs`
- `workers/audio/index.mjs`
- `workers/audio/metadata.mjs`
- `workers/audio/result-types.mjs`
- `handoff/phase-local-single-upload/audio-processing-agent.md`

## Implemented Behavior

- Claims queued `initial_upload` jobs atomically from `queued` to `running`.
- Increments attempts, clears prior job error fields, and sets the linked sample to `processing`.
- Downloads the private intake WAV from `ais-processing-temp`.
- Validates source extension/MIME hints when available, RIFF/WAVE or allowed RF64 header, ffprobe metadata constraints, and full decodeability.
- Computes SHA-256 from the original WAV bytes.
- Detects duplicate `samples.file_hash_sha256` values excluding the current sample and stores warning/result metadata.
- Extracts file size, duration, sample rate, bit depth, channels, and MIME metadata.
- Copies the original to `ais-originals/samples/{sample_id}/original/{sha256}.wav`.
- Generates MP3 preview with FFmpeg/libmp3lame and waveform peaks JSON with `audiowaveform`.
- Uploads preview and waveform to job-specific object paths:
  - `samples/{sample_id}/preview/{processing_job_id}.mp3`
  - `samples/{sample_id}/waveform/{processing_job_id}.json`
- Refuses to overwrite existing storage objects with different checksums; same-checksum objects are reused for idempotent retries.
- Upserts `sample_assets` rows for `original_wav`, `preview_audio`, and `waveform_peaks`.
- Marks successful jobs `succeeded` and successful samples `needs_review`, never `published`.
- Marks failed initial uploads `failed` with safe PIPE-20 error code/message and `failed_at`.

## Local Worker Commands

- Process a known job:

```bash
pnpm worker:audio -- --job-id <processing_job_id>
```

- Process the next queued initial upload and exit:

```bash
pnpm worker:audio -- --once
```

- Poll locally:

```bash
AIS_AUDIO_WORKER_MODE=poll pnpm worker:audio
```

The worker loads `.env.local` / `.env` if present and still supports explicit binary env vars plus `AIS_AUDIO_BINARY_MODE=system`.

## Verification

- PASS: `node --check workers/audio/index.mjs`
- PASS: `node --check workers/audio/initial-upload-worker.mjs`
- PASS: `node --check workers/audio/commands.mjs`
- PASS: `node --test tests/audio-worker.test.mjs tests/audio-worker-foundation.test.mjs`
- PASS: `pnpm test`
  - 59 passing
  - 1 existing DB/RLS integration suite skipped unless `AIS_RUN_DB_TESTS=1`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`

## Blockers / Risks

- I did not run a real end-to-end Supabase Storage + FFmpeg + audiowaveform upload because this worker lane does not own the concurrent admin/API changes and no live job fixture was provided.
- This machine has `ffmpeg` and `ffprobe` on PATH, but `audiowaveform` is not currently on PATH; real waveform generation needs `AIS_AUDIOWAVEFORM_PATH` or an installed/project-pinned binary.
- Current shared workspace has unowned changes in admin upload/API/store/test files from other agents.
