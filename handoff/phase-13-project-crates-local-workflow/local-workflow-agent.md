# Phase 13 Project Crates Local Workflow Handoff

Date: 2026-06-02

## Scope

Implemented the server-side Project Crate domain logic for Local Producer Mode. The crate service is local-only, entitlement-gated, resolves crate folders through `lib/local-paths.ts`, stores tokenized paths, and keeps `crate.json` as the Project Crate source of truth.

## Files Changed

- `lib/local-crates.ts`
  - Added server-only crate manifest sync.
  - Validates filesystem-safe crate/project names.
  - Creates crate folders: `exports`, `considered_samples`, `used_samples`, plus `notes.md`.
  - Supports create/select active crate, add sample, mark used, and exported-path sync actions.
  - Writes keyed `samples` entries by `sample_id`.
  - Preserves existing notes when omitted from update payloads.
  - Stores and returns tokenized paths only.
  - Writes `crate.json` atomically with temp file plus rename.
  - Reports missing exported files without deleting historical manifest paths.
- `types/api.ts`
  - Added/updated Project Crate sync request and response types, including action aliases currently used by the local crate route and tokenized-path response fields.
- `tests/phase-13-project-crates-local-workflow-static.test.mjs`
  - Phase 13 static coverage is present and passing.
- `handoff/phase-13-project-crates-local-workflow/local-workflow-agent.md`
  - This handoff.

Related nearby workspace changes were already present during this pass, including `lib/local-events.ts`, `app/api/local/crate/*`, `app/api/local/events/*`, `components/local-crates/*`, `app/local-crates/*`, and sample action/nav changes. I did not revert them.

## Verification

Passed:

```text
node --test tests/phase-13-project-crates-local-workflow-static.test.mjs
npm run typecheck
npx eslint lib/local-crates.ts lib/local-events.ts types/api.ts tests/phase-13-project-crates-local-workflow-static.test.mjs
```

Full suite:

```text
npm test
```

Result: 134 passed, 1 skipped, 1 failed. The failure is in `tests/auth-static.test.mjs` for `components/layout/site-nav.tsx` expecting the older literal admin nav filter expression `item.href !== "/admin" || canSeeAdmin`. I left this frontend/static-test mismatch untouched because it is outside the owned crate domain files.

## Blockers / Risks

- No database schema sync was added. This follows LOCAL-10.6/LOCAL-11 guidance that `crate.json` remains the Project Crate source of truth until a formal migration is approved.
- The current workspace includes frontend and route changes from nearby work. The server crate module accepts both canonical action names and the route action aliases, but I did not alter route schemas or frontend local storage behavior in this pass.
- Multiple crate manifests can contain `active: true` if older manifests are not revisited. The root `.active-crate.json` is the active selector source; manifest active metadata is informational.

## Next Steps

- Resolve the unrelated `SiteNav` static-test mismatch in the frontend/nav lane.
- If the route owner continues Phase 13 API work, ensure `/api/local/crate/sync` passes nested sample payloads or top-level sample fields consistently.
- Add a formal Supabase migration for `local_project_sample_usage` only if later approved by spec.
