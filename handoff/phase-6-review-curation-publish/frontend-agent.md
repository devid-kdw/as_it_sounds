# Phase 6 Frontend Review Workspace Handoff

Date: 2026-06-01

Agent role: AIS Phase 6 frontend review-workspace agent

Scope: Frontend guidance only for `/admin/samples/[sampleId]/edit`. No implementation files were changed. This handoff is intended for the orchestrator/integration agent after backend review/publish services are ready.

## References Read

- Phase 6 prompt at `/Users/grzzi/.codex/attachments/43b979e3-d77c-4aaa-a950-5a61f653a741/pasted-text.txt`
- Current page at `app/admin/samples/[sampleId]/edit/page.tsx`
- `07_Admin_Upload_Curation_Workflow_AIS_v1.md` sections ADM-11 through ADM-22, ADM-29, ADM-33
- `09_UI_Design_System_AIS_v1.md` UI-17
- `AIS UI Design System/ais-screens-tools.jsx` admin review mock for layout intent
- `components/admin/README.md`

## Current State

The current edit page is a read-only asset inspection page, not the Phase 6 curation workspace.

Current strengths:

- Loads a sample, required asset rows, recent processing jobs, and duplicate IDs.
- Shows original WAV, preview audio, and waveform peaks asset statuses.
- Uses preview audio only for browser playback and does not expose original WAV playback.
- Renders waveform from generated peaks JSON.
- Links possible duplicate samples to admin edit routes.
- Shows visible asset and processing errors.

Current gaps:

- No metadata form for poetic identity, display title, short description, featured, or album assignment.
- No taxonomy controls for category, sample type, moods, or hidden tags.
- No curator-entered technical metadata fields: BPM, musical key, is melodic, unknown key confirmation, loopable.
- Read-only technical panel omits file size and full hash context.
- No license confirmation workflow or blocking license state UI.
- No publish eligibility fetch, blocker panel, warning list, or field-link behavior.
- No save, publish, archive, restore, or published-edit flows.
- No confirmation dialogs for publish/archive/restore/protected published edits.
- Duplicate warning lacks matching count, poetic names in the visible row, acknowledgement checkbox, reason input, and audit-oriented acknowledgement action.
- Generated asset statuses support only `present`, `missing_row`, and `missing_object`; spec also names `invalid`, `stale`, and `reprocessing`.
- Processing/job status is not shown as UI-17 badges alongside the sample name, and failed/timed-out retry affordances are not wired into this workspace.
- Public preview is not a persistent user-facing preview component. The audio and waveform are separate sections in the main scroll flow.
- Layout is single-column inside `RouteShell`; ADM-11 requires a primary curation zone plus a persistent secondary preview zone.

## Required UI Shape

Implement the workspace as a two-zone admin tool surface.

Primary curation zone:

- Header with sample identity, sample lifecycle status badge, latest job status badge, and concise processing summary.
- Poetic identity editor:
  - `poetic_name` as the prominent primary field.
  - Inline slug helper and immediate format validation for `^[a-z0-9]+(?:_[a-z0-9]+)*$`.
  - Inline uniqueness/server errors after blur or save.
  - Visible warning for `draft_` temporary names.
  - `display_title` input with generated/custom indicator.
  - `display_title_is_custom` behavior exposed through clear/regenerate controls.
  - `short_description` textarea.
  - Published samples should show `poetic_name` locked by default, with a non-default advanced unlock/owner confirmation flow.
- Taxonomy section:
  - Category selector from lookup table.
  - Sample type selector from lookup table.
  - Mood multi-select from the controlled vocabulary, capped at 3 in the UI.
  - Hidden tag selector/creator with slug validation. Hidden tags stay admin-only and must not replace moods.
  - Featured toggle and album assignment if backend payload supports them.
- Technical metadata section:
  - Editable BPM numeric input, valid range 1 to 400.
  - Musical key selector/input.
  - Is melodic toggle.
  - Unknown-key confirmation checkbox, visible/relevant when melodic and key is blank.
  - Loopable toggle.
  - Quiet read-only panel for duration, sample rate, bit depth, channels, file size, and SHA-256 hash.
- License section:
  - Source type selector.
  - Rights owner input.
  - Commercial use allowed toggle.
  - Redistribution allowed locked indicator, always false.
  - Attribution required toggle.
  - License status selector.
  - License notes textarea.
  - Explicit license confirmation checkbox that results in `license_confirmed_at` and `license_confirmed_by`.
  - Warning block for restricted, blocked, unverified, invalid commercial, or unexpected redistribution states.
  - For published samples, invalidating license changes must force archive-now, cancel, or save-and-archive flow.
- Publish blocker panel:
  - Fetch and render `GET /api/admin/samples/[sampleId]/publish-eligibility`.
  - Render blockers and warnings from the server response as the authority.
  - Link blockers to relevant fields where possible.
  - Keep draft metadata save available when only publish blockers remain.
  - Publish button may be disabled, but the blocker list must remain visible/actionable.
- Action area:
  - Save metadata/draft action separate from publish.
  - Publish action visually separated from save and backed by explicit confirmation.
  - Archive/restore actions visually separated from ordinary save and publish.
  - Visible errors using ADM-33 `AdminApiError` shape, including `fieldErrors`, `blockers`, `warnings`, and `requestId` when provided.

Persistent secondary preview zone:

