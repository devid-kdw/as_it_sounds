# Admin Workflow Agent Handoff - Phase 6 Review, Curation, Publish

Date: 2026-06-01

Agent role: Admin Workflow Agent

Scope: Admin workflow/spec interpretation and implementation guidance only. No frontend or backend implementation files were edited.

## Phase Goal

Complete the human-led curation path after audio processing succeeds. A processed WAV must enter `needs_review`, then become public only after an admin explicitly reviews identity, taxonomy, technical metadata, license, generated assets, duplicate warnings, and publish blockers.

Processing success is not publish. Metadata save is not publish. Publish is a separate server-side action with a recomputed eligibility gate, audit log, search refresh, and public route/cache revalidation.

## Spec Interpretation

Primary references reviewed:

- Phase 6 prompt in `/Users/grzzi/.codex/attachments/43b979e3-d77c-4aaa-a950-5a61f653a741/pasted-text.txt`
- `../07_Admin_Upload_Curation_Workflow_AIS_v1.md` ADM-01, ADM-07, ADM-11 through ADM-22, ADM-29 through ADM-31, ADM-33
- `../09_UI_Design_System_AIS_v1.md` UI-17

The canonical review route is `/admin/samples/[sampleId]/edit`. It must work for `draft`, `processing`, `needs_review`, `failed`, `published`, and `archived` samples, with state-specific controls.

The workspace should be a dense curation desk with two zones:

- Primary editable zone: lifecycle state, metadata, taxonomy, technical review, albums, license, blockers, warnings, save, publish, archive, restore.
- Persistent secondary preview zone: public-facing preview, waveform, preview playback, generated asset status, duplicate summary, latest processing job summary.

The preview zone must use generated preview audio and waveform peaks only. It must never play or expose the original WAV in the browser.

## Required Workflow Guidance

Metadata save should support draft-quality records. Saving must be allowed when publish blockers exist, except where the submitted field value itself is invalid. The route should return field-level validation errors for invalid values and should not mutate status to `published`.

Publish eligibility must be exposed as `GET /api/admin/samples/[sampleId]/publish-eligibility` and recomputed inside `POST /api/admin/samples/[sampleId]/publish`. The client panel mirrors the server result for usability, but the server is the authority.

Publish blockers must include, at minimum:

- Temporary or invalid `poetic_name`, duplicate `poetic_name`, or missing display title.
- Missing/inactive category or sample type.
- Zero moods or more than three moods.
- Loop sample without BPM; BPM outside 1-400.
- Melodic sample without key and without unknown-key confirmation.
- License not verified, not confirmed, missing rights owner/source type, commercial use not allowed, or redistribution allowed.
- Processing incomplete, failed sample, archived sample.
- Missing original, preview, or waveform asset.
- Duplicate hash warning not acknowledged.

Non-blocking warnings should include missing short description, no hidden tags, no album, featured without description, long duration, unusual sample rate, and mono file.

Publish must be transactional from the admin workflow perspective:

1. Verify admin server-side.
2. Load sample, assets, moods, hidden tags, license fields, and latest processing context.
3. Recompute eligibility.
4. Reject with blockers/warnings if not eligible.
5. Set `status = 'published'` and `published_at`.
6. Clear archive/failure timestamps where appropriate.
7. Refresh `sample_search_documents`.
8. Append `admin_audit_log` with before/after data.
9. Revalidate admin and public routes.
10. Return a safe sample summary and public path, never original asset paths.

Archive must hide a sample from all public discovery immediately, preserve records/assets/history, set `status = 'archived'`, set `archived_at`, and audit log. Restore is conservative: archived samples return to `needs_review`, clear `archived_at`, and must pass the publish gate again before public visibility returns.

Published edits are allowed for normal metadata, taxonomy, moods, hidden tags, BPM/key/loopable, featured, albums, license notes, and attribution. Published `poetic_name` edits require exceptional owner-level confirmation and audit. License changes that invalidate public access must archive or prevent public visibility in the same server transaction.

## Field Guidance

Poetic identity:

- `poetic_name` is primary and must match `^[a-z0-9]+(?:_[a-z0-9]+)*$`.
- `draft_...` identity is allowed only before publish and must show an amber temporary warning.
- Original filename must never become final identity automatically.
- Empty display title should be generated from `poetic_name`; manual display title sets `display_title_is_custom = true`.

Taxonomy:

- Category and sample type are controlled lookup values, not free-form.
- Mood tags are controlled; require 1-3 before publish.
- Hidden tags are optional, admin-only search aids, and must not replace moods.

