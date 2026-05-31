# Orchestrator Handoff - Storage / Audio Worker Foundation

Date: 2026-05-31

## Phase Goal

Create the storage and worker foundation required for real WAV processing:

- Original WAVs remain private.
- Generated previews and waveform peaks follow the AIS asset model.
- Storage access is centralized through `lib/storage.ts`.
- Local audio worker startup, validation, command construction, and error/result contracts are in place.
- Backend processing job helpers and upload-session contracts are ready for the next implementation phase.

## Agent Handoffs

- Storage Agent: `handoff/phase-storage-audio-worker-foundation/storage-agent.md`
- Audio Processing Agent: `handoff/phase-storage-audio-worker-foundation/audio-processing-agent.md`
- Backend Agent: `handoff/phase-storage-audio-worker-foundation/backend-agent.md`
- Testing Agent: `handoff/phase-storage-audio-worker-foundation/testing-agent.md`

## Integrated Scope

Storage foundation:

- Added local Supabase Storage bucket config and migration for:
  - `ais-originals` private
  - `ais-processing-temp` private
  - `ais-previews` public for local/free launch
  - `ais-waveforms` public
  - `ais-album-artwork` public
- Added deterministic storage path/ref helpers in `lib/storage-paths.ts`.
- Expanded `lib/storage.ts` into the server-only storage abstraction with:
  - signed upload URLs
  - signed download URLs
  - public URL guardrails
  - existence checks
  - upload, download, copy, and delete operations
- Verified direct Supabase Storage usage stays isolated to `lib/storage.ts`.

Audio worker foundation:

- Replaced the placeholder `pnpm worker:audio` script with `workers/audio/index.mjs`.
- Added deterministic resolution for `ffmpeg`, `ffprobe`, and `audiowaveform`.
- Added worker settings parsing for preview, waveform, upload-size, duration, channels, sample rates, and bit depths.
- Added pure helpers for SHA-256 hashing, ffprobe metadata parsing, WAV validation, preview command construction, waveform command construction, and structured worker result/error payloads.
- Confirmed accepted waveform outputs are not fake, random, simulated, or placeholder data.

Backend foundation:

- Added processing job helpers for claiming, running, success, failure, timeout, admin retry, and retry eligibility.
- Added PIPE-20 safe error mapping with retryability and admin/public-safe messages.
- Added upload-session request/response types and server-only validation.
- Kept actual signed upload session creation phase-gated; the route validates admin and payloads but returns a controlled `501` until the UI/intake creation phase.

Testing:

- Added focused storage, audio-worker, and processing-job foundation tests.
- Fixed shared lint issues in foundation tests after agent handoff by renaming local `module` variables.

## Verification Run

- `pnpm test`
  - Passed: 50 tests, 48 passing, 2 skipped.
  - Skips are expected:
    - DB/RLS integration requires `AIS_RUN_DB_TESTS=1` and local Supabase.
    - Signed upload session response test is skipped because full creation is intentionally phase-gated.
- `pnpm typecheck`
  - Passed.
- `pnpm lint`
  - Passed.
- `pnpm worker:audio`
  - Starts and prints structured JSON settings plus binary configuration.
  - Exits with a visible configuration error on this machine because no env/project-pinned binaries are configured for `ffmpeg`, `ffprobe`, or `audiowaveform`.

## Spec Check

- Required bucket names and access settings are present in `supabase/config.toml` and `0010_storage_buckets_and_policies.sql`.
- Original WAV public exposure is guarded by bucket classification and public URL checks.
- Object path conventions match PIPE-05 for originals, intake, bulk intake, previews, waveforms, and album artwork.
- Storage SDK calls are not scattered through app/UI code.
- Worker validation accepts supported WAV metadata and rejects unsupported extension/source, invalid container, unsupported sample rate, unsupported bit depth, unsupported channels, zero duration, too-large file, and decode failures.
- Processing job helpers respect queued -> running attempts, succeeded -> `needs_review`, failed/timed_out -> failed initial uploads, and retryability rules.

## Remaining Risks / Next Phase

- `POST /api/admin/upload-sessions` does not yet create sample rows, processing jobs, or signed upload URLs. It is validated and admin-guarded, but intentionally phase-gated.
- The audio worker does not yet poll jobs, download/upload storage objects, execute FFmpeg/audiowaveform commands for accepted jobs, or mutate database rows.
- No project-pinned binary package/path has been added. Local processing requires env overrides or explicit `AIS_AUDIO_BINARY_MODE=system` once the developer machine has the tools installed.
- Processing success writes are sequential Supabase calls rather than a single transaction/RPC.
- Real audio fixture/integration coverage still needs local Supabase plus real binaries.
