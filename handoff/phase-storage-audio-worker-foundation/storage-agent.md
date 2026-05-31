# Storage Agent Handoff — Storage/Audio Worker Foundation

## Changed Files

- `lib/storage-paths.ts`
  - Added stable AIS bucket constants.
  - Added public/private bucket classification helpers.
  - Added validated object path/ref helpers for:
    - original WAVs: `samples/{sample_id}/original/{sha256}.wav`
    - single intake uploads: `intake/{sample_id}/{upload_session_id}/source.wav`
    - bulk intake uploads: `intake/batches/{batch_id}/{sample_id}/source.wav`
    - preview MP3s: `samples/{sample_id}/preview/{processing_job_id}.mp3`
    - waveform peaks JSON: `samples/{sample_id}/waveform/{processing_job_id}.json`
    - album artwork: `albums/{album_id}/artwork/{asset_hash}.jpg`
  - Validates UUID IDs, SHA-256 object hashes, bucket names, and object paths.

- `lib/storage.ts`
  - Replaced the storage stub with a server-only provider interface.
  - Added `SupabaseStorageProvider` using `createSupabaseAdminClient()`.
  - Added methods for signed uploads, signed downloads, public URLs, exists checks, uploads, downloads, cross-bucket copy, and deletes.
  - Public URL helper rejects private buckets, including `ais-originals` and `ais-processing-temp`.
  - Original WAV signed downloads are constrained to 60-300 second expirations.

- `supabase/config.toml`
  - Configured local Supabase Storage buckets:
    - `ais-originals`: private, 500 MiB, WAV MIME types.
    - `ais-processing-temp`: private, 500 MiB, WAV MIME types.
    - `ais-previews`: public, 100 MiB, MP3 MIME types.
    - `ais-waveforms`: public, 10 MiB, JSON MIME type.
    - `ais-album-artwork`: public, 10 MiB, image MIME types.

- `supabase/migrations/0010_storage_buckets_and_policies.sql`
  - Upserts the five AIS storage buckets for database-managed environments.
  - Adds public read policy for `ais-previews`, `ais-waveforms`, and `ais-album-artwork`.
  - Adds admin manage policy for all AIS buckets.

- `tests/storage-static.test.mjs`
  - Added narrow static tests for bucket names, path conventions, local Supabase bucket access config, server-only storage abstraction, private public-URL rejection, and direct Supabase Storage usage staying inside `lib/storage.ts`.

## Bucket / Access Behavior

- Originals are private in `ais-originals`; no public URL helper path can expose them.
- Processing temp uploads are private in `ais-processing-temp`; intended for signed upload intake and worker reads.
- Previews are public in `ais-previews` for local/free launch behavior.
- Waveforms are public in `ais-waveforms`; they contain derived peaks JSON, not source audio.
- Album artwork is public in `ais-album-artwork`; publication gating remains a database/application concern.
- Service Role access stays server-only through `lib/supabase/admin.ts` and `lib/storage.ts`.

## Tests Run

- `pnpm typecheck` — passed.
- `node --test tests/storage-static.test.mjs` — passed.
- `pnpm exec eslint lib/storage.ts lib/storage-paths.ts tests/storage-static.test.mjs` — passed.
- `pnpm test` — storage tests passed, but the full suite failed in unrelated audio-worker foundation code:
  - `tests/audio-worker-foundation.test.mjs`
  - Failure: `AIS_AUDIO_BINARY_MODE=explicit` is rejected by `workers/audio/audio-binaries.mjs`.
- `pnpm lint` — failed on unrelated untracked foundation tests:
  - `tests/audio-worker-foundation.test.mjs`
  - `tests/processing-jobs-foundation.test.mjs`
  - Rule: `@next/next/no-assign-module-variable`.

## Remaining Risks / Follow-Ups

- Supabase signed upload URLs have provider-managed expiration. `lib/storage.ts` returns an `expiresAt` estimate using the requested/default duration, but Supabase Storage does not expose a custom upload expiry parameter in the SDK version currently installed.
- `downloadObject()` returns an `ArrayBuffer`; this is fine for foundation work but may need a streaming path before processing very large WAVs.
- `copyObject()` uses Supabase Storage copy with `destinationBucket`; if provider behavior differs locally, the worker can fall back to download/upload through the same abstraction later.
- No broad application route rewrites were done. Upload session and worker integration can now consume the path/provider helpers in their owned phases.
