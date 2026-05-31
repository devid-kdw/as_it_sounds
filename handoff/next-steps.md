# AIS Next Steps

Date: 2026-05-31  
Status: Ready for the next approved implementation phase after owner review

## Immediate Cleanup / Coordination

1. Review the Phase 0 and Phase 1 implementation skeleton.
2. Decide whether to commit the foundation as the initial repository baseline.
3. Start Docker Desktop before Supabase runtime verification.
4. Run:

```bash
pnpm db:start
```

5. If Supabase starts successfully, record the result in this handoff folder.

## Recommended Next Backend/Supabase Work

Do not begin database implementation until the owner approves the next phase.

When approved:

- Read `../02_Database_Schema_AIS_v1.md` fully for the target schema, relationships, indexes, and RLS policies.
- Read `../06_Auth_Subscriptions_Stripe_AIS_v1.md` for auth, access modes, owner promotion, and entitlement rules.
- Create real Supabase migrations under `supabase/migrations/`.
- Generate `types/database.types.ts` only after migrations are stable.
- Implement local owner mode and admin promotion through the approved script path.
- Preserve RLS. Do not bypass RLS globally in local development.

Acceptance signals for that step:

- `pnpm db:start` works locally.
- `pnpm db:reset` applies migrations.
- Required lookup data can be seeded.
- Admin owner promotion has a documented, repeatable path.

## Recommended Next Frontend/UI Work

Do not turn route shells into finished pages until the matching data and behavior specs are active.

When approved:

- Read `../AIS UI Design System/README.md`.
- Pull implementation guidance from:
  - `../AIS UI Design System/ais.css`
  - `../AIS UI Design System/tailwind.tokens.js`
  - `../AIS UI Design System/ais-primitives.jsx`
  - `../AIS UI Design System/ais-cards.jsx`
  - `../AIS UI Design System/ais-screens-public.jsx`
  - `../AIS UI Design System/ais-screens-tools.jsx`
  - `../AIS UI Design System/ais-app.jsx`
- Reimplement visual structure in production components instead of copying mock fixture behavior.
- Keep poetic sample identity visually dominant.
- Keep metadata subordinate.
- Keep empty and error states visible.

Acceptance signals for that step:

- UI components use AIS tokens.
- No default bright SaaS styling appears.
- Route shells remain secure and do not expose server-only secrets.
- No original WAV paths or local absolute paths are rendered to client surfaces.

## Recommended Next Audio/Storage Work

Do not implement upload processing before the storage and audio pipeline phase is approved.

When approved:

- Read `../03_Storage_Audio_Processing_Pipeline_AIS_v1.md`.
- Keep original WAV access private.
- Generate preview audio and waveform peaks server-side.
- Ensure browser playback uses preview assets only.
- Ensure waveform rendering uses precomputed peaks JSON only.
- Route all storage access through `lib/storage.ts`.

Acceptance signals for that step:

- Original WAV references never reach browser code.
- Preview and waveform URL contracts are explicit.
- Failed audio assets produce visible UI errors.

## Recommended Next Testing Work

Expand testing as soon as real behavior is added.

Priority checks:

- Route smoke tests for public, account, and admin shells.
- Static checks that client components cannot import `lib/supabase/admin.ts`.
- Static checks that server-only env names do not appear in client modules.
- Build checks that Tailwind AIS tokens remain available.
- Future integration checks for RLS, auth callback, entitlement, and signed download behavior.

## Handoff Discipline

Every future task should leave a note in this folder that answers:

- What changed?
- Why was it in scope?
- Which spec section authorized it?
- What commands were run?
- What failed or stayed blocked?
- What should the next agent do first?
