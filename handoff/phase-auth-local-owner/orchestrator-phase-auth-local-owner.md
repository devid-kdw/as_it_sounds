# Orchestrator Handoff - Auth / Local Owner Phase

## Summary

Implemented the AIS authentication and local owner access phase end-to-end across backend helpers, frontend route shells, Supabase local auth configuration, and focused verification tests.

The owner workflow now has real Supabase email/password login and signup surfaces, SSR callback/logout handling, local owner entitlement resolution without Stripe, a promotion script keyed by `AIS_OWNER_EMAIL`, server-side admin route protection, and billing-disabled placeholder routes.

## Agent Handoffs Reviewed

- `handoff/phase-auth-local-owner/backend-agent-phase-auth.md`
- `handoff/phase-auth-local-owner/frontend-agent-phase-auth.md`
- `handoff/phase-auth-local-owner/supabase-agent-phase-auth.md`
- `handoff/phase-auth-local-owner/testing-agent-phase-auth.md`

Orchestrator reconciliation:

- The frontend handoff originally mentioned a temporary `/logout` alias. That alias was removed after handoff; the final logout route is `/auth/logout`.
- Supabase live verification remains manual because local Supabase was not running/verified in this phase. Static migration/config checks and app tests passed.

## Files Changed

Backend and shared auth:

- `lib/auth.ts`
- `lib/entitlement.ts`
- `lib/data/subscriptions.ts`
- `lib/supabase/middleware.ts`
- `middleware.ts`
- `scripts/placeholders/promote-owner.mjs`

API routes:

- `app/api/account/subscription/route.ts`
- `app/api/account/billing/checkout/route.ts`
- `app/api/account/billing/portal/route.ts`
- `app/api/admin/upload-sessions/route.ts`
- `app/api/admin/processing-jobs/[jobId]/retry/route.ts`

Frontend routes:

- `app/login/page.tsx`
- `app/login/login-form.tsx`
- `app/auth/callback/route.ts`
- `app/auth/logout/route.ts`
- `app/account/page.tsx`
- `app/account/billing/page.tsx`
- `app/admin/layout.tsx`
- `app/admin/page.tsx`
- `components/layout/site-nav.tsx`

Supabase:

- `supabase/config.toml`

Tests and handoffs:

- `tests/auth-local-owner-static.test.mjs`
- `tests/auth-static.test.mjs`
- `tests/entitlement-static.test.mjs`
- `handoff/phase-auth-local-owner/backend-agent-phase-auth.md`
- `handoff/phase-auth-local-owner/frontend-agent-phase-auth.md`
- `handoff/phase-auth-local-owner/supabase-agent-phase-auth.md`
- `handoff/phase-auth-local-owner/testing-agent-phase-auth.md`
- `handoff/phase-auth-local-owner/orchestrator-phase-auth-local-owner.md`

## Specs Satisfied

- AUTH-00/01/03/04/05: Local owner mode is default, real auth remains active, Stripe is not required, billing-disabled routes fail gracefully.
- AUTH-06/WEB-13: Supabase email/password login/signup, callback exchange, logout, and SSR session refresh are wired.
- AUTH-07: `pnpm ais:promote-owner` reads `AIS_OWNER_EMAIL`, uses Service Role, refuses missing email/profile, sets `profiles.role = 'admin'`, grants `lifetime_granted`, and hardcodes no UUID.
- AUTH-08: Existing auth trigger creates `profiles` and `subscriptions`; trusted `ensureProfileAndSubscription()` repairs missing rows without promotion.
- AUTH-09/AUTH-24: Normalized `EntitlementState` covers anonymous, admin, lifetime, free launch, active, trialing, past_due, canceled, and unpaid states from local DB state only.
- AUTH-21/22/23/LOCAL-13: Server-only secrets remain outside client/browser-adjacent source; no RLS bypass or Stripe dependency was introduced.
- AUTH-25/26/WEB-22: Login/account/billing UI states and controlled error codes are represented.
- WEB-14/WEB-23/ADM-05: Admin layout verifies admin server-side before rendering; admin nav is hidden for non-admin users as UX only.

## Verification

Passed:

- `pnpm typecheck`
- `pnpm test` - 19 passed, 1 skipped by design without `AIS_RUN_DB_TESTS=1`
- `pnpm lint`
- `pnpm build` - passed outside sandbox after Turbopack needed localhost bind permission
- `git diff --check`

Browser/API smoke:

- `/login` renders login/signup UI with `local_owner` development state.
- Anonymous `/admin` redirects to `/login?next=%2Fadmin`.
- Anonymous `/account` redirects to `/login?next=%2Faccount`.
- `GET /api/account/subscription` returns normalized anonymous entitlement in `local_owner` mode.
- `POST /api/account/billing/checkout` returns `409 billing_disabled`.
- `POST /api/account/billing/portal` returns `409 billing_disabled`.

## Open Risks

- Live local Supabase signup/login and owner promotion were not executed against a running Supabase instance in this phase.
- `tests/database-rls.test.mjs` remains opt-in with `AIS_RUN_DB_TESTS=1`.
- Paid test/live Checkout and Portal are intentionally controlled placeholders.
- Next.js 16 warns that the `middleware` file convention is deprecated in favor of `proxy`; current build still passes.
