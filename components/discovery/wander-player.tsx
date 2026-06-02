"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { RefreshCw, Shuffle, SkipForward } from "lucide-react";
import { SampleCard } from "@/components/library/sample-card";
import type { SampleActionEntitlement } from "@/components/sample-actions/sample-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { primaryMoods } from "@/config/moods";
import { usePlayerStore } from "@/stores/player-store";
import type { SearchResponse, SearchSampleResult } from "@/types/api";

type WanderPlayerProps = {
  entitlement: SampleActionEntitlement;
};

const WANDER_QUEUE_LIMIT = 3;
const WANDER_EXCLUSION_LIMIT = 20;

export function WanderPlayer({ entitlement }: WanderPlayerProps) {
  const recentlyPlayedIds = usePlayerStore((state) => state.recentlyPlayedIds);
  const [samples, setSamples] = useState<SearchSampleResult[]>([]);
  const [activeMood, setActiveMood] = useState<string | null>(null);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestKeyRef = useRef(0);

  const exclusionIds = useMemo(
    () => uniqueBounded([...skippedIds, ...recentlyPlayedIds], WANDER_EXCLUSION_LIMIT),
    [recentlyPlayedIds, skippedIds],
  );

  const loadWander = useCallback(
    async (options: { mood?: string | null; exclude?: string[] } = {}) => {
      const requestKey = requestKeyRef.current + 1;
      requestKeyRef.current = requestKey;
      const nextMood = options.mood === undefined ? activeMood : options.mood;
      const nextExclude = uniqueBounded(options.exclude ?? exclusionIds, WANDER_EXCLUSION_LIMIT);
      const params = new URLSearchParams({
        limit: String(WANDER_QUEUE_LIMIT),
        source: "web",
      });

      if (nextMood) {
        params.set("mood", nextMood);
      }

      if (nextExclude.length > 0) {
        params.set("exclude", nextExclude.join(","));
      }

      setStatus("loading");
      setMessage(null);

      try {
        const response = await fetch(`/api/wander?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as SearchResponse & {
          error?: { message?: string };
        };

        if (!response.ok) {
          throw new Error(payload.error?.message ?? "Wander could not draw a sound right now.");
        }

        if (requestKeyRef.current !== requestKey) {
          return;
        }

        setSamples(payload.results ?? []);
        setStatus((payload.results ?? []).length > 0 ? "idle" : "empty");
      } catch (error) {
        if (requestKeyRef.current !== requestKey) {
          return;
        }

        setSamples([]);
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Wander could not draw a sound right now.");
      }
    },
    [activeMood, exclusionIds],
  );

  useEffect(() => {
    logWanderEvent({ action: "started" });
    const initialDraw = window.setTimeout(() => {
      void loadWander({ exclude: exclusionIds });
    }, 0);

    return () => window.clearTimeout(initialDraw);
    // The initial draw should happen once; subsequent draw actions pass fresh exclusions explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function drawWithMood(mood: string | null) {
    setActiveMood(mood);
    startTransition(() => {
      void loadWander({ mood, exclude: exclusionIds });
    });
  }

  function skipPrimary() {
    const primary = samples[0];

    if (!primary) {
      startTransition(() => {
        void loadWander({ exclude: exclusionIds });
      });
      return;
    }

    const nextSkipped = uniqueBounded([primary.id, ...skippedIds], WANDER_EXCLUSION_LIMIT);
    setSkippedIds(nextSkipped);
    logWanderEvent({ action: "skipped", moodSlug: activeMood, sampleId: primary.id });

    if (samples.length > 1) {
      setSamples(samples.slice(1));
    }

    startTransition(() => {
      void loadWander({ exclude: uniqueBounded([...nextSkipped, ...recentlyPlayedIds], WANDER_EXCLUSION_LIMIT) });
    });
  }

  const primary = samples[0] ?? null;
  const queued = samples.slice(1);
  const loading = status === "loading" || isPending;

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-ais-lg border border-ais-border-soft bg-[var(--ais-overlay)] p-5 shadow-2xl shadow-black/15 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="ais-meta text-ais-amber">mood constellation</p>
            <p className="mt-2 text-sm text-ais-muted">
              {activeMood ? `wandering through: ${activeMood}` : "wandering without a mood bias"}
            </p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm text-ais-muted transition duration-ais-base hover:border-ais-amber hover:text-ais-text disabled:opacity-60"
            disabled={loading}
            onClick={() => drawWithMood(activeMood)}
            type="button"
          >
            <RefreshCw size={15} aria-hidden="true" />
            redraw
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {primaryMoods.map((mood, index) => {
            const active = activeMood === mood;

            return (
              <button
                aria-pressed={active}
                className={[
                  "ais-meta min-h-12 rounded-full border px-3 py-2 text-xs transition duration-ais-base",
                  active
                    ? "border-ais-amber bg-ais-amber text-ais-bg"
                    : "border-ais-border-soft bg-ais-panel text-ais-moss hover:border-ais-amber hover:text-ais-text",
                  index % 5 === 1 ? "lg:translate-y-2" : "",
                  index % 5 === 3 ? "lg:-translate-y-1" : "",
                ].join(" ")}
                disabled={loading}
                key={mood}
                onClick={() => drawWithMood(active ? null : mood)}
                type="button"
              >
                {mood}
              </button>
            );
          })}
        </div>
      </section>

      {primary ? (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="ais-meta text-ais-amber">current draw</p>
                <h2 className="ais-title mt-1 text-3xl text-ais-text">Stay with this one, or pass it on.</h2>
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-ais-amber bg-ais-amber px-4 py-2 text-sm font-medium text-ais-bg transition duration-ais-base hover:bg-ais-pale-green disabled:opacity-60"
                disabled={loading}
                onClick={skipPrimary}
                type="button"
              >
                <SkipForward size={16} aria-hidden="true" />
                skip
              </button>
            </div>
            <SampleCard entitlement={entitlement} featured sample={primary} sourceSurface="wander" />
          </div>

          <aside className="grid content-start gap-3">
            <p className="ais-meta flex items-center gap-2 text-ais-amber">
              <Shuffle size={15} aria-hidden="true" />
              nearby queue
            </p>
            {queued.length > 0 ? (
              queued.map((sample) => (
                <SampleCard entitlement={entitlement} key={sample.id} sample={sample} sourceSurface="wander" />
              ))
            ) : (
              <p className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-4 text-sm leading-6 text-ais-faint">
                The next draw will appear after this one leaves the path.
              </p>
            )}
          </aside>
        </section>
      ) : (
        <EmptyState
          eyebrow={status === "error" ? "wander unavailable" : "empty path"}
          title={status === "error" ? "Wander could not draw a sample" : "No Wander candidates are published yet"}
          description={
            message ??
            "Published samples that match the current mood bias will appear here. Wander will not use unpublished fallbacks."
          }
        />
      )}
    </div>
  );
}

function uniqueBounded(ids: string[], limit: number) {
  const seen = new Set<string>();
  const safeIds: string[] = [];

  for (const id of ids) {
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    safeIds.push(id);

    if (safeIds.length >= limit) {
      break;
    }
  }

  return safeIds;
}

export function logWanderEvent({
  action,
  moodSlug,
  sampleId,
}: {
  action: "started" | "skipped" | "played" | "favorited" | "downloaded";
  moodSlug?: string | null;
  sampleId?: string | null;
}) {
  const body = JSON.stringify({
    action,
    moodSlug: moodSlug ?? null,
    sampleId: sampleId ?? null,
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
