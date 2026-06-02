"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Download, FolderPlus, Heart, Pause, Play, Repeat, Volume2 } from "lucide-react";
import { formatDuration } from "@/components/library/sample-card";
import { WaveformPreview } from "@/components/player/waveform-preview";
import { usePlayerStore } from "@/stores/player-store";
import type { PlayerSurface } from "@/stores/player-store";

const SOURCE_LABELS = {
  "admin-preview": "from Admin preview",
  browse: "from Browse",
  collection: "from Collection",
  detail: "from Detail",
  wander: "from Wander",
} as const;

export function PersistentPlayerShell() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedSampleIdRef = useRef<string | null>(null);
  const loggedPreviewStartRef = useRef<string | null>(null);
  const lastTimeUpdateRef = useRef(0);
  const activeSampleId = usePlayerStore((state) => state.activeSampleId);
  const activePoeticName = usePlayerStore((state) => state.activePoeticName);
  const activeTitle = usePlayerStore((state) => state.activeTitle);
  const activePreviewUrl = usePlayerStore((state) => state.activePreviewUrl);
  const activePeaksUrl = usePlayerStore((state) => state.activePeaksUrl);
  const activeLoopable = usePlayerStore((state) => state.activeLoopable);
  const durationSeconds = usePlayerStore((state) => state.durationSeconds);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isLoading = usePlayerStore((state) => state.isLoading);
  const isLooping = usePlayerStore((state) => state.isLooping);
  const volume = usePlayerStore((state) => state.volume);
  const error = usePlayerStore((state) => state.error);
  const sourceSurface = usePlayerStore((state) => state.sourceSurface);
  const play = usePlayerStore((state) => state.play);
  const pause = usePlayerStore((state) => state.pause);
  const seek = usePlayerStore((state) => state.seek);
  const setCurrentTime = usePlayerStore((state) => state.setCurrentTime);
  const setLoading = usePlayerStore((state) => state.setLoading);
  const setLooping = usePlayerStore((state) => state.setLooping);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const setError = usePlayerStore((state) => state.setError);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (loadedSampleIdRef.current && loadedSampleIdRef.current !== activeSampleId) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      loadedSampleIdRef.current = null;
      loggedPreviewStartRef.current = null;
    }
  }, [activeSampleId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.loop = Boolean(activeLoopable && isLooping);
    }
  }, [activeLoopable, isLooping]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeSampleId) {
      return;
    }

    if (!isPlaying) {
      audio.pause();
      setLoading(false);
      return;
    }

    if (!activePreviewUrl) {
      setError("Preview audio is missing for the current sample.");
      return;
    }

    if (loadedSampleIdRef.current !== activeSampleId || audio.currentSrc !== activePreviewUrl) {
      audio.pause();
      audio.src = activePreviewUrl;
      audio.load();
      loadedSampleIdRef.current = activeSampleId;
    }

    setLoading(true);
    audio
      .play()
      .then(() => setLoading(false))
      .catch(() => setError("Preview audio could not be played."));
  }, [activePreviewUrl, activeSampleId, isPlaying, setError, setLoading, sourceSurface]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeSampleId || !Number.isFinite(currentTime)) {
      return;
    }

    if (Math.abs(audio.currentTime - currentTime) > 0.45) {
      audio.currentTime = Math.max(0, currentTime);
    }
  }, [activeSampleId, currentTime]);

  const hasActiveSample = Boolean(activeSampleId && activeTitle);
  const duration = durationSeconds ?? 0;

  return (
    <aside
      className={[
        "border-t border-ais-border bg-[var(--ais-overlay)] px-4 py-3 backdrop-blur sm:px-6 lg:px-8",
        hasActiveSample ? "fixed inset-x-0 bottom-0 z-40" : "",
      ].join(" ")}
    >
      <audio
        hidden
        onCanPlay={() => setLoading(false)}
        onEnded={(event) => {
          if (activeSampleId && loggedPreviewStartRef.current !== activeSampleId) {
            loggedPreviewStartRef.current = activeSampleId;
            logPlayEvent({
              completed: true,
              eventType: "ended",
              sampleId: activeSampleId,
              secondsPlayed: event.currentTarget.currentTime,
              sourceSurface,
            });
            logWanderPlayedEvent(activeSampleId, sourceSurface);
          }

          if (!isLooping) {
            pause();
            setCurrentTime(0);
          }
        }}
        onError={() => setError("Preview audio could not be loaded.")}
        onTimeUpdate={(event) => {
          const now = performance.now();
          if (now - lastTimeUpdateRef.current < 66) {
            return;
          }
          lastTimeUpdateRef.current = now;
          const nextTime = event.currentTarget.currentTime;
          setCurrentTime(nextTime);

          if (
            activeSampleId &&
            activePreviewUrl &&
            loggedPreviewStartRef.current !== activeSampleId &&
            nextTime >= meaningfulPlayThreshold(durationSeconds)
          ) {
            loggedPreviewStartRef.current = activeSampleId;
            logPlayEvent({
              completed: false,
              eventType: "preview_start",
              sampleId: activeSampleId,
              secondsPlayed: nextTime,
              sourceSurface,
            });
            logWanderPlayedEvent(activeSampleId, sourceSurface);
          }
        }}
        preload="none"
        ref={audioRef}
      />

      <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-[minmax(14rem,1fr)_minmax(18rem,34rem)_auto] lg:items-center">
        <div className="min-w-0">
          <p className="ais-meta text-xs text-ais-faint">
            {sourceSurface ? SOURCE_LABELS[sourceSurface] : "player"}
          </p>
          <p className="truncate text-sm font-medium text-ais-text">{hasActiveSample ? activeTitle : "No preview selected."}</p>
          {activePoeticName ? <p className="ais-slug truncate text-xs text-ais-amber">{activePoeticName}</p> : null}
          {error ? <p className="mt-1 text-xs text-ais-warning">{error}</p> : null}
        </div>

        <div className="grid gap-2">
          {hasActiveSample ? (
            <WaveformPreview
              durationSeconds={durationSeconds}
              height={44}
              onScrub={seek}
              peaksUrl={activePeaksUrl}
              previewUrl={activePreviewUrl}
              sampleId={activeSampleId as string}
            />
          ) : (
            <div className="h-11 rounded-ais-md border border-ais-border-soft bg-ais-panel" aria-hidden="true" />
          )}
          <label className="grid gap-1">
            <span className="sr-only">Seek current preview</span>
            <input
              aria-label="Seek current preview"
              className="accent-[var(--ais-amber)]"
              disabled={!hasActiveSample || duration <= 0}
              max={Math.max(duration, 1)}
              min={0}
              onChange={(event) => seek(Number(event.target.value))}
              step={0.05}
              type="range"
              value={Math.min(currentTime, Math.max(duration, 1))}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button
            aria-label={isPlaying ? "Pause current preview" : "Play current preview"}
            className="grid size-10 place-items-center rounded-full border border-ais-amber bg-ais-amber text-ais-bg disabled:border-ais-border disabled:bg-ais-panel disabled:text-ais-faint"
            disabled={!hasActiveSample}
            onClick={() => (isPlaying ? pause() : play())}
            type="button"
          >
            {isPlaying ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
          </button>
          <button
            aria-label="Loop current preview"
            aria-pressed={isLooping}
            className={[
              "grid size-10 place-items-center rounded-full border transition duration-ais-base disabled:opacity-45",
              isLooping ? "border-ais-amber text-ais-amber" : "border-ais-border-soft text-ais-muted hover:border-ais-moss",
            ].join(" ")}
            disabled={!activeLoopable}
            onClick={() => setLooping(!isLooping)}
            type="button"
          >
            <Repeat size={16} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2 rounded-full border border-ais-border-soft px-3 py-2 text-ais-muted">
            <Volume2 size={15} aria-hidden="true" />
            <label className="sr-only" htmlFor="ais-player-volume">
              Volume
            </label>
            <input
              aria-label="Volume"
              className="w-20 accent-[var(--ais-amber)]"
              id="ais-player-volume"
              max={1}
              min={0}
              onChange={(event) => setVolume(Number(event.target.value))}
              step={0.01}
              type="range"
              value={volume}
            />
          </div>
          <span className="ais-meta min-w-20 text-xs text-ais-faint">
            {isLoading ? "loading" : `${formatDuration(currentTime)} / ${formatDuration(durationSeconds)}`}
          </span>
          <MiniPlaceholderAction label="Favorite current sample">
            <Heart size={15} aria-hidden="true" />
          </MiniPlaceholderAction>
          <MiniPlaceholderAction label="Add current sample to collection">
            <FolderPlus size={15} aria-hidden="true" />
          </MiniPlaceholderAction>
          <MiniPlaceholderAction label="Download current sample">
            <Download size={15} aria-hidden="true" />
          </MiniPlaceholderAction>
        </div>
      </div>
    </aside>
  );
}

