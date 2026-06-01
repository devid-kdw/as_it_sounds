"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  LockKeyhole,
  RotateCcw,
  Save,
  Send,
  XCircle,
} from "lucide-react";
import type {
  AdminSampleDetailResponse,
  AdminSampleDetailApiResponse,
  AdminSamplePatchApiResponse,
  AdminSamplePatchRequest,
  AdminSampleActionApiResponse,
  ApiErrorResponse,
  PublishBlocker,
} from "@/types/api";
import { adminSampleEditRoute } from "@/lib/routes";
import { WaveformPeaksPreview } from "./waveform-peaks-preview";

type FormState = {
  poetic_name: string;
  display_title: string;
  display_title_is_custom: boolean;
  short_description: string;
  category_slug: string;
  sample_type_slug: string;
  mood_slugs: string[];
  hidden_tag_slugs: string[];
  bpm: string;
  musical_key: string;
  is_melodic: boolean;
  unknown_key_confirmed: boolean;
  loopable: boolean;
  featured: boolean;
  source_type: AdminSampleDetailResponse["sample"]["source_type"];
  rights_owner: string;
  commercial_use_allowed: boolean;
  attribution_required: boolean;
  license_status: AdminSampleDetailResponse["sample"]["license_status"];
  license_notes: string;
  license_confirmed: boolean;
  duplicate_acknowledgement_reason: string;
  confirm_published_poetic_name_change: string;
  archive_if_license_invalid: boolean;
};

type ActionState = {
  message: string | null;
  error: string | null;
  busy: boolean;
};

const sourceTypeOptions = [
  { value: "original_recording", label: "Original recording" },
  { value: "synthesized", label: "Synthesized" },
  { value: "field_recording", label: "Field recording" },
  { value: "processed_original", label: "Processed original" },
  { value: "licensed_source", label: "Licensed source" },
] as const;

const licenseStatusOptions = [
  { value: "unverified", label: "Unverified" },
  { value: "verified", label: "Verified" },
  { value: "restricted", label: "Restricted" },
  { value: "blocked", label: "Blocked" },
  { value: "archived", label: "Archived" },
] as const;

