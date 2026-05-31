# Supabase Agent Handoff - Auth / Local Owner Phase

## Summary

- Confirmed the existing Auth mirror trigger is present in `supabase/migrations/0009_triggers_and_functions.sql`.
- `public.handle_new_auth_user()` runs after inserts on `auth.users` and creates:
  - `public.profiles` row with `id`, `email`, and optional `display_name`.
  - `public.subscriptions` row with default `status = 'free_launch_access'`.
- Confirmed local Supabase Auth is configured for email/password signup and login:
  - `[auth] enabled = true`
  - `enable_signup = true`
  - `[auth.email] enable_signup = true`
  - `enable_anonymous_sign_ins = false`
  - `[auth.email] enable_confirmations = false`
- Updated local Auth redirect configuration to use `http://localhost:3000` as the primary local site URL and allow both localhost and 127.0.0.1 callback URLs.
- No migration or seed changes were made for this phase.

## Files Changed

- `supabase/config.toml`
  - Changed `auth.site_url` from `http://127.0.0.1:3000` to `http://localhost:3000`.
  - Replaced the old HTTPS-only 127.0.0.1 redirect entry with exact local HTTP redirect URLs:
    - `http://localhost:3000`
    - `http://localhost:3000/auth/callback`
    - `http://127.0.0.1:3000`
    - `http://127.0.0.1:3000/auth/callback`
- `handoff/phase-auth-local-owner/supabase-agent-phase-auth.md`
  - This handoff.

Observed but not touched by this Supabase pass: several app/backend/testing auth-phase files are modified or untracked in the workspace. Those appear to belong to other agents and were not reverted.

## Specs Satisfied

- AUTH-05: Local owner mode keeps Supabase Auth active locally and does not bypass RLS globally.
- AUTH-06: Local Supabase Auth supports email/password, with email confirmation disabled locally.
- AUTH-07: No hardcoded owner UUID was introduced; owner promotion remains outside Supabase config/migration scope.
- AUTH-08: Auth trigger creates both profile and subscription mirror rows for new auth users.
- AUTH-21: Local Auth config aligns with local Supabase URL and local owner mode expectations; no secrets were added.
- AUTH-22: No Service Role key, Stripe secret, owner email, or other secret was exposed in source.
- AUTH-23: Local workflow remains compatible with `supabase start`, `pnpm dev`, signup/login, and owner promotion.
- LOCAL-02: Local Producer Mode continues to use the same Supabase schema and local owner access mode.
- LOCAL-13: No RLS bypass, hardcoded secret, production data dependency, or non-migration schema patch was introduced.

## Verification Run

- Static inspection:
  - Read the relevant AUTH-05/06/07/08/21/22/23 and LOCAL-02/13 spec sections.
  - Inspected `supabase/config.toml`.
  - Inspected `supabase/migrations/0003_core_content_tables.sql`, `0005_entitlement_and_stripe_tables.sql`, `0008_rls_helpers_and_policies.sql`, and `0009_triggers_and_functions.sql`.
  - Confirmed `profiles.id` references `auth.users(id)`.
  - Confirmed `subscriptions.user_id` references `profiles(id)`.
  - Confirmed `on_auth_user_created` exists on `auth.users`.
- Test command completed:
  - `pnpm test`
  - Result: pass. The DB integration test suite was skipped because `AIS_RUN_DB_TESTS=1` was not set.
- Supabase CLI status attempt:
  - `supabase status -o env` failed in the sandbox because the CLI could not write `/Users/grzzi/.supabase/telemetry.json`.
  - An escalated rerun was requested, but the turn was interrupted by the user before it completed.
  - Live local Supabase DB verification was therefore not completed in this pass.

## Open Risks

- The Auth trigger was statically confirmed but not live-tested against a running local Supabase instance in this pass.
- `tests/database-rls.test.mjs` already contains integration coverage that creates Supabase Auth users and asserts profile/subscription mirror rows, but it requires local Supabase and `AIS_RUN_DB_TESTS=1`.
- Normal signup defaults subscriptions to `free_launch_access` per AUTH-08. Local owner `lifetime_granted` still depends on the owner promotion workflow/script, not the signup trigger.
- The broader workspace currently contains other auth-phase changes outside the Supabase-owned files. Orchestrator should integrate those with this config update before final auth-phase closure.
