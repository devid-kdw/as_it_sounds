# Phase 12 Orchestrator Handoff - Free Launch, Billing & Stripe Paid Test

Date: 2026-06-02

Agent role: orchestrator

## Scope

Implemented and reconciled Phase 12. AIS can now move from `local_owner` toward `free_launch` and `paid_test` without making Stripe a local-owner dependency. Paid live remains fail-closed until limited-preview safety is explicitly configured.

## Delegated Handoffs

- Billing agent: `handoff/phase-12-free-launch-billing-stripe/billing-agent.md`
- Backend agent: `handoff/phase-12-free-launch-billing-stripe/backend-agent.md`
- Frontend agent: `handoff/phase-12-free-launch-billing-stripe/frontend-agent.md`
- Supabase agent: `handoff/phase-12-free-launch-billing-stripe/supabase-agent.md`
- Testing agent: `handoff/phase-12-free-launch-billing-stripe/testing-agent.md`

## Implemented

- Added server-only Stripe REST billing helper in `lib/billing.ts`.
- Added Doc 06 billing routes:
  - `POST /api/billing/checkout`
  - `POST /api/billing/portal`
- Kept old `/api/account/billing/checkout` and `/api/account/billing/portal` as compatibility wrappers.
- Checkout and portal fail gracefully with `billing_disabled` in `local_owner` and `free_launch`.
- Checkout in paid modes:
  - requires authenticated Supabase session
  - repairs profile/subscription rows
  - reuses or stores `subscriptions.stripe_customer_id`
  - creates Stripe Checkout Session with subscription mode
  - attaches AIS user metadata and `client_reference_id`
  - returns only the hosted Stripe URL
- Portal in paid modes:
  - requires authenticated session
  - requires local `stripe_customer_id`
  - creates Stripe Customer Portal Session
  - returns only the hosted Stripe URL
- Hardened Stripe webhook:
  - raw-body signature verification before JSON parse
  - idempotency ledger insert before event processing
  - duplicate event early return
  - supported `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`
  - unknown events marked `ignored`
  - failures marked `failed` with visible error message
  - AUTH-16 Stripe status mapping
  - entitlement events on real status transitions
- Added `paid_live` guard in `getAccessConfig()`: `AIS_ACCESS_MODE=paid_live` requires `AIS_BILLING_MODE=live` and `AIS_LIMITED_PREVIEWS_READY=true`; otherwise server paths fail closed with `paid_preview_not_ready`.
- Expanded `/account` with subscription, download, preview, admin, favorites, browse, plugin, and status-guide surfaces.
- Expanded `/account/billing` for local owner, free launch, paid test, paid live, checkout success/cancel, pending webhook sync, and paid-preview-not-ready states.
- Added client billing action form that posts to server routes and redirects only to returned Stripe hosted URLs.
- Added Phase 12 static regression coverage.
- Added DB/RLS coverage for subscription write protection and entitlement event visibility/writes.
- Added env-template hint for `AIS_LIMITED_PREVIEWS_READY=false`.

## Orchestrator Reconciliation

- Billing metadata used `ais_user_id`, while the backend webhook initially read only `metadata.user_id`. Final webhook now accepts `metadata.ais_user_id` with `metadata.user_id` as a fallback.
- Compatibility wrappers initially re-exported `runtime`, which Next.js cannot statically parse. Final wrappers declare `export const runtime = "nodejs"` locally and re-export only `POST`.
- The Phase 12 static test was updated to assert the webhook reads `metadata.ais_user_id`.
- The download route was left unchanged after review: it uses local entitlement, creates a short-lived signed URL, logs downloads, never calls Stripe, and never returns original object paths.
- No Supabase migration was needed. Existing RLS and primary key constraints already satisfy subscription write protection and webhook idempotency.

## Verification

Passed:

```bash
node --test tests/phase-12-free-launch-billing-stripe-static.test.mjs
pnpm typecheck
pnpm lint
pnpm test
npm run build
git diff --check
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-publishable-key> SUPABASE_SERVICE_ROLE_KEY=<local-secret-key> npm run test:db
```

Results:

- Phase 12 static suite: 9/9 passed.
- Typecheck: passed.
- Lint: passed.
- Full test suite: 128 passed, 1 expected opt-in DB/RLS integration skip, 0 failed.
- Build: passed.
- Diff whitespace check: passed.
- Live DB/RLS suite: 13/13 passed against local Supabase after running outside the sandbox with local key aliases.

Build warnings:

- Existing Next.js middleware-to-proxy deprecation warning.
- Existing Turbopack NFT trace warning through local filesystem routes.

DB verification notes:

- Plain `npm run test:db` inside the sandbox first failed because local Supabase env aliases were not present.
- `supabase status` inside the sandbox hit the known telemetry permission boundary.
- After approved elevated local Supabase access, the DB/RLS suite passed.

## Known Risks / Follow-Up

- Stripe Checkout/Portal were verified structurally and by tests, not against live Stripe credentials in this pass.
- Customer Portal still depends on Stripe Dashboard portal configuration.
- Webhook success in real paid test should be exercised with Stripe CLI/test events before relying on paid access operationally.
- `paid_live` intentionally remains blocked until limited preview behavior is implemented and `AIS_LIMITED_PREVIEWS_READY=true` is set in a verified production-safe environment.
- Free launch downloads still require `app_settings.free_launch_downloads_enabled = true` in the target Supabase environment.
