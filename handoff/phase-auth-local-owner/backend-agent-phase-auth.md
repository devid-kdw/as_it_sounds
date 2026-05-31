# Backend Agent Handoff — Auth / Local Owner Phase

## Summary

Implemented the backend auth/local-owner foundation for AIS:

- Added server-side auth helpers for current user/profile reads, admin checks, login redirects, and normalized auth errors.
- Added trusted `ensureProfileAndSubscription()` repair behavior using the Supabase Service Role client without promoting repaired users.
- Added normalized AUTH-09 entitlement resolution from local AIS database state only. No Stripe calls are made for entitlement.
- Added Supabase SSR middleware session refresh wiring and a root `middleware.ts`.
- Added `/api/account/subscription` to return the normalized entitlement payload.
- Added controlled billing-disabled checkout and portal placeholders under `/api/account/billing/*`.
- Replaced the owner promotion placeholder with `AIS_OWNER_EMAIL` + Service Role bootstrap behavior.

## Files Changed

- `lib/auth.ts`
- `lib/entitlement.ts`
- `lib/data/subscriptions.ts`
- `lib/supabase/middleware.ts`
- `middleware.ts`
- `scripts/placeholders/promote-owner.mjs`
- `app/api/account/subscription/route.ts`
- `app/api/account/billing/checkout/route.ts`
- `app/api/account/billing/portal/route.ts`
- `handoff/phase-auth-local-owner/backend-agent-phase-auth.md`

Note: the shared worktree also contains frontend/auth UI edits outside this backend scope. I did not modify or revert those.

## Specs Satisfied

- `AUTH-00/01/03`: Supabase Auth remains the identity source; Stripe is not required for local owner operation.
- `AUTH-04/05`: `getAccessConfig()` enforces `AIS_ACCESS_MODE` / `AIS_BILLING_MODE` combinations; disabled billing returns controlled `billing_disabled` responses.
- `AUTH-06`: SSR cookie session refresh is wired through Supabase middleware patterns.
- `AUTH-07`: `pnpm ais:promote-owner` reads `AIS_OWNER_EMAIL`, refuses missing email/profile, uses Service Role, avoids hardcoded UUIDs, sets admin role and `lifetime_granted`.
- `AUTH-08`: `ensureProfileAndSubscription()` repairs missing profile/subscription rows from trusted server code and never promotes users.
- `AUTH-09/24`: `EntitlementState` is normalized with browse/favorite/collections/preview/download/plugin/billing flags and uses local subscription/app-setting state.
- `AUTH-21/22/23`: server-only secrets stay in server-only helpers/scripts; local owner mode works without Stripe env.
- `AUTH-26`: auth/config/billing errors are normalized into stable public codes.
- `WEB-08/13`: Supabase browser/server/admin boundaries are preserved; middleware follows SSR session refresh pattern.
- `WEB-14`: backend admin helpers require server-side profile role checks.
- `WEB-22`: account subscription API reads local mirror state rather than Stripe.

## Verification Run

- `pnpm typecheck` — passed.
- `node --test tests/foundation-static.test.mjs` — passed.
- `node --test tests/database-rls.test.mjs` — skipped by design because `AIS_RUN_DB_TESTS=1` was not set.
- `pnpm lint` — failed outside backend scope in untracked `tests/auth-local-owner-static.test.mjs`:
  - warning: unused `subscriptionStatuses`
  - error: assignment to variable `module`
- `pnpm test` — one failing test in untracked `tests/auth-local-owner-static.test.mjs`; the failing assertion expects a literal `redirect|notFound|unauthorized` string inside `app/admin/layout.tsx`, which is outside this backend write scope and currently delegates to `requireAdmin("/admin")`.

## Open Risks

- Full database behavior still needs a local Supabase run with `AIS_RUN_DB_TESTS=1`.
- Paid Stripe checkout/portal remain controlled placeholders; real paid-mode Stripe implementation is still future work.
- Paid-live limited preview safety is not independently verified in this backend change.
- `/api/account/subscription` currently returns `{ ok: true, entitlement }`; frontend/account integration should consume `entitlement` as the normalized AUTH-09 state.
