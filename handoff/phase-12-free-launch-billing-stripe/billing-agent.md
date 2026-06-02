# Phase 12 Billing Agent Handoff

## Scope

Implemented the server-side Stripe Checkout and Customer Portal slice for Phase 12.

Owned changes:

- Added `app/api/billing/checkout/route.ts`.
- Added `app/api/billing/portal/route.ts`.
- Added server-only helper `lib/billing.ts`.
- Converted `app/api/account/billing/checkout/route.ts` and `app/api/account/billing/portal/route.ts` into compatibility wrappers.
- Added server-only Stripe/live-preview env hints to `.env.example` and `.env.local.example`.

Other Phase 12 files were already being edited by neighboring agents and were left alone.

## Behavior

- `POST /api/billing/checkout` accepts `{ returnPath?: string }` and returns `{ url }` after creating a Stripe Checkout Session.
- `POST /api/billing/portal` accepts `{ returnPath?: string }` and returns `{ url }` after creating a Stripe Customer Portal Session.
- `local_owner` and `free_launch` remain billing-disabled and return controlled `billing_disabled` with HTTP 409 before any Stripe/Supabase billing work.
- Paid modes validate server-only Stripe env at route execution:
  - `paid_test` / `test` requires `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...`, `STRIPE_PRICE_ID=price_...`.
  - `paid_live` / `live` requires `sk_live_...`, `whsec_...`, a non-test `price_...`, and the shared `AIS_LIMITED_PREVIEWS_READY=true` backend guard from `getAccessConfig()`.
- Checkout uses the authenticated Supabase server session, calls `ensureProfileAndSubscription`, reuses `subscriptions.stripe_customer_id`, and stores a newly created Stripe customer id locally before creating Checkout where practical.
- Stripe calls use REST `fetch`; no package install.
- Checkout metadata includes AIS user id, Stripe environment, access mode, and normalized return path. Checkout also sets `client_reference_id`.
- Return paths are normalized to local-only paths. Checkout success/cancel URLs land on `/account/billing` with checkout state and session id for success.
- No Stripe secret or service role key is exposed to client code; billing helper is `server-only`.

## Verification

Passed:

- `npm run typecheck`
- `node --test tests/phase-12-free-launch-billing-stripe-static.test.mjs`
- `node --test tests/phase-12-free-launch-billing-stripe-static.test.mjs tests/auth-local-owner-static.test.mjs tests/entitlement-static.test.mjs`
- `npm test`

`npm test` result: 128 passing, 1 skipped DB/RLS integration test that requires `AIS_RUN_DB_TESTS=1` and local Supabase.

## Notes

- Stripe was not called with real credentials during verification.
- Customer Portal success still depends on Stripe Dashboard portal configuration.
- Webhook synchronization remains the source of truth for paid entitlement after Checkout success.
