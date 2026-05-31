# Backend Agent Phase DB Handoff

Date: 2026-05-31  
Agent role: Backend server-side Supabase helpers

## Files Changed

- `lib/supabase/admin.ts`
- `handoff/phase-2-database-supabase/backend-agent-phase-db.md`

## Rationale

- Read the requested DB reference sections in `../02_Database_Schema_AIS_v1.md`, including DB-00 through DB-14 with focus on DB-10, DB-12, and DB-14.
- Read `../06_Auth_Subscriptions_Stripe_AIS_v1.md` AUTH-08.
- Kept database scope intentionally limited to server-side helper code. No migrations, generated types, tests, routes, schemas, package scripts, tables, columns, enum values, or policies were changed.
- Preserved `lib/supabase/admin.ts` as server-only with the existing `server-only` marker and service-role client path.
- Added typed public table/RPC aliases that will become precise after Supabase-generated `types/database.types.ts` is updated by the Supabase agent.
- Added `createSupabaseRlsVerificationClient()` for trusted server-side migration/RLS verification scripts. It uses the publishable key, not the service role key, and accepts an optional user access token so tests can exercise anonymous and authenticated RLS paths without bypassing RLS.
- Left the existing service-role `createSupabaseAdminClient()` for trusted setup/verification work that must bypass RLS.
- Did not add a lookup seed wrapper because `supabase/config.toml` already enables `supabase/seed.sql`, and no current Supabase seed workflow requires an extra script.

## Commands Run

- `rg -n "^##? DB-(00|01|02|03|04|05|06|07|08|09|10|11|12|13|14)|DB-10|DB-12|DB-14" ../02_Database_Schema_AIS_v1.md`
  - Result: confirmed requested DB section anchors.
- `rg -n "AUTH-08|^##? AUTH" ../06_Auth_Subscriptions_Stripe_AIS_v1.md`
  - Result: confirmed AUTH-08 anchor and surrounding auth sections.
- `sed` reads of requested DB/AUTH sections and existing Supabase helper files.
  - Result: confirmed admin client already used `server-only`; generated `Database` type is currently an empty placeholder.
- `pnpm typecheck`
  - Result: passed.
- `pnpm test`
  - Result: passed, 3 tests.
- `pnpm lint`
  - Result: passed.

## Coordination Notes

- Supabase agent may regenerate `types/database.types.ts`; the helper aliases in `lib/supabase/admin.ts` are conditional and should resolve to typed rows/inserts/updates/functions once real generated table/function types exist.
- Trusted Node verification scripts that import `lib/supabase/admin.ts` directly should run under the React server condition, for example with `NODE_OPTIONS=--conditions=react-server`, because the module intentionally keeps the `server-only` marker.
- Testing agent can use `createSupabaseRlsVerificationClient()` for RLS checks that must not use the service role key. Pass no token for anonymous checks, or `{ accessToken }` for authenticated user checks.
- Testing agent can use `createSupabaseAdminClient()` only for trusted setup, teardown, direct admin assertions, or Service Role-only paths.
- No `ensureProfileAndSubscription()` utility was added in this pass because AUTH-08 describes it as optional repair behavior and it was not needed for minimal migration/RLS helper support.
- No seed wrapper was added. If the Supabase seed flow later needs a trusted wrapper for lookup-only seed execution, keep it under `scripts/` and do not add lookup values outside DB-03 / DB-12.
