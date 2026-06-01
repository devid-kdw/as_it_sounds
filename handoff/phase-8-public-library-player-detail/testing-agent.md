# Phase 8 Public Library, Player & Sample Detail - Testing Agent Handoff

Date: 2026-06-01

## Scope

- Read Phase 8 architecture/design references:
  - `04_Web_Platform_Architecture_AIS_v1.md`: WEB-15, WEB-16, WEB-17, WEB-18, WEB-30, WEB-32
  - `09_UI_Design_System_AIS_v1.md`: UI-10, UI-11, UI-12
- Added/reconciled static `node:test` coverage for the public library/player contract without requiring a live DB or browser.
- Reconciled duplicate Phase 8 tests so only the canonical file remains:
  - kept `tests/phase-8-public-library-player-static.test.mjs`
  - removed stale duplicate `tests/phase-8-public-library-player-detail-static.test.mjs`

## Changed Files

- `tests/phase-8-public-library-player-static.test.mjs`
  - Published-only public browse/detail data checks.
  - Hidden-status exclusion checks for draft, processing, needs_review, failed, archived, and unpublished samples.
  - Public payload checks that expose preview/waveform URLs only, with no original WAV bucket/path/signed URL fields.
  - Detail route checks for canonical `poeticName` lookup and not-found behavior for missing/unpublished samples.
  - Waveform checks for precomputed peaks JSON helper, drawable surface, visible missing/error states, and no browser-side audio decoding for peaks.
  - Player checks for single-authority preview playback, previous-stream stop/reload, active sample replacement, loop/volume/seek state, and preview-only URLs.
  - Play-event route resilience checks.
  - Route-level loading, empty, error, and not-found checks.
  - Keyboard accessibility checks for labelled controls and seek alternatives.
- `handoff/phase-8-public-library-player-detail/testing-agent.md`
  - This handoff.

## Verification

```bash
node --test tests/phase-8-public-library-player-static.test.mjs
```

Result: passed, 9 passed / 0 failed.

```bash
pnpm run typecheck
```

Result: passed.

```bash
npm test
```

Result: passed, 88 passed / 0 failed / 1 skipped.

The skipped test is the existing live DB/RLS integration test gated by `AIS_RUN_DB_TESTS=1`.

```bash
git diff --check
```

Result: passed.

## Risks

- Frontend/backend agents were editing public data, browse/detail routes, and player files concurrently. I did not revert their work.
- These are static contract tests; they do not replace runtime DOM/browser validation for real audio playback, canvas paint output, keyboard operation, or seeded Supabase fixture behavior.

## Next Steps

- Keep the focused Phase 8 suite in the normal test script and rerun after public browse/player/detail changes:

```bash
node --test tests/phase-8-public-library-player-static.test.mjs
npm test
```

- Add runtime/browser tests when the UI stabilizes:
  - waveform canvas renders nonblank from fixture peaks JSON
  - starting sample B pauses/stops sample A
  - playback uses preview URL only
  - keyboard controls operate play/pause, seek, and volume