- Must remain visible on desktop as a right rail and on narrow screens as a sticky or repeated bottom/near-top preview zone that is not hidden in a modal.
- Use the public sample card/detail player component family where possible, but with admin payload support for unpublished samples.
- Use `sourceSurface = "admin-preview"` for playback state when Zustand player integration is available.
- Include display title/sample name, poetic name context, short description, category/type labels, mood state, BPM/key/duration/loopable metadata, waveform, and preview audio controls.
- Show missing preview and missing waveform warnings inside the preview panel.
- Use generated preview audio and precomputed waveform peaks only. Never play original WAV in the browser and never include signed original URLs in the preview payload.
- Include generated asset status indicators, duplicate warning summary, and last processing job summary.

## Suggested Component Boundaries

Prefer moving the curation UI out of the route into admin domain components under `components/admin/` or colocated route components if the backend payload remains route-specific.

Recommended split:

- `AdminSampleReviewWorkspace`
  - Owns layout, initial payload, save/publish/archive/restore state, refresh after mutations.
- `SampleLifecycleHeader`
  - Sample status badge, latest job badge, retry affordance when eligible, title/poetic name summary.
- `PoeticIdentityForm`
  - Poetic name, display title, generated/custom state, short description, published identity lock.
- `TaxonomyForm`
  - Category, sample type, moods, hidden tags, featured, album assignment.
- `TechnicalMetadataForm`
  - BPM/key/melodic/unknown-key/loopable plus read-only extracted metadata.
- `LicenseConfirmationForm`
  - Rights fields, locked redistribution state, final confirmation, published invalid-license protections.
- `GeneratedAssetReviewPanel`
  - Asset slot statuses for original, preview, waveform, including `invalid`, `stale`, `reprocessing`.
- `DuplicateWarningPanel`
  - Matching count, links, status, poetic names, acknowledgement checkbox and reason input.
- `PublishEligibilityPanel`
  - Server blockers/warnings, field links, publish disabled explanation.
- `AdminSamplePreviewPanel`
  - Public-facing preview using preview audio and waveform peaks only.
- `ReviewWorkspaceActions`
  - Save, publish, archive, restore, edit-published confirmations.

Data/API hooks can be colocated initially:

- `useAdminSampleDraft` or server-action equivalent for PATCH metadata.
- `usePublishEligibility` for eligibility polling/refetch after form saves.
- `useAdminSampleActions` for publish/archive/restore.
- Keep server response types shared from backend modules if the backend agent adds canonical `PublishEligibility`, `PublishBlocker`, `PublishWarning`, and `AdminApiError` types.

## Backend Integration Assumptions

The frontend should wait for or align with these routes from the backend agent:

- Detail/read route or server fetch capable of loading all lifecycle states.
- `PATCH /api/admin/samples/[sampleId]` for metadata, taxonomy, technical review fields, license fields, hidden tags, moods, featured, and album updates.
- `GET /api/admin/samples/[sampleId]/publish-eligibility`.
- `POST /api/admin/samples/[sampleId]/publish` with `{ "confirm_publish": true }`.
- Archive and restore routes.
- Safe edit-published route/behavior, including protected `poetic_name` and protected license changes.
- Duplicate acknowledgement route or included PATCH operation that writes audit log.

Do not fake publish eligibility client-side beyond convenience validation. The server response must drive the publish blocker panel and final publish result.

## Visual Risks

- The page can become a stack of cards inside `RouteShell`. UI-17 wants a dense work surface with a persistent preview rail, not a long marketing-style page.
- Keep admin controls compact and scannable. Use badges for lifecycle/job/asset states; do not rely on color alone.
- Separate save, publish, and archive controls with spacing, borders, and hierarchy. Archive must not sit visually next to ordinary save as an equal routine action.
- Avoid exposing storage object paths, signed URLs, or original WAV paths in visible UI. If a debug view is added, keep it admin-only and do not show signed URLs.
- Preview must not drift from public components. If a bespoke preview is built quickly, it risks misrepresenting what users will see.
- Moods should feel like controlled assignment, not free-form tags. Hidden tags should be visually secondary/admin-only.
- Published identity editing needs a high-friction advanced treatment. A normal editable text input for published `poetic_name` would violate ADM-13.
- On mobile/narrow widths, the persistent preview requirement is easy to lose. Keep it close to the form and accessible without a modal.
- Long poetic names, blocker messages, duplicate lists, and hash values need wrapping/truncation rules so they do not break the admin grid.

## Verification Needed After Implementation

- Review workspace renders for `draft`, `processing`, `needs_review`, `published`, `archived`, and `failed`.
- Preview audio playback uses preview asset only; original WAV is never used in an audio element.
- Waveform renders from peaks JSON and shows visible warning if missing/invalid.
- Saving metadata shows field errors without blocking unrelated draft saves.
- Publish blocker panel matches server eligibility response before and after fixes.
- Publish refuses blockers and succeeds only after required fields, assets, license, moods, duplicate acknowledgement, and identity rules pass.
- Archive hides public visibility and restore returns archived sample to `needs_review`.
- Published sample protected edits require confirmation and show visible errors.
- Desktop and mobile layouts keep the preview visible and controls non-overlapping.
- Run relevant frontend/unit tests and a browser pass once backend routes exist.

## Files Changed

- Added this handoff only: `handoff/phase-6-review-curation-publish/frontend-agent.md`

## Known Concurrent Work

During verification, `git status --short` also showed unrelated concurrent changes:

- `types/api.ts`
- `tests/phase-6-curation-publish-static.test.mjs`
- `tests/supabase-phase-6-static.test.mjs`

These files were not touched by this frontend handoff pass.
