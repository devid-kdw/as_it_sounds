# Phase 10 Local Workflow Agent Handoff

Date: 2026-06-02

## Scope

Implemented the local owner FL Studio dropzone export/reveal/copy-path workflow for the pre-plugin AIS local handoff. Work stayed in local workflow modules, local-only API endpoints, local action API types, and the local path opener script.

## Files Changed

- `lib/local-export.ts`
- `app/api/local/dropzone/export/route.ts`
- `app/api/local/path/reveal/route.ts`
- `app/api/local/path/copy/route.ts`
- `scripts/open-local-path.mjs`
- `types/api.ts`
- `handoff/phase-10-favorites-collections-downloads-local-export/local-workflow-agent.md`

## What Changed

- Added local-owner export service gated by `AIS_ACCESS_MODE=local_owner` and normalized entitlement with `canDownloadOriginal`.
- Fetches the published sample and private `original_wav` asset server-side without returning bucket/object paths.
- Downloads original WAV bytes through the storage abstraction and materializes a copy in the configured FL dropzone.
- Builds filenames as `{poetic_name}__{bpm_or_no_bpm}__{key_or_no_key}__{sample_id_short}__ais.wav`.
- Reserves destination files with `wx`, applies `_(1)`, `_(2)`, etc. on collisions, and never overwrites an existing dropzone export.
- Returns tokenized local paths for export/reveal results.
- Allows absolute path return only through the explicit copy-path endpoint after server-side token resolution and local-owner entitlement.
- Adds reveal and copy-path local endpoints that resolve tokenized paths server-side and reject traversal through `lib/local-paths.ts`.
- Logs successful local exports into `downloads` with `source = "web"` and `file_version = "original_wav"` without exposing private storage refs.
- Replaced `scripts/open-local-path.mjs` placeholder with a guarded local opener for library/dropzone/cache targets.

## Verification

- `npx eslint lib/local-export.ts app/api/local/dropzone/export/route.ts app/api/local/path/reveal/route.ts app/api/local/path/copy/route.ts types/api.ts`
  - Passed.
- `node --test --test-name-pattern "local owner export|exported filename|reveal and copy" tests/phase-10-favorites-collections-downloads-local-export-static.test.mjs`
  - Passed: 3/3 local workflow tests.
- `node --test tests/phase-10-favorites-collections-downloads-local-export-static.test.mjs`
  - Local workflow tests passed.
  - Full file currently fails 4 download-route tests on standard download contract details outside this agent's owned local-only endpoint scope:
    - anonymous 401/static status cue
    - non-entitled 403/static status cue
    - signed URL expiration/static cue
    - plugin source/static cue
- `npm run typecheck`
  - Blocked by parallel frontend changes outside this scope:
    - `app/samples/[poeticName]/page.tsx(72,55)` and `(115,34)` reference missing `entitlement`.
    - `components/sample-actions/sample-actions.tsx(109,77)` and `(110,96)` pass `string | null` where `string` is required.

## Blockers And Risks

- Standard `/api/download/[sampleId]` still needs backend/download-owner polish before the broad Phase 10 static suite passes.
- Typecheck is blocked by concurrent frontend/sample-actions work.
- Reveal uses OS commands (`open`, `explorer`, `xdg-open`); in sandboxed or headless environments the API returns `local_reveal_failed` instead of bypassing the platform.
- If `AIS_LOCAL_DROPZONE_DIR` is configured outside `AIS_LOCAL_LIBRARY_DIR`, tokenizing the dropzone path will fail by design because `lib/local-paths.ts` only tokenizes paths inside `{{AIS_LOCAL_ROOT}}`.

## Next Steps

- Backend/download owner should implement `/api/download/[sampleId]` with AUTH-17/PIPE-22 signed URL behavior so the broad phase test can pass.
- Frontend owner should fix `SampleCard` entitlement wiring and nullable tokenized path handling.
- UI owner can call:
  - `POST /api/local/dropzone/export` with `{ "sampleId": "..." }`
  - `POST /api/local/path/reveal` with `{ "tokenizedPath": "{{AIS_LOCAL_ROOT}}/..." }`
  - `POST /api/local/path/copy` with `{ "tokenizedPath": "{{AIS_LOCAL_ROOT}}/..." }`

## Orchestrator Reconciliation

- The standard download route and frontend typecheck blockers listed above were resolved during final integration.
- The orchestrator moved successful local export logging to a trusted server/admin database client after entitlement verification, matching DB-07's no-client-insert rule for `downloads`.
- Final orchestrator verification passed the full Phase 10 static suite, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `npm run build`.
