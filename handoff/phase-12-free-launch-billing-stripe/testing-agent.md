# Phase 12 Testing Agent Handoff

## Scope

Added focused Phase 12 regression coverage in:

- `tests/phase-12-free-launch-billing-stripe-static.test.mjs`

The suite covers the Doc 06 AUTH-10, AUTH-13, AUTH-14, AUTH-15, AUTH-16, AUTH-18, AUTH-20, AUTH-27, AUTH-28, and AUTH-29 contracts around free launch, local owner, Stripe billing, webhooks, download entitlement, and paid-live preview safety.

## Coverage Added

- `local_owner` and `free_launch` modes resolve with disabled billing and no Stripe env requirement; checkout and portal return `billing_disabled` with HTTP 409.
- Free launch downloads depend on `free_launch_downloads_enabled`, and `free_launch_access` is not treated as a permanent paid entitlement.
- Checkout creates a server-side Stripe Checkout Session in paid mode, including subscription mode, local user metadata, configured price, success/cancel URLs, and idempotency.
- Portal creates a server-side Customer Portal Session only when a local `stripe_customer_id` exists.
- Webhook reads raw body, verifies signature before parsing, uses service-role/admin client, rejects invalid signatures, and inserts the idempotency ledger before processing.
- Duplicate webhook delivery returns before processing so entitlement events are not duplicated.
- Pure entitlement matrix asserts `active`, `trialing`, and `lifetime_granted` can download, while `past_due`, `canceled`, and `unpaid` cannot.
- Download route uses local entitlement, never calls Stripe, signs URLs only after access checks, and JSON responses never expose storage object paths or buckets.
- `paid_live` is guarded by `paid_preview_not_ready` when preview safety is not verified.

## Verification

Command run:

```bash
node --test tests/phase-12-free-launch-billing-stripe-static.test.mjs
```

Result:

```text
tests 9
pass 9
fail 0
duration_ms 287.732375
```

No blockers from the focused Phase 12 test run.
