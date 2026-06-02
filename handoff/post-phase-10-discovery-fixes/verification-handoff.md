# Post-Phase-10 Fixes Handoff

Date: 2026-06-02

## Scope

This handoff records the audit fixes implemented immediately after Phase 10 and before any new Phase 11 feature handoff.

The work was split across agents:

- Lead/backend lane: discovery RPCs, API routes, Stripe webhook, minor backend debt, final integration.
- Frontend discovery lane: real Wander page and Similar samples panel.
- Verification/handoff lane: post-Phase-10 static tests and handoff record.

## Implemented Fixes

### Discovery Backend

- `/api/wander` is now a real JSON endpoint.
- `/api/similar/[sampleId]` is now a real JSON endpoint.
- `getWanderSamples` now delegates to `public.wander_samples`.
- `getSimilarSamples` now delegates to `public.similar_samples`.
- New migration `0012_discovery_fix_functions.sql` adds:
  - DISC-17 similar scoring with shared moods, category, sample type, hidden tags, BPM proximity, same-album context, loopable/key/featured signals.
  - Album diversity limiting for similar results unless `album_context=true`.
  - Wander weighted randomness over a bounded candidate pool.
  - Wander explicit `exclude` support.
  - Wander authenticated exclusion of the last 20 `recently_played` samples.
  - `wander_events` logging for shown samples.

### Discovery Frontend

- `/wander` no longer shows a phase-gated placeholder.
- `/wander` renders real published discovery samples with `SampleGrid`.
- Sample detail pages now render a real Similar samples section.
- Similar sample card clicks are logged best-effort to `similar_sample_events` through `POST /api/similar/[sampleId]`.

### Stripe Webhook

- `/api/stripe/webhook` is no longer a placeholder.
- The route verifies `Stripe-Signature` using HMAC SHA-256 over the raw request body.
- Duplicate webhook deliveries are guarded by `stripe_webhook_events`.
- Supported events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- The webhook updates the local `subscriptions` mirror and writes `entitlement_events` on status changes.
- Checkout and portal creation remain intentionally deferred; download entitlement still reads local AIS subscription state only.

### Minor Audit Debt

- `AccessMode` and `BillingMode` now have one canonical type source in `types/access.ts`.
- Shared taxonomy helpers now live in `lib/data/taxonomy.ts`; duplicate mood/label helpers were removed from search/sample data modules.
- Download logging now records request IP when forwarded headers are available.
- Download signed URL construction keeps a typed storage ref while preserving the no-original-path response contract.
- Entitlement profile/subscription lookup errors now throw `AISUserSafeError`.
- `wavesurfer.js` was not removed. Current decision: keep it for now because Phase 8 accepts the custom canvas waveform and removing the dependency is package churn unless the player owner confirms Wavesurfer will not be used.

## Files Changed

- `app/api/wander/route.ts`
- `app/api/similar/[sampleId]/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/api/download/[sampleId]/route.ts`
- `app/wander/page.tsx`
- `app/samples/[poeticName]/page.tsx`
- `components/library/sample-grid.tsx`
- `components/library/sample-card.tsx`
- `lib/data/search.ts`
- `lib/data/samples.ts`
- `lib/data/taxonomy.ts`
- `lib/entitlement.ts`
- `lib/auth.ts`
- `types/access.ts`
- `types/api.ts`
- `supabase/migrations/0012_discovery_fix_functions.sql`
- `tests/phase-11-post-phase-10-discovery-fixes-static.test.mjs`

## Verification

Ran:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
```

Result:

- TypeScript passed.
- ESLint passed.
- `node --test tests/*.test.mjs` passed: 111 passing, 1 skipped DB integration test.

## Remaining Follow-Up

- Apply `supabase/migrations/0012_discovery_fix_functions.sql` in the target Supabase environment.
- Smoke test `/api/wander` and `/api/similar/[sampleId]` against real published data after migration.
- Run `AIS_RUN_DB_TESTS=1 pnpm test:db` once local Supabase is up with all migrations applied.
- Implement Checkout/Customer Portal creation in the future paid billing phase.
