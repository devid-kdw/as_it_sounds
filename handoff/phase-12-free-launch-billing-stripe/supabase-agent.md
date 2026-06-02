# Phase 12 Supabase Agent Handoff

## Scope

Verified Phase 12 billing and entitlement schema/RLS against:

- `../06_Auth_Subscriptions_Stripe_AIS_v1.md`: AUTH-10, AUTH-15, AUTH-16, AUTH-20, AUTH-22, AUTH-27, AUTH-29
- `../02_Database_Schema_AIS_v1.md`: DB-06, DB-10, DB-11

No Supabase migration changes were needed.

## Findings

### Subscription state write protection

Satisfied by existing migrations.

Evidence:

- `supabase/migrations/0008_rls_helpers_and_policies.sql:82` enables RLS on `public.subscriptions`.
- `supabase/migrations/0008_rls_helpers_and_policies.sql:311-315` only creates `select` policies for own-user reads and admin reads.
- There are no `insert`, `update`, `delete`, or `all` policies on `public.subscriptions`.
- `supabase/migrations/0009_triggers_and_functions.sql:72-74` creates the default `free_launch_access` subscription row for new auth users through the auth trigger.

Added DB/RLS test coverage proving:

- Normal authenticated users can read their own subscription row.
- Normal authenticated users cannot read another user's subscription row.
- Normal authenticated users cannot update or delete their own subscription state.
- Service Role can update subscription state.

### Stripe webhook event idempotency

Satisfied by existing migrations.

Evidence:

- `supabase/migrations/0005_entitlement_and_stripe_tables.sql:54-61` defines `public.stripe_webhook_events`.
- `stripe_event_id` is the primary key at `supabase/migrations/0005_entitlement_and_stripe_tables.sql:55`, so duplicate event IDs are rejected by the database.
- Existing DB/RLS integration coverage already verifies duplicate inserts return Postgres error code `23505`.

### Entitlement event writes and reads

Satisfied by existing migrations.

Evidence:

- `supabase/migrations/0008_rls_helpers_and_policies.sql:83` enables RLS on `public.entitlement_events`.
- `supabase/migrations/0008_rls_helpers_and_policies.sql:317-318` creates only an admin `select` policy.
- There are no client `insert`, `update`, `delete`, or `all` policies for `public.entitlement_events`.
- Service Role bypasses RLS, matching the webhook server path required by AUTH-15/AUTH-20/AUTH-22.

Added DB/RLS test coverage proving:

- Service Role can insert an entitlement status transition event.
- Normal authenticated users cannot read or insert entitlement events.
- Admin users can read entitlement events.

### Free launch app setting and helper

Satisfied by existing migrations.

Evidence:

- `supabase/migrations/0005_entitlement_and_stripe_tables.sql:12-17` seeds `app_settings.free_launch_downloads_enabled` with JSON boolean `false`.
- `supabase/migrations/0008_rls_helpers_and_policies.sql:23-38` defines `public.free_launch_downloads_enabled()`, defaulting to `false` if the setting is absent.
- `supabase/migrations/0008_rls_helpers_and_policies.sql:40-59` defines `public.has_download_entitlement()`.
- `has_download_entitlement()` grants only for authenticated users who are admin, when free launch is enabled, or when local subscription status is `trialing`, `active`, or `lifetime_granted`.
- `free_launch_access` is intentionally not a direct subscription-status grant.

Existing DB/RLS integration coverage verifies:

- `free_launch_access` alone does not grant downloads.
- Authenticated users are entitled when free launch is enabled.
- Anonymous users are not entitled during free launch.
- Admin, `trialing`, `active`, and `lifetime_granted` grant access.
- `canceled` and `unpaid` do not grant access.

## Changes Made

- Updated `tests/database-rls.test.mjs` with one focused integration test:
  - `billing state writes use service role while clients get read-only access`
- Added cleanup tracking for inserted `entitlement_events` fixture rows.
- Did not edit Supabase migrations.
- Did not weaken RLS.

## Verification Results

Static SQL checks:

- Confirmed `stripe_webhook_events.stripe_event_id` is a primary key.
- Confirmed RLS is enabled on `app_settings`, `subscriptions`, `entitlement_events`, and `stripe_webhook_events`.
- Confirmed subscription/webhook/entitlement policies are select-only for the relevant billing tables.
- Confirmed free-launch helper and entitlement helper definitions match DB-10.2.
- Confirmed auth trigger creates the default `subscriptions.status = 'free_launch_access'` row.

Commands run:

```bash
node --test tests/database-rls.test.mjs
```

Result:

- Passed with the DB integration suite skipped, as expected without `AIS_RUN_DB_TESTS=1`.

```bash
node --test tests/entitlement-static.test.mjs tests/auth-local-owner-static.test.mjs
```

Result:

- 12 tests passed.

```bash
npm run test:db
```

Result:

- 13 DB/RLS integration tests passed against local Supabase.
- Included the new billing/RLS test and the existing duplicate Stripe event ID test.

Initial blocker:

- `supabase status -o env` failed inside the normal sandbox because Supabase CLI tried to write `/Users/grzzi/.supabase/telemetry.json`.
- Reran the DB test with approved elevated filesystem permission; the test succeeded.

## Recommendation

No SQL migration is recommended for Phase 12 Supabase billing/RLS. The current schema and RLS posture satisfy the referenced docs. Keep the new DB/RLS coverage so future policy changes catch accidental client write access to subscription and entitlement state.
