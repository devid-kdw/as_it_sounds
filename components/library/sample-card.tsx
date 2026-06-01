"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Download, FolderPlus, Heart, Pause, Play } from "lucide-react";
import { WaveformPreview } from "@/components/player/waveform-preview";
import { sampleDetailRoute } from "@/lib/routes";
import { usePlayerStore } from "@/stores/player-store";
import type { PlayerSurface } from "@/stores/player-store";
import type { SampleCardView } from "@/types/sample";

type SampleCardProps = {
  sample: SampleCardView;
  sourceSurface?: PlayerSurface;
  featured?: boolean;
};

export function SampleCard({ featured = false, sample, sourceSurface = "browse" }: SampleCardProps) {
  const activeSampleId = usePlayerStore((state) => state.activeSampleId);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const setActiveSample = usePlayerStore((state) => state.setActiveSample);
  const play = usePlayerStore((state) => state.play);
  const pause = usePlayerStore((state) => state.pause);
  const seek = usePlayerStore((state) => state.seek);
  const setError = usePlayerStore((state) => state.setError);
  const isActive = activeSampleId === sample.id;

  const activate = () => {
    setActiveSample({
      sampleId: sample.id,
      poeticName: sample.poeticName,
      title: sample.displayTitle,
      previewUrl: sample.previewAssetUrl,
      peaksUrl: sample.waveformPeaksUrl,
      durationSeconds: sample.durationSeconds,
      loopable: sample.loopable,
      sourceSurface,
    });
  };

  const togglePlayback = () => {
    if (!sample.previewAssetUrl) {
      activate();
      setError("Preview audio is missing for this sample.");
      return;
    }

    if (!isActive) {
      activate();
      play();
      return;
    }

    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const scrub = (timeSeconds: number) => {
    if (!isActive) {
      activate();
    }
    seek(timeSeconds);
    if (sample.previewAssetUrl) {
      play();
    } else {
      setError("Preview audio is missing for this sample.");
    }
  };

  return (
    <article
      className={[
        "group grid gap-4 rounded-ais-lg border bg-ais-surface p-4 transition duration-ais-panel",
        featured ? "min-h-[22rem] p-5 sm:p-6" : "",
        isActive ? "border-ais-amber shadow-[0_0_34px_rgba(200,146,74,0.14)]" : "border-ais-border-soft hover:border-ais-moss",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="ais-name block break-words text-3xl leading-tight text-ais-text underline-offset-4 transition duration-ais-base hover:text-ais-pale-green hover:underline"
            href={sampleDetailRoute(sample.poeticName)}
          >
            {sample.displayTitle}
          </Link>
          <p className="ais-slug mt-2 break-words text-xs text-ais-amber">{sample.poeticName}</p>
        </div>
        <button
          aria-label={isActive && isPlaying ? `Pause ${sample.displayTitle}` : `Play ${sample.displayTitle}`}
          className={[
            "grid size-11 shrink-0 place-items-center rounded-full border transition duration-ais-base",
            isActive && isPlaying
              ? "border-ais-amber bg-ais-amber text-ais-bg"
              : "border-ais-border bg-ais-panel text-ais-text hover:border-ais-amber",
          ].join(" ")}
          onClick={togglePlayback}
          type="button"
        >
          {isActive && isPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>
      </div>

      {sample.shortDescription ? (
        <p className="line-clamp-2 min-h-12 leading-6 text-ais-muted">{sample.shortDescription}</p>
      ) : (
        <p className="min-h-12 leading-6 text-ais-faint">No atmospheric description has been written yet.</p>
      )}

      <WaveformPreview
        durationSeconds={sample.durationSeconds}
        onScrub={scrub}
        peaksUrl={sample.waveformPeaksUrl}
        previewUrl={sample.previewAssetUrl}
        sampleId={sample.id}
      />

      <div className="flex flex-wrap gap-2">
        <MetaPill>{sample.sampleType.label}</MetaPill>
        <MetaPill>{sample.category.label}</MetaPill>
        {sample.loopable ? <MetaPill>loopable</MetaPill> : null}
        {sample.bpm ? <MetaPill>{Math.round(sample.bpm)} bpm</MetaPill> : null}
        {sample.musicalKey ? <MetaPill>{sample.musicalKey}</MetaPill> : null}
        {sample.durationSeconds ? <MetaPill>{formatDuration(sample.durationSeconds)}</MetaPill> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ais-border-soft pt-3">
        <div className="flex flex-wrap gap-1.5">
          {sample.moods.slice(0, 3).map((mood) => (
            <span className="ais-meta rounded-full border border-ais-border-soft px-2.5 py-1 text-xs text-ais-moss" key={mood.slug}>
              {mood.label}
            </span>
          ))}
          {sample.moods.length === 0 ? <span className="ais-meta text-xs text-ais-faint">no moods assigned</span> : null}
        </div>
        <div className="flex gap-1">
          <PlaceholderAction active={sample.isFavoritedByCurrentUser} label="Favorite sample">
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
    </article>
  );
}

export function formatDuration(durationSeconds: number | null) {
  if (!durationSeconds || !Number.isFinite(durationSeconds)) {
    return "--:--";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="ais-meta rounded-full border border-ais-border-soft bg-ais-panel px-2.5 py-1 text-xs text-ais-faint">
      {children}
    </span>
  );
}

function PlaceholderAction({
  active = false,
  children,
  label,
}: {
  active?: boolean;
  children: ReactNode;
  label: string;
}) {
  return (
    <button
      aria-label={`${label} placeholder`}
      className={[
        "grid size-9 place-items-center rounded-full border transition duration-ais-base",
        active ? "border-ais-amber text-ais-amber" : "border-ais-border-soft text-ais-muted hover:border-ais-moss hover:text-ais-text",
      ].join(" ")}
      title={`${label} placeholder`}
      type="button"
    >
      {children}
    </button>
  );
}
