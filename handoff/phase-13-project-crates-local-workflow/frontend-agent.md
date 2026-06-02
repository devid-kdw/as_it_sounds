# Phase 13 Project Crates Local Workflow — Frontend Agent Handoff

Date: 2026-06-02

## Scope

Implemented the local owner-only Project Crate UI surface for AIS Phase 13. The frontend work follows the AIS Moss & Amber component language from `../AIS UI Design System/README.md` and the local workflow constraints in `../10_Local_Development_Producer_Workflow_AIS_v1.md`, especially LOCAL-02, LOCAL-04.4, LOCAL-07, LOCAL-08, LOCAL-09, LOCAL-10, LOCAL-10.6, LOCAL-11, LOCAL-13, LOCAL-14.5, LOCAL-15, and LOCAL-16.

This pass did not implement `lib/local-crates.ts` or local API route internals. Those files/routes were present as concurrent nearby work and were left to their owning agents.

## Files Changed

- `components/local-crates/local-crate-state.ts`
- `components/local-crates/local-crate-selector.tsx`
- `components/local-crates/local-crates-workspace.tsx`
- `components/sample-actions/sample-actions.tsx`
- `app/local-crates/page.tsx`
- `config/navigation.ts`
- `components/layout/site-nav.tsx`
- `types/api.ts`
- `handoff/phase-13-project-crates-local-workflow/frontend-agent.md`

## What Changed

- Added a local Project Crate selector/create flow for authenticated `local_owner` surfaces.
- Added sample-card/detail controls for Add to Project Crate and Mark used, gated behind the same local-owner surface as Export/Reveals.
- Updated export behavior so a successful local export can update the active crate as `exported` using the tokenized path returned by the server.
- Added `/local-crates` with active crate summary, considered/exported/used groups, Mark used from crate view, and an Open crate folder action that asks the server for a tokenized crate path before calling the existing reveal route.
- Added local-owner-only nav exposure for the Crates page.
- Added frontend-facing Project Crate types while preserving the existing backend-oriented `ProjectCrate*` API types.

## Verification

Commands run:

```bash
pnpm lint
node --test tests/phase-13-project-crates-local-workflow-static.test.mjs
node --test tests/auth-static.test.mjs tests/phase-13-project-crates-local-workflow-static.test.mjs
pnpm typecheck
pnpm test
pnpm dev
```

Results:

- `pnpm lint`: passed.
- `node --test tests/phase-13-project-crates-local-workflow-static.test.mjs`: passed, 7/7.
- `node --test tests/auth-static.test.mjs tests/phase-13-project-crates-local-workflow-static.test.mjs`: passed, 11/11.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 135 pass / 1 skipped.
- `pnpm dev`: started with approval outside sandbox for browser smoke, then stopped.
- Browser smoke: opened `http://localhost:3000/local-crates`; route rendered and showed the owner-only hidden state while unauthenticated.

## Risks

- The frontend calls `/api/local/crate/sync` and `/api/local/crate/active`, but current route/helper action naming appears mixed between `create_crate` / `select_active` and `create_or_select`. The UI handles route errors visibly, but runtime create/select sync should be smoke-tested after backend alignment.
- Client-side crate state is used for immediate UI grouping. The durable source of truth remains the server-written `crate.json` manifest once the backend sync route is fully aligned.
- Open crate folder relies on the crate sync response returning a tokenized crate path; browser code never constructs local filesystem paths directly.

## Next Steps

- Backend/local workflow owner should confirm `app/api/local/crate/sync/route.ts` action names match `lib/local-crates.ts` at runtime.
- Run a browser smoke test for Browse sample actions plus `/local-crates` with local Supabase and `AIS_ACCESS_MODE=local_owner`.
