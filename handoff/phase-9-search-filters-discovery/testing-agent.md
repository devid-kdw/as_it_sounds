# Phase 9 Search, Filters, Discovery — Testing Agent Handoff

Agent role: Testing agent  
Ownership: Phase 9 tests and testing handoff only

## Scope

Added a focused static test suite for the Phase 9 `/browse` search/filter/discovery contract from Doc 05, DISC-27, and the orchestrator prompt.

No production code was edited by this testing lane.

## Files Added

- `tests/phase-9-search-filters-discovery-static.test.mjs`
- `handoff/phase-9-search-filters-discovery/testing-agent.md`

## Test Coverage Added

The new static suite checks:

- Shared `lib/data/search.ts` entry point and `/api/search` delegation.
- Web/plugin-safe `SearchInput`, `SearchResponse`, and `SearchSampleResult` shape.
- Safe preview/waveform result data and no original WAV result fields.
- DISC-08 ranking signals:
  - exact poetic slug priority
  - slug prefix priority
  - full-text score
  - bounded full-text rank
  - trigram/fuzzy behavior and threshold
  - display title, mood, hidden tag, description, category, sample type, and album field scores
  - featured, freshness, and light popularity boosts
- DISC-10 filter surface:
  - mood
  - category
  - sample type
  - BPM min/max
  - musical key
  - loopable
  - featured-only
  - album
- Published-only public search eligibility.
- URL param parse/serialize coverage for canonical params:
  - `q`
  - `mood`
  - `cat`
  - `type`
  - `bpm_min`
  - `bpm_max`
  - `key`
  - `loopable`
  - `featured`
  - `album`
  - `sort`
  - `page`
  - `size`
  - `seed`
- No-result search logging path and logging-failure isolation.
- Guard against client-side full-table sample filtering in browse/live search code.
- Guard against public exposure of `sample_search_documents`, hidden tag values, original WAV paths, or signed original URLs.

## Verification Run

Command:

```sh
node --test tests/phase-9-search-filters-discovery-static.test.mjs
```

Result at handoff time:

```text
tests 7
pass 7
fail 0
```

Full project test command:

```sh
node --test tests/*.test.mjs
```

Full project result at handoff time:

```text
tests 96
pass 94
fail 1
skipped 1
```

The skipped test is the existing DB/RLS integration gate that requires `AIS_RUN_DB_TESTS=1` and a local Supabase instance.

The failing full-suite test is outside this testing lane: `tests/phase-8-public-library-player-static.test.mjs` currently reports `app/browse/page.tsx` missing. That route file was deleted by a concurrent frontend/worktree change after the Phase 9 suite was added.

## Risks

- These are static contract tests. They are intentionally useful before a seeded DB test harness exists, but they do not prove runtime ranking order with fixtures.
- Add seeded behavioral tests when the DB fixture harness is available for exact slug rank-first, title-vs-hidden-tag order, featured/freshness not overpowering direct relevance, and typo/trigram behavior.
- Full-suite status currently depends on the concurrent frontend lane restoring or replacing `app/browse/page.tsx`.
- The worktree already had unrelated edits and concurrent Phase 9 changes while this testing pass ran. I did not revert or modify them.
