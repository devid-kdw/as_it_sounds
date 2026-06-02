# Phase 11 Frontend Handoff: Wander, Similar, Featured, Analytics

## Scope

- Polished `/wander` from a generic full-grid page into a mood-first discovery surface.
- Added safe client exclusions for recently played and skipped sample IDs, capped at the last 20 IDs sent to `/api/wander`.
- Added non-blocking playback analytics emission from the persistent player for preview starts, including `sourceSurface`.
- Re-checked similar samples and homepage featured rail integration through existing published-only helpers.

## Changed Files

- `app/wander/page.tsx`
- `components/discovery/wander-player.tsx`
- `components/player/persistent-player-shell.tsx`
- `app/api/play-events/route.ts`
- `tests/phase-11-post-phase-10-discovery-fixes-static.test.mjs`
- `handoff/phase-11-wander-similar-featured-analytics/frontend-agent.md`

## Verification

- `npm run typecheck` passes.
- `node --test tests/phase-11-post-phase-10-discovery-fixes-static.test.mjs` passes: 12/12.
- Similar panel remains wired through `getSimilarSamples(sample.id, { limit: 6, source: "web" })`; the RPC/helper path enforces `samples.status = 'published'`.
- Homepage featured rail remains wired through `getFeaturedSamples(3)` from `lib/data/samples.ts`, which filters `status = 'published'` and `featured = true`.
- Wander empty state explicitly avoids unpublished fallback behavior.

## Blockers / Risks

- `/api/play-events` accepts `sourceSurface`, but the current database schema has no `source_surface` column on `sample_play_events`; the route acknowledges the surface for future observability while persisting the existing play event shape.
- Wander skip/favorite/download-specific `wander_events` logging is not exposed by a dedicated frontend route yet; `/api/wander` handles `shown` via the backend RPC path.

## Next Steps

- Add a dedicated best-effort Wander event endpoint if Phase 11 wants `skipped`, `favorited`, and `downloaded` rows from public client actions.
- Consider promoting the current player placeholder favorite/add/download controls into real `SampleActions` once the player store carries enough sample metadata for action contracts.
