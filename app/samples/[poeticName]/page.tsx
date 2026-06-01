import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Download, FolderPlus, Heart, ShieldCheck } from "lucide-react";
import { SampleCard, formatDuration } from "@/components/library/sample-card";
import { WaveformPreview } from "@/components/player/waveform-preview";
import { EmptyState } from "@/components/ui/empty-state";
import { getSampleByPoeticName } from "@/lib/data/samples";
import { routes } from "@/lib/routes";

type SampleDetailPageProps = {
  params: Promise<{ poeticName: string }>;
};

export async function generateMetadata({ params }: SampleDetailPageProps) {
  const { poeticName } = await params;
  const sample = await getSampleByPoeticName(poeticName);

  if (!sample) {
    return {
      title: "Sample not found | As It Sounds",
    };
  }

  return {
    title: `${sample.displayTitle} | As It Sounds`,
    description: sample.shortDescription ?? `Listen to ${sample.displayTitle} in the AIS library.`,
  };
}

export default async function SampleDetailPage({ params }: SampleDetailPageProps) {
  const { poeticName } = await params;
  const sample = await getSampleByPoeticName(poeticName);

  if (!sample) {
    notFound();
  }

  return (
    <article className="grid gap-8 pb-24">
      <header className="grid gap-6 rounded-ais-xl border border-ais-border-soft bg-[var(--ais-overlay)] p-6 shadow-2xl shadow-black/20 sm:p-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <p className="ais-meta text-ais-amber">sample detail</p>
          <h1 className="ais-display mt-4 break-words text-5xl leading-none text-ais-text sm:text-7xl">
            {sample.displayTitle}
          </h1>
          <p className="ais-slug mt-4 break-words text-sm text-ais-amber">{sample.poeticName}</p>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-ais-muted">
            {sample.shortDescription ?? "A published AIS sound waiting for its atmospheric note."}
          </p>
        </div>
        <div className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-4">
          <p className="ais-meta text-ais-faint">quiet metadata</p>
          <dl className="mt-4 grid gap-3 text-sm">
            <MetaRow label="type" value={sample.sampleType.label} />
            <MetaRow label="category" value={sample.category.label} />
            <MetaRow label="duration" value={formatDuration(sample.durationSeconds)} />
            {sample.bpm ? <MetaRow label="bpm" value={String(Math.round(sample.bpm))} /> : null}
            {sample.musicalKey ? <MetaRow label="key" value={sample.musicalKey} /> : null}
            <MetaRow label="loopable" value={sample.loopable ? "yes" : "no"} />
          </dl>
        </div>
      </header>

      <section className="grid gap-4 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="ais-meta text-ais-amber">waveform preview</p>
            <h2 className="ais-title mt-2 text-3xl text-ais-text">Listen before the metadata</h2>
          </div>
          <div className="flex gap-2">
            <PlaceholderAction label="Favorite sample">
              <Heart size={16} aria-hidden="true" />
            </PlaceholderAction>
            <PlaceholderAction label="Add to collection">
              <FolderPlus size={16} aria-hidden="true" />
            </PlaceholderAction>
            <PlaceholderAction label="Download sample">
              <Download size={16} aria-hidden="true" />
            </PlaceholderAction>
          </div>
        </div>
        <WaveformPreview
          durationSeconds={sample.durationSeconds}
          height={160}
          peaksUrl={sample.waveformPeaksUrl}
          previewUrl={sample.previewAssetUrl}
          sampleId={sample.id}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-5 sm:p-6">
          <p className="ais-meta text-ais-amber">moods</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {sample.moods.length > 0 ? (
              sample.moods.map((mood) => (
                <Link
                  className="ais-meta rounded-full border border-ais-border-soft bg-ais-panel px-3 py-1.5 text-xs text-ais-moss transition duration-ais-base hover:border-ais-amber hover:text-ais-text"
                  href={`/browse?mood=${encodeURIComponent(mood.slug)}`}
                  key={mood.slug}
                >
                  {mood.label}
                </Link>
              ))
            ) : (
              <p className="text-sm text-ais-faint">No moods are assigned to this published sample.</p>
            )}
          </div>
        </div>
        <div className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-5 sm:p-6">
          <p className="ais-meta flex items-center gap-2 text-ais-amber">
            <ShieldCheck size={16} aria-hidden="true" />
            licensing
          </p>
          <p className="mt-3 leading-7 text-ais-muted">
            Download access is entitlement-gated in a later phase. Public preview playback only uses generated preview audio.
          </p>
        </div>
      </section>

      <section className="grid gap-4">
        <p className="ais-meta text-ais-amber">public card state</p>
        <SampleCard sample={sample} sourceSurface="detail" featured />
      </section>

      <EmptyState
        eyebrow="similar samples"
        title="Similar listening paths arrive in Phase 11"
        description="This placeholder stays visible until similarity scoring and related sample panels are implemented."
      />

      <div>
        <Link className="text-sm text-ais-amber underline-offset-4 hover:underline" href={routes.browse}>
          Back to browse
        </Link>
      </div>
    </article>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ais-border-soft pb-2 last:border-0 last:pb-0">
      <dt className="ais-meta text-xs text-ais-faint">{label}</dt>
      <dd className="text-right text-ais-muted">{value}</dd>
    </div>
  );
}

function PlaceholderAction({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <button
      aria-label={`${label} placeholder`}
      className="grid size-10 place-items-center rounded-full border border-ais-border-soft text-ais-muted transition duration-ais-base hover:border-ais-moss hover:text-ais-text"
      title={`${label} placeholder`}
      type="button"
    >
      {children}
    </button>
  );
}