function MiniPlaceholderAction({ children, label }: { children: ReactNode; label: string }) {
  return (
    <button
      aria-label={`${label} placeholder`}
      className="grid size-9 place-items-center rounded-full border border-ais-border-soft text-ais-muted transition duration-ais-base hover:border-ais-moss hover:text-ais-text"
      title={`${label} placeholder`}
      type="button"
    >
      {children}
    </button>
  );
}

function logPlayEvent({
  completed,
  eventType,
  sampleId,
  secondsPlayed,
  sourceSurface,
}: {
  completed?: boolean;
  eventType: "preview_start" | "ended";
  sampleId: string;
  secondsPlayed?: number;
  sourceSurface: PlayerSurface | null;
}) {
  const body = JSON.stringify({
    completed: completed ?? null,
    eventType,
    sampleId,
    secondsPlayed: secondsPlayed ?? null,
    source: "web",
    sourceSurface,
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/play-events", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/play-events", {
    body,
    headers: {
      "content-type": "application/json",
    },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined);
}

function logWanderPlayedEvent(sampleId: string, sourceSurface: PlayerSurface | null) {
  if (sourceSurface !== "wander") {
    return;
  }

  const body = JSON.stringify({
    action: "played",
    sampleId,
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/wander/events", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/wander/events", {
    body,
    headers: {
      "content-type": "application/json",
    },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined);
}

function meaningfulPlayThreshold(durationSeconds: number | null) {
  if (durationSeconds && durationSeconds > 0) {
    return Math.min(2, durationSeconds * 0.2);
  }

  return 2;
}
