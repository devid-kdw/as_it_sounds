# Phase 12 Backend Handoff - Free Launch Billing Stripe

## Scope

- Hardened `app/api/stripe/webhook/route.ts`.
- Hardened `lib/entitlement.ts` for the `paid_live` preview safety guard.
- Reviewed `app/api/download/[sampleId]/route.ts`; no code change was needed because it already uses local entitlement only and returns only a signed URL plus expiry.

## Changes

- Stripe webhook verification still reads the raw request body with `request.text()` before any JSON parse and verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`.
- Webhook events are inserted into `stripe_webhook_events` before processing; duplicate `stripe_event_id` inserts return as duplicates and do not process, preventing duplicate `entitlement_events`.
- Added support for `customer.subscription.created`.
- Unknown events are marked `ignored`.
- Processing failures are marked `failed` with `error_message` on the webhook ledger row.
- Subscription status mapping now follows AUTH-16:
  - `trialing` -> `trialing`
  - `active` -> `active`
  - `past_due` -> `past_due`
  - `canceled` -> `canceled`
  - `unpaid` -> `unpaid`
  - `incomplete` -> `past_due`
  - `incomplete_expired` -> `canceled`
  - `paused` -> `canceled`
  - unknown fallback -> `unpaid`
- Checkout session completion now promotes the local mirror to `active` from webhook sync instead of preserving a stale local non-paid state.
- Added server-side `paid_live` fail-closed guard in `getAccessConfig()`: `AIS_ACCESS_MODE=paid_live` requires `AIS_BILLING_MODE=live` and `AIS_LIMITED_PREVIEWS_READY=true`; otherwise routes using entitlement/access config return `paid_preview_not_ready`.
- Preserved existing `local_owner` and `free_launch` entitlement logic.

## Download Route Review

- `app/api/download/[sampleId]/route.ts` does not import Stripe, instantiate Stripe, or query Stripe APIs.
- It resolves entitlement through `getEntitlementForCurrentUser()`.
- It fetches original asset bucket/path server-side only, creates a short-lived signed download URL, logs successful downloads, and returns only `{ url, expiresAt }`.
- Because the new `paid_live` guard is in `getAccessConfig()`, the download route fails closed with `paid_preview_not_ready` when paid live is attempted before limited previews are marked ready.

## Verification

- `pnpm exec tsc --noEmit`
  - Passed with no output.
- `node --test tests/entitlement-static.test.mjs tests/auth-local-owner-static.test.mjs tests/phase-10-favorites-collections-downloads-local-export-static.test.mjs tests/phase-11-post-phase-10-discovery-fixes-static.test.mjs`
  - Passed: 36 tests, 0 failures.

## Notes

- No database migration was added. Existing `stripe_webhook_events.stripe_event_id` primary key provides webhook idempotency.
- No live Stripe calls were introduced.