export function AdminSampleReviewWorkspace({
  initialDetail,
}: {
  initialDetail: AdminSampleDetailResponse;
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [form, setForm] = useState<FormState>(() => formStateFromDetail(initialDetail));
  const [actionState, setActionState] = useState<ActionState>({
    message: null,
    error: null,
    busy: false,
  });

  const isPublished = detail.sample.status === "published";
  const isArchived = detail.sample.status === "archived";
  const previewAudio = detail.preview.preview_url;
  const waveformPeaks = detail.preview.waveform_peaks_url;
  const previewAsset = detail.assets.find((asset) => asset.kind === "preview_audio");
  const waveformAsset = detail.assets.find((asset) => asset.kind === "waveform_peaks");
  const privateSourceAsset = detail.assets.find((asset) => asset.label === "Original WAV");
  const blockerMap = useMemo(
    () => new Map(detail.eligibility.blockers.map((blocker) => [blocker.field ?? blocker.code, blocker])),
    [detail.eligibility.blockers],
  );

  function updateForm<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    const payload = buildPatchPayload(form, detail);
    await runDetailMutation("Saving sample.", async () => patchSample(detail.sample.id, payload));
  }

  async function handlePublish() {
    await runAction("Publishing sample.", async () =>
      postSampleAction(detail.sample.id, "publish", { confirm_publish: true }),
    );
  }

  async function handleArchive() {
    if (!window.confirm("Archive this sample? It will disappear from public discovery, but assets and history remain.")) {
      return;
    }

    await runAction("Archiving sample.", async () =>
      postSampleAction(detail.sample.id, "archive", { confirm_archive: true }),
    );
  }

  async function handleRestore() {
    if (!window.confirm("Restore this archived sample to review? It will not be republished automatically.")) {
      return;
    }

    await runAction("Restoring sample.", async () =>
      postSampleAction(detail.sample.id, "restore", { confirm_restore: true }),
    );
  }

  async function runDetailMutation(message: string, action: () => Promise<AdminSampleDetailResponse>) {
    setActionState({ busy: true, error: null, message });

    try {
      const nextDetail = await action();
      setDetail(nextDetail);
      setForm(formStateFromDetail(nextDetail));
      setActionState({ busy: false, error: null, message: "Saved." });
    } catch (error) {
      setActionState({ busy: false, error: errorMessage(error), message: null });
    }
  }

  async function runAction(
    message: string,
    action: () => Promise<AdminSampleActionApiResponse extends infer Response ? Response : never>,
  ) {
    setActionState({ busy: true, error: null, message });

    try {
      const response = (await action()) as AdminSampleActionApiResponse;

      if (!response.ok) {
        throw response;
      }

      const nextDetail = await fetchSampleDetail(detail.sample.id);
      setDetail(nextDetail);
      setForm(formStateFromDetail(nextDetail));
      setActionState({ busy: false, error: null, message: actionSuccessLabel(response.data.status) });
    } catch (error) {
      setActionState({ busy: false, error: errorMessage(error), message: null });
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.78fr)]">
      <section className="grid content-start gap-5">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="ais-meta text-ais-amber">lifecycle</p>
              <h2 className="ais-title mt-2 text-2xl text-ais-text">{detail.sample.status.replace("_", " ")}</h2>
              <p className="mt-2 text-sm leading-6 text-ais-muted">
                {detail.latest_processing_job
                  ? `${detail.latest_processing_job.job_type.replaceAll("_", " ")} - ${detail.latest_processing_job.status}`
                  : "No processing job attached."}
              </p>
            </div>
            <StatusPill label={detail.eligibility.can_publish ? "publish ready" : "blocked"} ok={detail.eligibility.can_publish} />
          </div>
        </Panel>

        <Panel title="Poetic identity" eyebrow="identity">
          {detail.sample.poetic_name.startsWith("draft_") ? (
            <Notice tone="warning" title="Temporary draft identity">
              Replace the draft poetic name before publishing. Original filenames never become public identity.
            </Notice>
          ) : null}
          {isPublished ? (
            <Notice tone="warning" title="Published identity is protected">
              To change the poetic name, type the current poetic name in the confirmation field before saving.
            </Notice>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="poetic_name" blocker={blockerMap.get("poetic_name")}>
              <input
                className="ais-input"
                onChange={(event) => updateForm("poetic_name", event.target.value)}
                value={form.poetic_name}
              />
            </Field>
            <Field label="display title" blocker={blockerMap.get("display_title")}>
              <input
                className="ais-input"
                onChange={(event) => {
                  updateForm("display_title", event.target.value);
                  updateForm("display_title_is_custom", true);
                }}
                value={form.display_title}
              />
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm text-ais-muted">
            <input
              checked={!form.display_title_is_custom}
              onChange={(event) => {
                updateForm("display_title_is_custom", !event.target.checked);
                if (event.target.checked) {
                  updateForm("display_title", "");
                }
              }}
              type="checkbox"
            />
            Generate display title from poetic name
          </label>
          {isPublished ? (
            <Field label="confirm published identity change">
              <input
                className="ais-input"
                onChange={(event) => updateForm("confirm_published_poetic_name_change", event.target.value)}
                placeholder={detail.sample.poetic_name}
                value={form.confirm_published_poetic_name_change}
              />
            </Field>
          ) : null}
          <Field label="short description" blocker={blockerMap.get("short_description")}>
            <textarea
              className="ais-input min-h-28"
              onChange={(event) => updateForm("short_description", event.target.value)}
              value={form.short_description}
            />
          </Field>
        </Panel>

        <Panel title="Taxonomy" eyebrow="mood and classification">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="category" blocker={blockerMap.get("category_slug")}>
              <select
                className="ais-input"
                onChange={(event) => updateForm("category_slug", event.target.value)}
                value={form.category_slug}
              >
                {detail.taxonomy.categories.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="sample type" blocker={blockerMap.get("sample_type_slug")}>
              <select
                className="ais-input"
                onChange={(event) => updateForm("sample_type_slug", event.target.value)}
                value={form.sample_type_slug}
              >
                {detail.taxonomy.sample_types.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="moods" blocker={blockerMap.get("mood_slugs")}>
            <div className="flex flex-wrap gap-2">
              {detail.taxonomy.moods.map((mood) => {
                const active = form.mood_slugs.includes(mood.slug);
                return (
                  <button
                    className={[
                      "rounded-ais-sm border px-3 py-2 text-sm transition",
                      active
                        ? "border-ais-amber bg-ais-elevated text-ais-text"
                        : "border-ais-border-soft bg-ais-panel text-ais-muted hover:border-ais-amber",
                    ].join(" ")}
                    key={mood.slug}
                    onClick={() => updateForm("mood_slugs", toggleLimited(form.mood_slugs, mood.slug, 3))}
                    type="button"
                  >
                    {mood.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="hidden search tags">
            <select
              className="ais-input min-h-36"
              multiple
              onChange={(event) =>
                updateForm(
                  "hidden_tag_slugs",
                  Array.from(event.currentTarget.selectedOptions).map((option) => option.value),
                )
              }
              value={form.hidden_tag_slugs}
            >
              {detail.taxonomy.hidden_tags.map((tag) => (
                <option key={tag.slug} value={tag.slug}>
                  {tag.label}
                </option>
              ))}
            </select>
          </Field>
        </Panel>

        <Panel title="Technical review" eyebrow="curator fields">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="BPM" blocker={blockerMap.get("bpm")}>
              <input
                className="ais-input"
                inputMode="decimal"
                max="400"
                min="1"
                onChange={(event) => updateForm("bpm", event.target.value)}
                type="number"
                value={form.bpm}
              />
            </Field>
            <Field label="musical key" blocker={blockerMap.get("musical_key")}>
              <input
                className="ais-input"
                onChange={(event) => updateForm("musical_key", event.target.value)}
                value={form.musical_key}
              />
            </Field>
          </div>
          <ToggleRow label="Is melodic" value={form.is_melodic} onChange={(value) => updateForm("is_melodic", value)} />
          <ToggleRow
            label="Unknown key confirmed"
            value={form.unknown_key_confirmed}
            onChange={(value) => updateForm("unknown_key_confirmed", value)}
          />
          <ToggleRow label="Loopable" value={form.loopable} onChange={(value) => updateForm("loopable", value)} />
          <div className="grid gap-3 text-sm text-ais-muted sm:grid-cols-2 xl:grid-cols-3">
            <ReadOnlyDatum label="duration" value={formatSeconds(detail.sample.duration_seconds)} />
            <ReadOnlyDatum label="sample rate" value={detail.sample.sample_rate ? `${detail.sample.sample_rate} Hz` : "Pending"} />
            <ReadOnlyDatum label="bit depth" value={detail.sample.bit_depth ? `${detail.sample.bit_depth}-bit` : "Pending"} />
            <ReadOnlyDatum label="channels" value={detail.sample.channels ? `${detail.sample.channels}` : "Pending"} />
            <ReadOnlyDatum label="file size" value={formatBytes(detail.sample.file_size_bytes)} />
            <ReadOnlyDatum label="sha-256" value={detail.sample.file_hash_sha256 ?? "Pending"} />
          </div>
        </Panel>

        <Panel title="License" eyebrow="rights">
          {form.license_status !== "verified" ? (
            <Notice tone="danger" title="License blocks publish">
              Restricted, blocked, archived, or unverified license states cannot publish.
            </Notice>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="source type">
              <select
                className="ais-input"
                onChange={(event) => updateForm("source_type", event.target.value as FormState["source_type"])}
                value={form.source_type}
              >
                {sourceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="license status" blocker={blockerMap.get("license_status")}>
              <select
                className="ais-input"
                onChange={(event) => updateForm("license_status", event.target.value as FormState["license_status"])}
                value={form.license_status}
              >
                {licenseStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="rights owner" blocker={blockerMap.get("rights_owner")}>
            <input
              className="ais-input"
              onChange={(event) => updateForm("rights_owner", event.target.value)}
              value={form.rights_owner}
            />
          </Field>
          <ToggleRow
            label="Commercial use allowed"
            value={form.commercial_use_allowed}
            onChange={(value) => updateForm("commercial_use_allowed", value)}
          />
          <ToggleRow
            label="Attribution required"
            value={form.attribution_required}
            onChange={(value) => updateForm("attribution_required", value)}
          />
          <div className="rounded-ais-sm border border-ais-border-soft bg-ais-panel p-3 text-sm text-ais-muted">
            Redistribution allowed: <span className="text-ais-text">locked false</span>
          </div>
          <ToggleRow
            label="I confirm this license for publication"
            value={form.license_confirmed}
            onChange={(value) => updateForm("license_confirmed", value)}
          />
          {isPublished ? (
            <ToggleRow
              label="Archive if this license change invalidates public access"
              value={form.archive_if_license_invalid}
              onChange={(value) => updateForm("archive_if_license_invalid", value)}
            />
          ) : null}
          <Field label="license notes">
            <textarea
              className="ais-input min-h-24"
              onChange={(event) => updateForm("license_notes", event.target.value)}
              value={form.license_notes}
            />
          </Field>
        </Panel>

        {detail.duplicate_warning.is_duplicate ? (
          <Panel title="Possible duplicate source" eyebrow="duplicate hash" tone="warning">
            <p className="text-sm leading-6 text-ais-muted">
              {detail.duplicate_warning.matching_sample_ids.length} matching source hash
              {detail.duplicate_warning.matching_sample_ids.length === 1 ? "" : "es"} found.
            </p>
            <div className="grid gap-2">
              {detail.duplicate_warning.matching_samples.map((sample) => (
                <Link
                  className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm text-ais-text hover:border-ais-amber"
                  href={adminSampleEditRoute(sample.id)}
                  key={sample.id}
                >
                  {sample.poetic_name} - {sample.status}
                </Link>
              ))}
            </div>
            {detail.duplicate_warning.acknowledged ? (
              <Notice tone="success" title="Duplicate warning acknowledged">
                {detail.duplicate_warning.reason ?? "No reason recorded."}
              </Notice>
            ) : (
              <Field label="acknowledgement reason" blocker={blockerMap.get("duplicate_not_acknowledged")}>
                <input
                  className="ais-input"
                  onChange={(event) => updateForm("duplicate_acknowledgement_reason", event.target.value)}
                  value={form.duplicate_acknowledgement_reason}
                />
              </Field>
            )}
          </Panel>
        ) : null}

        <Panel title="Publish blockers" eyebrow="eligibility">
          <BlockerList blockers={detail.eligibility.blockers} />
          {detail.eligibility.warnings.length ? (
            <div className="mt-4 grid gap-2">
              {detail.eligibility.warnings.map((warning) => (
                <p className="text-sm text-ais-muted" key={warning.code}>
                  {warning.message}
                </p>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel>
          {actionState.error ? <Notice tone="danger" title="Action failed">{actionState.error}</Notice> : null}
          {actionState.message ? <Notice tone="success" title="Status">{actionState.message}</Notice> : null}
          <div className="flex flex-wrap gap-3">
            <ActionButton disabled={actionState.busy} icon={<Save size={17} />} onClick={handleSave}>
              Save curation
            </ActionButton>
            <ActionButton
              disabled={actionState.busy || !detail.eligibility.can_publish || isArchived}
              icon={<Send size={17} />}
              onClick={handlePublish}
              tone="primary"
            >
              Publish
            </ActionButton>
            {isArchived ? (
              <ActionButton disabled={actionState.busy} icon={<RotateCcw size={17} />} onClick={handleRestore}>
                Restore to review
              </ActionButton>
            ) : (
              <ActionButton disabled={actionState.busy} icon={<Archive size={17} />} onClick={handleArchive} tone="danger">
                Archive
              </ActionButton>
            )}
          </div>
        </Panel>
      </section>

      <aside className="grid content-start gap-5 xl:sticky xl:top-6">
        <Panel title={detail.sample.display_title} eyebrow="public preview">
          <p className="ais-meta text-ais-amber">{detail.sample.poetic_name}</p>
          {detail.sample.short_description ? (
            <p className="mt-3 text-sm leading-6 text-ais-muted">{detail.sample.short_description}</p>
          ) : (
            <p className="mt-3 text-sm leading-6 text-ais-danger">Short description missing.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {form.mood_slugs.map((moodSlug) => (
              <span className="rounded-full border border-ais-border-soft px-3 py-1 text-xs text-ais-muted" key={moodSlug}>
                {moodSlug}
              </span>
            ))}
          </div>
        </Panel>

        <Panel title="Generated stream" eyebrow="preview_audio">
          {previewAudio ? (
            <audio className="w-full" controls preload="none" src={previewAudio} />
          ) : (
            <Notice tone="danger" title="Preview missing">
              Preview audio is required before publish.
            </Notice>
          )}
          <AssetStatusRow asset={previewAsset} />
        </Panel>

        <Panel title="Generated waveform" eyebrow="waveform_peaks">
          {waveformPeaks ? (
            <WaveformPeaksPreview url={waveformPeaks} />
          ) : (
            <Notice tone="danger" title="Waveform missing">
              Waveform peaks JSON is required before publish.
            </Notice>
          )}
          <AssetStatusRow asset={waveformAsset} />
        </Panel>

        <Panel title="Private original" eyebrow="private source">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-1 text-ais-muted" aria-hidden="true" size={20} />
            <p className="text-sm leading-6 text-ais-muted">
              Stored privately. The browser preview never receives a playable original WAV URL.
            </p>
          </div>
          <AssetStatusRow asset={privateSourceAsset} />
        </Panel>

        {detail.latest_processing_job ? (
          <Panel title="Last processing job" eyebrow={detail.latest_processing_job.job_type}>
            <dl className="grid gap-3 text-sm text-ais-muted">
              <ReadOnlyDatum label="status" value={detail.latest_processing_job.status} />
              <ReadOnlyDatum label="attempts" value={`${detail.latest_processing_job.attempts} / ${detail.latest_processing_job.max_attempts}`} />
              <ReadOnlyDatum label="finished" value={formatDate(detail.latest_processing_job.finished_at)} />
            </dl>
          </Panel>
        ) : null}
      </aside>
    </div>
  );
}

function formStateFromDetail(detail: AdminSampleDetailResponse): FormState {
  return {
    poetic_name: detail.sample.poetic_name,
    display_title: detail.sample.display_title_is_custom ? detail.sample.display_title : "",
    display_title_is_custom: detail.sample.display_title_is_custom,
    short_description: detail.sample.short_description ?? "",
    category_slug: detail.sample.category_slug,
    sample_type_slug: detail.sample.sample_type_slug,
    mood_slugs: detail.assigned_mood_slugs,
    hidden_tag_slugs: detail.assigned_hidden_tag_slugs,
    bpm: detail.sample.bpm?.toString() ?? "",
    musical_key: detail.sample.musical_key ?? "",
    is_melodic: detail.sample.is_melodic,
    unknown_key_confirmed: detail.sample.unknown_key_confirmed,
    loopable: detail.sample.loopable,
    featured: detail.sample.featured,
    source_type: detail.sample.source_type,
    rights_owner: detail.sample.rights_owner ?? "",
    commercial_use_allowed: detail.sample.commercial_use_allowed,
    attribution_required: detail.sample.attribution_required,
    license_status: detail.sample.license_status,
    license_notes: detail.sample.license_notes ?? "",
    license_confirmed: Boolean(detail.sample.license_confirmed_at && detail.sample.license_confirmed_by),
    duplicate_acknowledgement_reason: detail.duplicate_warning.reason ?? "",
    confirm_published_poetic_name_change: "",
    archive_if_license_invalid: false,
  };
}

function buildPatchPayload(form: FormState, detail: AdminSampleDetailResponse): AdminSamplePatchRequest {
  const payload: AdminSamplePatchRequest = {
    poetic_name: form.poetic_name.trim(),
    display_title: form.display_title_is_custom ? form.display_title.trim() : null,
    display_title_is_custom: form.display_title_is_custom,
    short_description: form.short_description.trim() || null,
    category_slug: form.category_slug,
    sample_type_slug: form.sample_type_slug,
    mood_slugs: form.mood_slugs,
    hidden_tag_slugs: form.hidden_tag_slugs,
    bpm: form.bpm.trim() ? Number(form.bpm) : null,
    musical_key: form.musical_key.trim() || null,
    is_melodic: form.is_melodic,
    unknown_key_confirmed: form.unknown_key_confirmed,
    loopable: form.loopable,
    featured: form.featured,
    source_type: form.source_type,
    rights_owner: form.rights_owner.trim() || null,
    commercial_use_allowed: form.commercial_use_allowed,
    redistribution_allowed: false,
    attribution_required: form.attribution_required,
    license_status: form.license_status,
    license_notes: form.license_notes.trim() || null,
    license_confirmed: form.license_confirmed,
    archive_if_license_invalid: form.archive_if_license_invalid,
  };

  if (detail.sample.status === "published" && form.poetic_name !== detail.sample.poetic_name) {
    payload.confirm_published_poetic_name_change = form.confirm_published_poetic_name_change;
  }

  if (detail.duplicate_warning.is_duplicate && !detail.duplicate_warning.acknowledged) {
    payload.duplicate_acknowledgement = {
      acknowledged: true,
      reason: form.duplicate_acknowledgement_reason.trim() || null,
    };
  }

  return payload;
}

async function patchSample(sampleId: string, payload: AdminSamplePatchRequest) {
  const response = await fetch(`/api/admin/samples/${encodeURIComponent(sampleId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as AdminSamplePatchApiResponse;

  if (!response.ok || !data.ok) {
    throw data;
  }

  return data.data;
}

async function fetchSampleDetail(sampleId: string) {
  const response = await fetch(`/api/admin/samples/${encodeURIComponent(sampleId)}`, {
    cache: "no-store",
  });
  const data = (await response.json()) as AdminSampleDetailApiResponse;

  if (!response.ok || !data.ok) {
    throw data;
  }

  return data.data;
}

async function postSampleAction(sampleId: string, action: "publish" | "archive" | "restore", payload: Record<string, unknown>) {
  const response = await fetch(`/api/admin/samples/${encodeURIComponent(sampleId)}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  return (await response.json()) as AdminSampleActionApiResponse;
}

function Panel({
  children,
  eyebrow,
  title,
  tone = "default",
}: {
  children: React.ReactNode;
  eyebrow?: string;
  title?: string;
  tone?: "default" | "warning";
}) {
  return (
    <section
      className={[
        "grid gap-4 rounded-ais-lg border bg-ais-surface p-5",
        tone === "warning" ? "border-ais-warning" : "border-ais-border-soft",
      ].join(" ")}
    >
      {title || eyebrow ? (
        <div>
          {eyebrow ? <p className="ais-meta text-ais-amber">{eyebrow}</p> : null}
          {title ? <h2 className="ais-title mt-2 text-2xl text-ais-text">{title}</h2> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Field({
  blocker,
  children,
  label,
}: {
  blocker?: PublishBlocker;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm text-ais-muted">
      <span className="ais-meta text-ais-faint">{label}</span>
      {children}
      {blocker ? <span className="text-ais-danger">{blocker.message}</span> : null}
    </label>
  );
}

function ToggleRow({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm text-ais-muted">
      <span>{label}</span>
      <input checked={value} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function ReadOnlyDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ais-sm border border-ais-border-soft bg-ais-panel p-3">
      <dt className="ais-meta text-ais-faint">{label}</dt>
      <dd className="mt-1 break-words text-ais-text">{value}</dd>
    </div>
  );
}

function AssetStatusRow({
  asset,
}: {
  asset: AdminSampleDetailResponse["assets"][number] | undefined;
}) {
  const present = asset?.status === "present";

  return (
    <div className="flex items-center justify-between gap-3 rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm">
      <span className="text-ais-muted">{asset?.label ?? "Asset"}</span>
      <span className={present ? "text-ais-success" : "text-ais-danger"}>{asset?.status.replace("_", " ") ?? "missing row"}</span>
    </div>
  );
}

function BlockerList({ blockers }: { blockers: PublishBlocker[] }) {
  if (blockers.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-ais-sm border border-ais-success bg-ais-panel p-3">
        <CheckCircle2 className="mt-1 text-ais-success" aria-hidden="true" size={18} />
        <p className="text-sm leading-6 text-ais-text">No blocking publish issues remain.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {blockers.map((blocker) => (
        <div className="flex items-start gap-3 rounded-ais-sm border border-ais-danger bg-ais-panel p-3" key={blocker.code}>
          <XCircle className="mt-1 text-ais-danger" aria-hidden="true" size={18} />
          <div>
            <p className="ais-meta text-ais-danger">{blocker.code}</p>
            <p className="mt-1 text-sm leading-6 text-ais-text">{blocker.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Notice({
  children,
  title,
  tone,
}: {
  children: React.ReactNode;
  title: string;
  tone: "danger" | "success" | "warning";
}) {
  const styles = {
    danger: "border-ais-danger text-ais-danger",
    success: "border-ais-success text-ais-success",
    warning: "border-ais-warning text-ais-warning",
  }[tone];

  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;

  return (
    <div className={`flex items-start gap-3 rounded-ais-sm border bg-ais-panel p-3 ${styles}`}>
      <Icon className="mt-1" aria-hidden="true" size={18} />
      <div>
        <p className="ais-meta">{title}</p>
        <p className="mt-1 text-sm leading-6 text-ais-text">{children}</p>
      </div>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.08em]",
        ok ? "border-ais-success text-ais-success" : "border-ais-warning text-ais-warning",
      ].join(" ")}
    >
      {ok ? <CheckCircle2 aria-hidden="true" size={14} /> : <AlertTriangle aria-hidden="true" size={14} />}
      {label}
    </span>
  );
}

function ActionButton({
  children,
  disabled,
  icon,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "primary" | "danger";
}) {
  const toneClass = {
    default: "border-ais-border-soft bg-ais-panel text-ais-text hover:border-ais-amber",
    primary: "border-ais-amber bg-ais-amber text-ais-bg hover:bg-ais-pale-green",
    danger: "border-ais-danger bg-ais-panel text-ais-danger hover:bg-ais-bg",
  }[tone];

  return (
    <button
      className={`inline-flex items-center gap-2 rounded-ais-sm border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {children}
    </button>
  );
}

function toggleLimited(values: string[], value: string, limit: number) {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }

  if (values.length >= limit) {
    return values;
  }

  return [...values, value];
}

function formatSeconds(value: number | null) {
  return value === null ? "Pending" : `${Number(value).toFixed(3)}s`;
}

function formatBytes(value: number | null) {
  if (!value) {
    return "Pending";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not set";
}

function actionSuccessLabel(status: string) {
  if (status === "published") {
    return "Published.";
  }

  if (status === "archived") {
    return "Archived.";
  }

  if (status === "needs_review") {
    return "Restored to review.";
  }

  return "Action completed.";
}

function errorMessage(error: unknown) {
  if (isApiError(error)) {
    const blockers = error.blockers?.length
      ? ` ${error.blockers.map((blocker) => blocker.message).join(" ")}`
      : "";
    return `${error.message}${blockers}`;
  }

  return error instanceof Error ? error.message : "The action could not be completed.";
}

function isApiError(value: unknown): value is ApiErrorResponse {
  return typeof value === "object" && value !== null && "ok" in value && (value as { ok?: unknown }).ok === false;
}
