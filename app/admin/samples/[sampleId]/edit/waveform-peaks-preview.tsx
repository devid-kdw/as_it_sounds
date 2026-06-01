"use client";

import { useEffect, useRef, useState } from "react";

type WaveformPeaks = {
  data?: unknown;
};

export function WaveformPeaksPreview({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;

    async function drawWaveform() {
      try {
        const response = await fetch(url);
        const payload = (await response.json()) as WaveformPeaks;
        const peaks = Array.isArray(payload.data) ? payload.data.filter((value): value is number => typeof value === "number") : [];

        if (!response.ok || peaks.length === 0) {
          throw new Error("Waveform peaks are missing or invalid.");
        }

        if (canceled) {
          return;
        }

        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");

        if (!canvas || !context) {
          return;
        }

        const width = canvas.clientWidth || 720;
        const height = canvas.clientHeight || 180;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        context.scale(ratio, ratio);
        context.clearRect(0, 0, width, height);
        context.fillStyle = "#d7e4bb";

        const center = height / 2;
        const step = Math.max(1, Math.floor(peaks.length / width));

        for (let x = 0; x < width; x += 1) {
          const value = Math.abs(peaks[x * step] ?? 0);
          const barHeight = Math.max(2, (Math.min(value, 128) / 128) * height);
          context.fillRect(x, center - barHeight / 2, 1, barHeight);
        }

        setError(null);
      } catch {
        if (!canceled) {
          setError("Waveform could not be rendered from generated peaks.");
        }
      }
    }

    drawWaveform();

    return () => {
      canceled = true;
    };
  }, [url]);

  return (
    <div className="grid gap-3">
      <canvas
        aria-label="Generated waveform preview"
        className="h-44 w-full rounded-ais-sm border border-ais-border-soft bg-ais-bg"
        ref={canvasRef}
      />
      {error ? <p className="text-sm text-ais-danger">{error}</p> : null}
    </div>
  );
}
