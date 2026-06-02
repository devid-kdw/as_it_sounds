# Phase 11 Backend/Search Agent Handoff

## Scope
- Reconciled Wander, similar samples, featured helpers, playback analytics, and download analytics against the Phase 11 search/discovery specs.
- Kept existing `/api/wander`, `/api/similar/[sampleId]`, `/api/play-events`, `/api/download/[sampleId]`, and local export behavior intact where already aligned.

## Changed Files
- `supabase/migrations/0013_analytics_stats_sync.sql`
  - Adds stats sync triggers for `sample_play_events`, `downloads`, `similar_sample_events`, and skipped `wander_events`.
  - Play events increment `sample_stats.play_count` and update `last_played_at`.
  - Web signed downloads and local dropzone exports increment `sample_stats.download_count` and update `last_downloaded_at` through their existing `downloads` inserts.
  - Similar click inserts increment `sample_stats.similar_click_count`.
- `app/api/play-events/route.ts`
  - Keeps playback logging non-blocking.
  - Avoids counting `pause` and `seek` payloads as sample play events.
  - Treats `ended` as completed when the caller does not provide `completed`.
- `app/api/similar/[sampleId]/route.ts`
  - Keeps GET delegation to `getSimilarSamples`.
  - Requires both source and clicked sample IDs to be published before logging a similar click.
  - Removes race-prone manual stats update; migration trigger owns counter sync.
- `tests/phase-11-post-phase-10-discovery-fixes-static.test.mjs`
  - Adds focused static coverage for Phase 11 analytics stats sync and non-blocking play logging.

## Verification
- `node --test tests/phase-11-post-phase-10-discovery-fixes-static.test.mjs` passed: 10 tests.
- `pnpm run typecheck` passed.

## Blockers / Risks
- Database trigger behavior has static coverage only unless Supabase DB tests are run locally with `AIS_RUN_DB_TESTS=1`.
- `/api/wander` currently logs `shown` events inside the `wander_samples` RPC. There is no separate skip/start endpoint in this pass.
- Similar click logging is stricter now: unpublished source or clicked sample IDs return 404 and do not write analytics.

## Next Steps
- Apply migration `0013_analytics_stats_sync.sql` in the target Supabase environment.
- Consider an explicit Wander event route for `started`, `skipped`, `played`, `favorited`, and `downloaded` actions if the frontend needs those interactions beyond current `shown` logging.
- Add DB integration tests for play/download/similar trigger increments once the local Supabase test environment is available.
