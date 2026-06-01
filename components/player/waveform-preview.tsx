"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";

type WaveformPreviewProps = {
  sampleId: string;
  peaksUrl: string | null;
  previewUrl: string | null;
  durationSeconds: number | null;
  height?: number;
  onScrub?: (timeSeconds: number) => void;
};

type WaveformPeaks = {
  version?: string;
  sampleRate?: number;
  durationSeconds?: number;
  channels?: number;
  peaks: number[] | number[][];
};

type LoadState = "idle" | "loading" | "ready" | "missing" | "error";

export function WaveformPreview({
  sampleId,
  peaksUrl,
  previewUrl,
  durationSeconds,
  height = 92,
  onScrub,
}: WaveformPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [isNearViewport, setIsNearViewport] = useState(false);
  const activeSampleId = usePlayerStore((state) => state.activeSampleId);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const activeDuration = usePlayerStore((state) => state.durationSeconds);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isActive = activeSampleId === sampleId;
  const effectiveDuration = (isActive ? activeDuration : durationSeconds) ?? durationSeconds ?? 0;
  const progress = isActive && effectiveDuration > 0 ? currentTime / effectiveDuration : 0;
  const normalizedPeaks = useMemo(() => downsamplePeaks(peaks, 180), [peaks]);
  const visibleLoadState: LoadState = !peaksUrl
    ? "missing"
    : loadState === "idle" && isNearViewport
      ? "loading"
      : loadState;

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node || isNearViewport) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isNearViewport]);

  useEffect(() => {
    if (!peaksUrl || !isNearViewport) {
      return;
    }

    let cancelled = false;

    fetchWaveformPeaks(peaksUrl)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setPeaks(payload);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("error");
          setPeaks([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isNearViewport, peaksUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper || normalizedPeaks.length === 0 || visibleLoadState !== "ready") {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const render = () => {
      const rect = wrapper.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width));
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const styles = getComputedStyle(document.documentElement);
      const inactiveColor = styles.getPropertyValue("--ais-moss").trim() || "#8A9A5B";
      const activeColor = styles.getPropertyValue("--ais-amber").trim() || "#C8924A";
      const playheadColor = styles.getPropertyValue("--ais-pale-green").trim() || "#B9C9A2";
      const lineWidth = Math.max(2, width / normalizedPeaks.length - 2);
      const gap = width / normalizedPeaks.length;
      const centerY = height / 2;
      const safeProgress = Math.min(1, Math.max(0, progress));
      const playheadX = width * safeProgress;

      context.lineCap = "round";
      normalizedPeaks.forEach((peak, index) => {
        const x = index * gap + gap / 2;
        const organicOffset = Math.sin(index * 0.72) * 2;
        const amp = Math.max(0.04, Math.min(1, Math.abs(peak)));
        const barHeight = Math.max(6, amp * (height - 18));
        context.beginPath();
        context.strokeStyle = isActive && x <= playheadX ? activeColor : inactiveColor;
        context.globalAlpha = isActive && isPlaying ? 0.94 : 0.72;
        context.lineWidth = lineWidth;
        context.moveTo(x, centerY - barHeight / 2 + organicOffset);
        context.lineTo(x, centerY + barHeight / 2 + organicOffset);
        context.stroke();
      });

      if (isActive) {
        context.globalAlpha = 1;
        context.beginPath();
        context.strokeStyle = playheadColor;
        context.lineWidth = 1;
        context.moveTo(playheadX, 8);
        context.lineTo(playheadX, height - 8);
        context.stroke();
      }
    };

    render();
    const resizeObserver = new ResizeObserver(render);
    resizeObserver.observe(wrapper);
    return () => resizeObserver.disconnect();
  }, [height, isActive, isPlaying, normalizedPeaks, progress, visibleLoadState]);

  const scrub = (clientX: number) => {
    const wrapper = wrapperRef.current;
    if (!wrapper || effectiveDuration <= 0) {
      return;
    }
    const rect = wrapper.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onScrub?.(ratio * effectiveDuration);
  };

  return (
    <div
      className={[
        "relative overflow-hidden rounded-ais-md border bg-ais-panel",
        isActive ? "border-ais-amber shadow-[0_0_28px_rgba(200,146,74,0.12)]" : "border-ais-border-soft",
      ].join(" ")}
      ref={wrapperRef}
    >
      <button
        aria-label="Seek waveform preview"
        className="block w-full cursor-crosshair text-left"
        disabled={visibleLoadState !== "ready" || effectiveDuration <= 0}
        onClick={(event) => scrub(event.clientX)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onScrub?.(Math.max(0, currentTime - 5));
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            onScrub?.(Math.min(effectiveDuration, currentTime + 5));
          }
        }}
        type="button"
      >
        {visibleLoadState === "ready" ? <canvas className="block w-full" ref={canvasRef} /> : null}
        {visibleLoadState === "idle" || visibleLoadState === "loading" ? (
          <div className="ais-shimmer flex items-center justify-center text-sm text-ais-faint" style={{ height }}>
            loading waveform peaks
          </div>
        ) : null}
        {visibleLoadState === "missing" ? <WaveformNotice height={height} label="waveform peaks missing" /> : null}
        {visibleLoadState === "error" ? <WaveformNotice height={height} label="waveform peaks could not be read" /> : null}
      </button>
      {!previewUrl ? (
        <div className="flex items-center gap-2 border-t border-ais-border-soft px-3 py-2 text-xs text-ais-warning">
          <AlertCircle size={14} aria-hidden="true" />
          preview audio missing
        </div>
      ) : null}
    </div>
  );
}

function WaveformNotice({ height, label }: { height: number; label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 text-sm text-ais-warning" style={{ height }}>
      <AlertCircle size={16} aria-hidden="true" />
      {label}
    </div>
  );
}

export async function fetchWaveformPeaks(url: string): Promise<number[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Waveform peaks request failed.");
  }

  const payload = (await response.json()) as WaveformPeaks;
  const peaks = normalizePeaks(payload);

  if (peaks.length === 0) {
    throw new Error("Waveform peaks were empty.");
  }

  return peaks;
}

function normalizePeaks(payload: WaveformPeaks) {
  if (!payload || !Array.isArray(payload.peaks)) {
    return [];
  }

  const raw = payload.peaks;
  const mono = Array.isArray(raw[0])
    ? (raw as number[][]).reduce<number[]>((combined, channel) => {
        channel.forEach((value, index) => {
          combined[index] = Math.max(combined[index] ?? 0, Math.abs(Number(value) || 0));
        });
        return combined;
      }, [])
    : (raw as number[]).map((value) => Math.abs(Number(value) || 0));

  const max = Math.max(...mono, 1);
  return mono.map((value) => value / max);
}

function downsamplePeaks(values: number[], targetLength: number) {
  if (values.length <= targetLength) {
    return values;
  }

  const bucketSize = values.length / targetLength;
  return Array.from({ length: targetLength }, (_, index) => {
    const start = Math.floor(index * bucketSize);
    const end = Math.max(start + 1, Math.floor((index + 1) * bucketSize));
    return Math.max(...values.slice(start, end));
  });
}
