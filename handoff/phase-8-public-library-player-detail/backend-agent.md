# Phase 8 Public Library, Player & Sample Detail - Backend Agent Handoff

Date: 2026-06-01

## Scope

- Implemented safe public sample data helpers for browse/detail/playback.
- Implemented safe preview/waveform asset mapping.
- Added canonical published sample lookup by `poetic_name`.
- Added non-fatal play event logging scaffold for `POST /api/play-events`.
- Wired the public sample detail route to call the published-only `poetic_name` lookup and route missing/unpublished samples to `notFound()`.

## Changed Files

- `lib/data/samples.ts`
  - Added `getPublishedSamples`, `getSampleByPoeticName`, `getPublishedSampleForPlayback`, and `getFeaturedSamples`.
  - All public sample queries hard-filter `samples.status = 'published'`.
  - Public payload mapping includes only safe sample fields plus preview/waveform URLs.
- `lib/data/sample-assets.ts`
  - Added public asset URL mapping for `preview_audio` and `waveform_peaks`.
  - Explicitly excludes `original_wav`, signed URLs, buckets, and object paths from returned public payloads.
  - Defensively joins to published samples before returning public asset URLs.
- `lib/data/analytics.ts`
  - Added `tryLogPlayEvent`.
  - Verifies the sample is published before writing analytics.
  - Catches failures and returns a non-throwing result.
- `app/api/play-events/route.ts`
  - Added exported async `POST`.
  - Parses minimal playback event context: `sampleId`, `eventType`, `source`, `sourceSurface`, `secondsPlayed`, `completed`.
  - Returns `202` accepted even when logging fails so preview playback is not broken by analytics issues.
- `app/samples/[poeticName]/page.tsx`
  - Uses `getSampleByPoeticName`.
  - Calls `notFound()` for unpublished, archived, missing, or invalid public samples.
- `types/sample.ts`
  - Added public sample card/detail/list types and safe public asset URL types.

## Verification

- `git diff --check`
  - Passed.
- `pnpm run typecheck`
  - Failed after checks regenerated `.next/types`: `.next/types/validator.ts` cannot find `../../app/page.js`.
  - Earlier source typecheck passed before this generated `.next` validator issue appeared.
- `node --test tests/phase-8-public-library-player-static.test.mjs`
  - Passed: 9/9.
- `pnpm run build`
  - Failed with a Turbopack internal error while processing `app/globals.css`.
  - Root cause in output: sandbox denied a Turbopack subprocess binding to a port (`Operation not permitted`).

## Risks

- `isFavoritedByCurrentUser` currently defaults to `false`; favorites hydration should be added by the frontend/auth integration lane when user-specific library state is connected.
- The public list `query` filter is intentionally simple metadata matching. Full weighted metadata search still belongs in `lib/data/search.ts` / Doc 05.
- `tryLogPlayEvent` uses the trusted server client so anonymous playback can be logged through the server route, but it intentionally suppresses all write failures. Admin analytics should monitor for missing event volume later.
- Whole-app build/typecheck is temporarily blocked by generated `.next` type state and a sandboxed Turbopack port-binding failure, not by the public data/API implementation.

## Next Steps

- Frontend agent should complete `components/player/persistent-player-shell.tsx` with the single `<audio>` authority, previous-stream stop/load behavior, and labelled range controls.
- Connect browse/detail UI to `getPublishedSamples` and `getSampleByPoeticName` views instead of placeholders.
- Add user-specific favorite state hydration once favorites data access is implemented.
- Replace the simple list `query` filter with the Doc 05 search bridge when the search data layer is ready.
