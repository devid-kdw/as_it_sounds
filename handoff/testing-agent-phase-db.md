# Testing Agent Phase DB Handoff

Date: 2026-05-31

## Files Changed

- `tests/database-rls.test.mjs`
- `handoff/testing-agent-phase-db.md`

## What Changed

Added a Supabase-backed Node test harness for DB-12.10 and the explicit DB/RLS verification list.

The new database tests are intentionally dormant during the normal static suite. `npm test` still runs successfully without a local database; the DB integration test is skipped unless `AIS_RUN_DB_TESTS=1` is set.

The harness:

- Creates disposable auth users through Supabase Auth admin APIs.
- Verifies `handle_new_auth_user()` creates `profiles` and `subscriptions` mirror rows.
- Promotes one disposable user to admin via Service Role.
- Inserts disposable samples/assets/tags/albums with Service Role.
- Exercises RLS through anonymous, authenticated normal-user, and authenticated-admin clients.
- Restores `app_settings.free_launch_downloads_enabled` after the test and cleans up fixture rows/users.

## How To Run

Normal test suite:

```bash
npm test
```

Database/RLS suite after local Supabase is running and migrations are applied:

```bash
npm run db:start
npm run db:reset
AIS_RUN_DB_TESTS=1 node --test tests/database-rls.test.mjs
```

The test tries to discover local keys from `supabase status -o env`. If that is unavailable, export:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
AIS_RUN_DB_TESTS=1 node --test tests/database-rls.test.mjs
```

## Commands Run And Results

- `npm test` - passed. Result: 3 passing static tests, 1 skipped DB integration test.
- `node --check tests/database-rls.test.mjs` - passed.
- `npm run lint` - passed.
- `npm run typecheck` - passed.
- `AIS_RUN_DB_TESTS=1 node --test tests/database-rls.test.mjs` - did not run end-to-end because local Supabase keys were unavailable. Failure stopped at: missing Supabase anon key.
- `supabase status -o env` - blocked by sandbox writing `/Users/grzzi/.supabase/telemetry.json`; escalation was requested and rejected.

## Coverage Checklist

- DB-12.10.1/2: Anonymous users can read only published samples; draft, processing, needs_review, failed, and archived samples remain hidden.
- DB-12.10.3: Authenticated users can read/update only their own profile.
- DB-12.10.4: Normal users cannot promote themselves to admin.
- DB-12.10.5: Authenticated users can favorite only published samples and only for themselves.
- DB-12.10.6/7: Authenticated users can create private collections and cannot read/manage another user's collections.
- Explicit list: `collection_items` ownership is covered for insert/read/update and unpublished-sample rejection.
- Explicit list: `recently_played` ownership is covered for insert/read/update and unpublished-sample rejection.
- DB-12.10.8: Authenticated and anonymous clients cannot read `original_wav` asset rows while preview/waveform rows remain readable for published samples.
- DB-12.10.9: Authenticated and anonymous clients cannot read `sample_hidden_tags` or `sample_search_documents` directly.
- DB-12.10.10: Admin users can read samples in every lifecycle state, insert/update samples, and manage admin-only search/tag rows.
- DB-12.10.11/12 plus explicit list: `has_download_entitlement()` covers free launch enabled/disabled, admin, trialing, active, lifetime_granted, canceled, unpaid, free_launch_access alone, and anonymous.
- DB-12.10.13: Duplicate `stripe_webhook_events.stripe_event_id` inserts are rejected.
- DB-12.10.14 plus explicit list: Search documents are created/refreshed when sample identity, mood, hidden tag, and album membership changes.
- DB-12.10.15/16 plus explicit list: Publish constraints reject unverified license, missing license confirmation metadata, loop without BPM, and melodic sample without key or unknown-key confirmation.
- DB-12.10.17: Fourth mood insertion is rejected after three moods.
- DISC-11: The test asserts exactly 15 seeded primary moods.
- AUTH-08: The test asserts signup creates profile and default `free_launch_access` subscription rows.

## Blockers / Notes

- I could not execute the DB suite end-to-end in this sandbox because local Supabase status/key discovery was blocked and no Supabase keys were available in the environment.
- Migration files appeared from parallel agents while this test pass was in progress. I inspected them for compatibility but did not edit them.
- The DB harness assumes the local database has been reset/applied through the Supabase migrations before running.
