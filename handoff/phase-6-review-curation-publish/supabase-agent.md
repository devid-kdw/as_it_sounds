# Phase 6 Supabase/RLS Verification Handoff

Date: 2026-06-01

## Scope

- Verified Supabase migration coverage for Phase 6 review, curation, and publish invariants.
- Focused on search document refresh after publish/metadata edits, `admin_audit_log` read privacy, and public published-only RLS.
- Added isolated static migration tests only; no frontend/backend implementation files were edited in this lane.
- Orchestrator closure note: backend routes landed after this lane, local Supabase was reset, and the live DB/RLS suite was run before final Phase 6 signoff.

## Verification

- Search refresh:
  - `supabase/migrations/0009_triggers_and_functions.sql` defines `refresh_sample_search_document(target_sample_id uuid)` as a `security definer` function that upserts `sample_search_documents`.
  - `refresh_search_on_samples` fires `after insert or update on public.samples`, so publishing via `status = 'published'` and metadata edits on `samples` both refresh the search document.
  - Related triggers also refresh on `sample_moods`, `sample_hidden_tags`, and `album_samples` changes.

- Audit log RLS:
  - `supabase/migrations/0006_events_analytics_search_processing_audit_tables.sql` defines `public.admin_audit_log`.
  - `supabase/migrations/0008_rls_helpers_and_policies.sql` enables RLS for `admin_audit_log`.
  - The only audit-log read policy is `admin can read audit log`, using `public.is_admin()`.
  - There is no public/authenticated broad select policy for audit rows, so normal users should not read audit rows.

- Public published-only RLS:
  - `samples` RLS has `public can read published samples` with `status = 'published'`.
  - Public `sample_assets` reads are limited to `preview_audio` and `waveform_peaks` for samples whose status is `published`.
  - Public `sample_moods`, `album_samples`, and `sample_stats` visibility is also gated through published sample status.

- Tests added:
  - `tests/supabase-phase-6-static.test.mjs`
  - Covers Phase 6 static SQL invariants for search refresh, audit-log read privacy, and public published-only visibility.

- Test run:
  - `node --test tests/supabase-phase-6-static.test.mjs`: passed, 3/3.
  - Initial `npm test` run before a concurrent untracked route-contract test appeared: passed, 62/62 with 1 expected skipped live DB integration test.
  - Lane-local `npm test` run after `tests/phase-6-curation-publish-static.test.mjs` appeared: failed 3 route-surface tests because admin sample API route files had not landed yet. Those route files now exist.
  - Final orchestrator verification: `pnpm test`, `pnpm db:reset`, and `pnpm test:db` passed; live DB/RLS coverage passed 12/12.

## Blockers / Risks

- Resolved after this lane: live Supabase integration tests were run with local Supabase available.
- Resolved after this lane: missing admin route files have landed and the full non-DB suite passes.
- The database has an admin-only select policy for `admin_audit_log`, but no insert policy. Phase 6 backend audit writes use the service-role path and hard-fail through `writeAdminAuditLog`.
- Static verification confirms trigger and policy shape, but it cannot prove backend publish/edit/archive routes actually call the audit logger or refresh paths in the intended transaction order.

## Recommendations

- Add route-level tests from the testing agent to verify audit rows are written for publish, archive, restore, metadata edit, license change, duplicate acknowledgement, and featured toggle.
- Keep backend audit writes on the trusted service-role path, or add a narrow admin insert-only RLS policy for `admin_audit_log` if future route code moves to authenticated admin clients.
- Confirm publish/archive route behavior with public clients: published samples appear, archived/unpublished samples disappear, and original WAV assets remain private.