Technical metadata:

- Read-only: duration, file size, sample rate, bit depth, channels, SHA-256 hash.
- Editable/reviewed: BPM, musical key, `is_melodic`, `unknown_key_confirmed`, `loopable`.
- No MVP auto-detection of BPM, key, or semantic tagging.

License:

- Required before publish: source type, rights owner, verified license status, commercial use allowed true, redistribution allowed false, attribution required, confirmation timestamp, confirming admin.
- `redistribution_allowed` should be locked false, not a casual toggle.
- Blocked/restricted/unverified states must be visibly blocking.

Assets and duplicates:

- Required assets for publish: `original_wav`, `preview_audio`, `waveform_peaks`.
- Asset statuses should distinguish missing row, missing object, invalid, stale, and reprocessing where possible.
- Duplicate warnings are amber warnings, not hard rejects, but publish requires explicit acknowledgement and audit log.

## API Guidance

Phase 6 route set expected by ADM-31:

- `GET /api/admin/samples/[sampleId]` or equivalent admin detail loader for all lifecycle states.
- `PATCH /api/admin/samples/[sampleId]` for metadata, taxonomy, license, duplicate acknowledgement, album, and featured edits. It must validate server-side, update junction tables transactionally, audit meaningful changes, refresh search docs for published samples, and never publish.
- `GET /api/admin/samples/[sampleId]/publish-eligibility`.
- `POST /api/admin/samples/[sampleId]/publish` with `confirm_publish: true`.
- `POST /api/admin/samples/[sampleId]/archive` with `confirm_archive: true`.
- `POST /api/admin/samples/[sampleId]/restore`.

All admin routes must verify admin role server-side, use server-only privileged Supabase access only after authorization, return typed JSON errors, never return secrets or original storage paths, and write audit rows for significant actions.

Use the ADM-33 error shape for API failures:

```ts
type AdminApiError = {
  error: string
  message: string
  fieldErrors?: Record<string, string>
  blockers?: PublishBlocker[]
  warnings?: PublishWarning[]
  requestId?: string
}
```

## Audit Requirements

Append, never update or delete, `admin_audit_log` rows for:

- `sample.metadata_update`
- `sample.taxonomy_update`
- `sample.license_update`
- `sample.duplicate_acknowledge`
- `sample.publish`
- `sample.archive`
- `sample.restore_to_review`
- `sample.featured_toggle`

Audit actor must come from the server-side session, never the request body. Audit payloads should contain minimal before/after values and no signed URLs, secrets, or private original object paths.

## Risks

- Client-only publish blocking would be unsafe. Direct API calls must be rejected by server-side eligibility.
- `needs_review` records with draft identity, no moods, or unverified license should remain saveable but not publishable.
- Duplicate acknowledgement stored only in client state would be lost and unauditable; persist it server-side.
- Public preview in admin may accidentally reuse public sample loaders that filter to `published`; admin preview needs an admin-only payload for unpublished states.
- Published license downgrades are high-risk. They must not leave invalid-license samples public between separate requests.
- Search document refresh after metadata edits and publish is easy to miss; Supabase/testing agents should verify triggers or explicit refresh behavior.
- Original WAV path leakage can happen through debug asset panels or audit payloads; keep original references server-only.
- Archive must remove public visibility even if `featured` remains true on the row.

## Verification Performed

Read the Phase 6 orchestration prompt and referenced admin/UI spec sections. Checked the workspace status before writing this handoff; no pre-existing local changes were present at that time. Created only this handoff file under `handoff/phase-6-review-curation-publish/`.

No application tests were run because this agent did not edit implementation files and the requested output is workflow guidance.

## Recommendations

1. Backend should implement a shared `computePublishEligibility(sampleId)` server utility and call it from both eligibility and publish routes.
2. Frontend should treat the eligibility response as the single blocker panel model and link blockers to form sections where possible.
3. Supabase/testing agents should verify public RLS with `published`, `needs_review`, and `archived` samples after publish/archive/restore.
4. Use one admin detail loader shape that includes safe preview URLs, waveform URL/peaks pointer, asset statuses, latest job summary, duplicate warning state, and publish eligibility.
5. Keep publish, archive, restore, license invalidation, search refresh, and audit logging in tight server-side transactions or RPC-backed mutations where possible.
6. Prioritize tests for license blockers, asset blockers, mood/BPM/key blockers, duplicate acknowledgement, successful publish, archive public removal, restore-to-review, and audit rows.
