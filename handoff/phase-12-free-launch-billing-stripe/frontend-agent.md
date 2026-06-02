# Phase 12 Frontend Handoff - Account Billing UI

## Scope

- Updated `app/account/page.tsx`.
- Updated `app/account/billing/page.tsx`.
- Added `app/account/billing/billing-action-form.tsx`.

## Changes

- Preserved `requireCurrentUser` protection on `/account` and `/account/billing`.
- Expanded `/account` to show:
  - signed-in email
  - current subscription state from the local mirror
  - download, preview, favorites, browse, and plugin access summaries
  - human-readable state guide for `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `lifetime_granted`, and `free_launch_access`
  - fail-closed account copy when entitlement exposes `paid_preview_not_ready`
- Expanded `/account/billing` to cover:
  - `local_owner`: local owner copy, no Stripe controls, no upgrade prompt
  - `free_launch`: free launch copy, no Stripe controls
  - `paid_test`: checkout/portal controls plus clear Stripe test warning
  - `paid_live`: live-safe production copy when entitlement reports live mode; fail-closed copy when entitlement exposes `paid_preview_not_ready`
- Added checkout return handling:
  - `/account/billing?checkout=success`
  - `/account/billing?checkout=canceled`
  - shows `Syncing subscription status` when checkout succeeds but local entitlement is not yet `trialing`, `active`, or `lifetime_granted`
- Added client billing forms that POST JSON `{ returnPath: "/account/billing" }` to:
  - `/api/billing/checkout`
  - `/api/billing/portal`
- Client component redirects only to the returned hosted Stripe `url`.
- No secrets or raw environment variables are passed to client components.

## Verification

- `pnpm typecheck`
  - Passed.
- `pnpm lint`
  - Passed.

## Notes

- Concurrent backend work added `/api/billing/checkout` and `/api/billing/portal`, so the frontend uses the Doc 06 route contract rather than the older `/api/account/billing/...` placeholder routes.
- Visual treatment stays within AIS moss/amber tokens and the existing route shell rather than introducing bright SaaS billing chrome.
