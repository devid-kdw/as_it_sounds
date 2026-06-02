# Phase 11 Discovery Audit Handoff

Audit date: 2026-06-02

Role: Discovery Audit Agent

Scope: read-only audit of existing and emerging Wander, similar, featured, and analytics work against `DISC-16`, `DISC-17`, `DISC-18`, `DISC-19`, `DISC-20`, `DISC-25`, `DISC-27`, and project overview sections 6.4-6.6. This note is the only file intentionally added by this agent.

## Files Inspected

- `../05_Search_Discovery_Logic_AIS_v1.md`
- `../01_Project_Overview_AIS-v1.md`
- `supabase/migrations/0012_discovery_fix_functions.sql`
- `supabase/migrations/0013_analytics_stats_sync.sql` (emerging untracked migration observed during audit)
- `lib/data/search.ts`
- `lib/data/samples.ts`
- `lib/data/analytics.ts`
- `app/api/wander/route.ts`
- `app/api/similar/[sampleId]/route.ts`
- `app/api/search/route.ts`
- `app/api/play-events/route.ts`
- `app/api/download/[sampleId]/route.ts`
- `app/wander/page.tsx`
- `components/discovery/wander-player.tsx` (emerging during audit)
- `app/samples/[poeticName]/page.tsx`
- `app/page.tsx`
- `app/browse/page.tsx`
- `app/browse/browse-search-controls.tsx`
- `app/admin/analytics/page.tsx`
- `lib/data/admin-analytics.ts` (emerging during audit)
- `components/library/sample-card.tsx`
- `components/library/sample-grid.tsx`
- `components/player/persistent-player-shell.tsx`
- `components/player/waveform-preview.tsx`
- `components/sample-actions/sample-actions.tsx`
- `stores/player-store.ts`
- `tests/phase-11-post-phase-10-discovery-fixes-static.test.mjs`

## Spec Fit

- Wander backend is substantially aligned with DISC-16. `public.wander_samples` filters to `status = 'published'`, applies client exclusions capped at 20, excludes the authenticated user's last 20 `recently_played`, supports mood/category context, applies the specified featured/underplayed/mood/category/freshness/overplayed weight formula, limits to a 500-row candidate pool before weighted random ordering, and logs `wander_events.action = 'shown'`.
- `/api/wander` is a real JSON route with `mood`, `category`/`cat`, `exclude`, `limit`, and `source` parsing, and delegates to `getWanderSamples`.
- Similar backend is substantially aligned with DISC-17. `public.similar_samples` anchors on a published source sample, excludes the source, returns published candidates only, uses shared mood/category/type/hidden-tag/BPM/album/loop/key/featured weights, and caps same shared-album results to two unless `album_context=true`.
- `/api/similar/[sampleId]` exposes GET for similar results and an emerging POST for click logging. The POST validates UUIDs, rejects self-clicks, checks both samples are published, and inserts `similar_sample_events`.
- Sample detail integrates similar samples with a 6-item panel and passes `similarSourceSampleId` into `SampleGrid`; `SampleCard` logs similar clicks best-effort via `sendBeacon`/`fetch`.
- Featured rail is published-only and explicitly featured. Homepage uses `getFeaturedSamples(3)` from `lib/data/samples.ts`, which delegates to `getPublishedSamples({ featured: true, sort: "featured" })`; browse/search also has a featured-only filter path through `lib/data/search.ts`.
- Search logging exists for `/api/search`; `logSearchEvent` writes normalized query, privacy-safe filters, result count, user ID when available, and source to `search_logs`, and swallows analytics write failures.
- Recently played/storage foundations are present. `tryLogPlayEvent` inserts `sample_play_events` for published samples and upserts `recently_played` for signed-in users. The emerging `0013_analytics_stats_sync.sql` adds triggers for play, download, similar click, and Wander skip stats.
- A real Wander client experience began landing during the audit: `app/wander/page.tsx` now renders `components/discovery/wander-player.tsx`, with mood chips, a current draw, skip/redraw controls, a small queue, and a client exclusion list capped at 20.
- A real admin analytics surface landed during the audit: `app/admin/analytics/page.tsx` now renders `getAdminAnalyticsDashboard` data from `lib/data/admin-analytics.ts`, including no-result trends, top played/downloaded/favorited samples, processing failures, and Wander skip/play indicators.
- Web playback event capture also began landing during the audit: `components/player/persistent-player-shell.tsx` now sends `preview_start` to `/api/play-events`, which can populate `sample_play_events`, `recently_played`, and play-count triggers.
- Focused static test result after the latest concurrent updates: `node --test tests/phase-11-post-phase-10-discovery-fixes-static.test.mjs` passed 10 of 10 tests.

