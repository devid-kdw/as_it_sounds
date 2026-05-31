# Testing Agent Handoff: Auth / Local Owner Phase

## Summary

Added focused auth/local-owner verification in `tests/auth-local-owner-static.test.mjs`.

Coverage added:

- Login, signup, callback, logout, and server-side admin route surface checks.
- Normalized entitlement shape and local/free/paid access-mode validation.
- Pure entitlement matrix coverage for anonymous, normal user, admin, lifetime, free launch, active, trialing, past_due, canceled, and unpaid states without Stripe calls.
- Account subscription API and billing-disabled checkout/portal route checks.
- Account page checks for normalized entitlement/sign-out state and no live Stripe calls.
- Owner promotion script invariants: `AIS_OWNER_EMAIL`, Service Role/trusted server credentials, no hardcoded UUID, `profiles.role = admin`, `subscriptions.status = lifetime_granted`.
- Auth signup trigger static checks for profile and subscription row creation.
- Browser-adjacent source and built static chunks do not reference Service Role, Stripe secret, webhook secret, or owner email env names.

## Files Changed

- `tests/auth-local-owner-static.test.mjs`
- `handoff/phase-auth-local-owner/testing-agent-phase-auth.md`

## Specs Satisfied

- AUTH-05: Local owner mode remains test-covered for admin/lifetime access and disabled billing.
- AUTH-06: Email/password login, callback exchange, logout, and server-side admin guard surfaces are statically checked.
- AUTH-07: Owner bootstrap script invariants are covered.
- AUTH-08: Auth trigger profile/subscription creation is covered statically; existing DB integration test covers it live when enabled.
- AUTH-09/AUTH-24: Normalized entitlement shape and access matrix are covered without Stripe calls.
- AUTH-21/AUTH-22: Secret exposure checks cover client/browser-adjacent source and optional built chunks.
- AUTH-23: Local workflow assumptions are represented through local-owner, billing-disabled, and owner-promotion checks.
- AUTH-25/AUTH-26: Account/billing UI states and controlled error codes are checked where practical.

## Commands Run

- `node --test tests/auth-local-owner-static.test.mjs`
  - Pass: 8 tests.
- `pnpm test`
  - Pass: 19 tests.
  - Skip: 1 existing local Supabase DB/RLS integration test unless `AIS_RUN_DB_TESTS=1`.
- `pnpm typecheck`
  - Pass.

## Open Risks

- True browser/Supabase end-to-end verification was not run from this lane. Manual/local verification is still needed for actual signup/login, owner promotion against local Supabase, `/admin` access, and non-admin/anonymous rejection.
- Existing DB integration coverage remains opt-in: run with local Supabase and `AIS_RUN_DB_TESTS=1` after migrations are applied.
- Billing placeholder routes currently exist under `app/api/account/billing/checkout` and `app/api/account/billing/portal`; the test accepts those plus the top-level `/api/billing/*` contract shape. Orchestrator should reconcile the final public route path if strict AUTH-20 alignment is desired.
