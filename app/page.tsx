import Link from "next/link";
import { ArrowRight, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { SampleCard } from "@/components/library/sample-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getFeaturedSamples } from "@/lib/data/samples";

const moodEntryPoints = ["haunted", "warm", "fragile", "industrial", "distant", "ritual"];

export default async function Home() {
  const featuredSamples = await getFeaturedSamples(3);

  return (
    <div className="grid gap-10 pb-24">
      <section className="flex min-h-[34rem] flex-col items-center justify-center rounded-ais-xl border border-ais-border-soft bg-[var(--ais-overlay)] px-6 py-14 text-center shadow-2xl shadow-black/20 sm:px-12">
        <div className="ais-meta mb-6 inline-flex items-center gap-2 rounded-full border border-ais-border-soft bg-ais-panel px-3 py-1 text-ais-amber">
          <Sparkles size={15} aria-hidden="true" />
          as it sounds
        </div>
        <h1 className="ais-display max-w-5xl text-5xl leading-none text-ais-text sm:text-7xl lg:text-8xl">
          sound samples named the way they feel.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-ais-muted">
          A curated listening library for textures, loops, field recordings, and strange little sound objects.
          Browse by memory, atmosphere, and mood before the metadata speaks.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link
            className="inline-flex items-center gap-2 rounded-ais-sm bg-ais-amber px-5 py-3 font-medium text-ais-bg transition duration-ais-base hover:bg-ais-pale-green"
            href="/browse"
          >
            Browse the library
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-border bg-ais-panel px-5 py-3 text-ais-text transition duration-ais-base hover:border-ais-amber"
            href="/license"
          >
            Licensing promise
          </Link>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="ais-meta text-ais-amber">featured rail</p>
            <h2 className="ais-title mt-2 text-3xl text-ais-text">First sounds from the archive</h2>
          </div>
          <Link className="text-sm text-ais-amber underline-offset-4 hover:underline" href="/browse?sort=featured">
            Open featured
          </Link>
        </div>
        {featuredSamples.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {featuredSamples.map((sample) => (
              <SampleCard featured key={sample.id} sample={sample} sourceSurface="browse" />
            ))}
          </div>
        ) : (
          <EmptyState
            eyebrow="featured samples"
            title="Featured sounds will appear here"
            description="Published samples marked as featured will fill this rail without exposing original WAV assets."
          />
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6">
          <p className="ais-meta text-ais-amber">mood entry points</p>
          <h2 className="ais-title mt-2 text-3xl text-ais-text">Start with atmosphere</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {moodEntryPoints.map((mood) => (
              <Link
                className="ais-meta rounded-full border border-ais-border-soft bg-ais-panel px-4 py-2 text-sm text-ais-moss transition duration-ais-base hover:border-ais-amber hover:text-ais-text"
                href={`/browse?mood=${mood}`}
                key={mood}
              >
                {mood}
              </Link>
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          <div className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6">
            <p className="ais-meta flex items-center gap-2 text-ais-amber">
              <ShieldCheck size={16} aria-hidden="true" />
              licensing
            </p>
            <h2 className="ais-title mt-2 text-2xl text-ais-text">Royalty-free for real projects</h2>
            <p className="mt-3 leading-7 text-ais-muted">
              Use downloaded AIS samples in personal and commercial work. Redistribution as standalone sample packs is not allowed.
            </p>
          </div>
          <div className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6">
            <p className="ais-meta flex items-center gap-2 text-ais-amber">
              <Mail size={16} aria-hidden="true" />
              free launch
            </p>
            <h2 className="ais-title mt-2 text-2xl text-ais-text">Join the first listening window</h2>
            <form className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="launch-email">Email address</label>
              <input className="ais-input" id="launch-email" placeholder="email for launch access" type="email" />
              <button className="rounded-ais-sm border border-ais-amber bg-ais-amber px-4 py-2 font-medium text-ais-bg" type="button">
                Request invite
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