## Highest Priority Gaps And Risks

1. Wander event lifecycle is still incomplete.
   - `0012` logs `shown` rows from the RPC, and `0013` can count `skipped`, but I did not find a route/helper/client path that inserts `started`, `skipped`, `played`, `favorited`, or `downloaded` Wander actions.
   - `components/discovery/wander-player.tsx` has a skip action, but it only updates client state and reloads `/api/wander`; it does not insert `wander_events.action = 'skipped'`.
   - Favorites and downloads from Wander use generic `SampleActions`/download behavior and do not log matching `wander_events` actions.

2. Playback logging now exists, but its threshold semantics are still risky.
   - `PersistentPlayerShell` logs `preview_start` once `audio.play()` resolves.
   - DISC-19 recommends a meaningful threshold of 2 seconds or 20 percent duration. Current behavior may upsert `recently_played` and increment play stats for very short accidental starts.
   - The route accepts `ended`, `secondsPlayed`, and `completed`, but the player shell does not currently log ended/completion.

3. Wander UI is now closer to the guided mode, but product semantics still need a final decision.
   - `components/discovery/wander-player.tsx` provides mood chips, current draw, skip/redraw, queue, and bounded client exclusions.
   - DISC-16 describes Wander as one guided draw at a time; the current UI keeps a small nearby queue of 3. That may be a reasonable product choice, but it should be confirmed.
   - The UI does not yet surface the "relaxed exclusions only" fallback state if the active mood/exclusion combination returns no candidates.

4. Narrow Wander fallback behavior is missing.
   - DISC-16 says if filters are too narrow and no candidates exist, relax only the exclusion list first and do not relax requested mood without visible UI messaging.
   - `wander_samples` currently applies exclusions and filters in a single eligible set; if it returns empty, there is no fallback query that relaxes only exclusions and no visible messaging beyond the generic empty library state.

5. Similar click stats are now better delegated to `0013`, but migration ordering/types should be verified.
   - The current route no longer manually increments `sample_stats.similar_click_count`; the emerging trigger does that after insert.
   - Because `0013_analytics_stats_sync.sql` is untracked during this audit, make sure it is included and applied after tables/columns exist. Also regenerate or validate `types/database.types.ts` if migrations change.

6. Search logs do not track clicked sample IDs from search/browse results.
   - `search_logs.clicked_sample_id` is supported by `logSearchEvent`, but I did not find a click/update route or browse card click path that fills it for search result clicks.
   - This leaves DISC-20 "results but no plays/clicks" analysis weaker unless play/download events are enough for the first admin view.

## Recommended Fixes

1. Add a small `/api/wander/events` POST or shared helper to log `started`, `skipped`, `played`, `favorited`, and `downloaded` where those actions happen. Preserve best-effort behavior so analytics never blocks playback.
2. Adjust `PersistentPlayerShell` logging to honor the DISC-19 meaningful threshold, and log `ended` with completion/seconds played.
3. Finish the emerging Wander client component by logging `started` and `skipped`, and consider whether the queue should stay at 3 or move to the stricter one-sample draw described in DISC-16.
4. Add Wander no-candidate fallback in backend or route: retry once without explicit `exclude` before returning empty, while keeping published status and requested mood/category intact.
5. Extend focused tests beyond static regex where possible: seeded DB/RPC tests for similar album diversity, weighted Wander published-only exclusion behavior, play-event recently-played threshold/upsert, Wander skip stat increments, and admin analytics query shape.

## Verification Notes

- Ran: `node --test tests/phase-11-post-phase-10-discovery-fixes-static.test.mjs`
- Result after latest concurrent updates: 10 passing, 0 failing.
- I did not run full `npm test`, `pnpm test`, typecheck, or build.

## Concurrency Note

The worktree already had uncommitted/emerging changes when audited:

- `app/api/play-events/route.ts`
- `app/api/similar/[sampleId]/route.ts`
- `app/wander/page.tsx`
- `tests/phase-11-post-phase-10-discovery-fixes-static.test.mjs`
- `components/discovery/wander-player.tsx`
- `lib/data/admin-analytics.ts`
- `supabase/migrations/0013_analytics_stats_sync.sql`

I did not revert or modify those files.
