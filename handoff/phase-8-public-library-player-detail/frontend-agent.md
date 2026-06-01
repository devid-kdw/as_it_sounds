# Phase 8 Public Library, Player & Sample Detail — Frontend Handoff

Date: 2026-06-01

## Scope

- Replaced the homepage shell with the first public AIS listening entry point: poetic identity, browse CTA, featured rail, mood entry points, licensing promise, and free-launch signup prompt.
- Replaced the browse placeholder with a public library surface using backend `getPublishedSamples`, including search shell, mood/category rails, sort control, active chips, empty state, and server-backed next/previous page links.
- Added public sample cards where poetic identity and waveform dominate, with quiet metadata and favorite/collection/download placeholders.
- Added a canvas waveform component that fetches precomputed peaks JSON through `fetchWaveformPeaks`, lazy-loads near viewport, supports click/keyboard seeking, and visibly handles missing/error waveform and preview states.
- Replaced the persistent player shell with a singleton hidden `<audio>` element, lazy preview loading, previous-stream stop/reload on active sample changes, play/pause, seek, loop, volume, current sample state, and visible errors.
- Replaced sample detail placeholder with canonical published sample detail using `getSampleByPoeticName`, `notFound()` for missing/unpublished samples, large poetic title, waveform preview, quiet metadata, action placeholders, licensing note, and Phase 11 similar-samples placeholder.

## Changed Files

Frontend-owned:

- `app/page.tsx`
- `app/browse/page.tsx`
- `app/samples/[poeticName]/page.tsx`
- `components/library/sample-card.tsx`
- `components/library/sample-grid.tsx`
- `components/player/waveform-preview.tsx`
- `components/player/persistent-player-shell.tsx`
- `stores/player-store.ts`
- `types/player.ts`
- `handoff/phase-8-public-library-player-detail/frontend-agent.md`

Observed shared/non-frontend changes present in the worktree from other agents:

- `app/api/play-events/route.ts`
- `config/categories.ts`
- `config/moods.ts`
- `lib/data/analytics.ts`
- `lib/data/sample-assets.ts`
- `lib/data/samples.ts`
- `types/sample.ts`
- `tests/phase-8-public-library-player-static.test.mjs`

## Verification

- `node --test tests/phase-8-public-library-player-static.test.mjs` — passed, 9/9.
- `pnpm run typecheck` — passed.

## Risks

- The waveform renderer supports the documented peaks shapes and draws a canvas directly; it does not use WaveSurfer yet. This keeps the browser from decoding originals and satisfies Phase 8, but future richer waveform behavior may still move to WaveSurfer.
- Favorite, collection, and download controls are intentionally placeholders until those Phase 8/Phase 11 flows are wired to real endpoints/modals.
- Homepage featured and detail similar sections depend on backend helper availability and published sample fixtures/data.
- Persistent player is fixed to the viewport bottom, so future visual QA should tune page bottom padding across routes once the full app shell settles.

## Next Steps

- Wire favorite and collection placeholders to authenticated user mutations/modals.
- Wire detail/download action to entitlement-aware download endpoint state.
- Add browser visual QA for waveform/player layout once local published samples with preview and waveform assets exist.
- Consider extracting filter rails to reusable discovery components after the backend search contract stabilizes.
