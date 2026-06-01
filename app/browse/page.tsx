import Link from "next/link";
import type { ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { SampleGrid } from "@/components/library/sample-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { getPublishedSamples } from "@/lib/data/samples";
import type { PublishedSampleSort } from "@/types/sample";

const moods = [
  "melancholic",
  "tense",
  "peaceful",
  "mysterious",
  "euphoric",
  "dark",
  "organic",
  "industrial",
  "fragile",
  "ritual",
  "distant",
  "warm",
  "cold",
  "haunted",
  "intimate",
];

const categories = ["field_recordings", "loops", "textures", "drones", "percussive", "one_shots", "processed"];
const sorts: PublishedSampleSort[] = ["newest", "featured", "oldest", "title", "duration"];

type BrowsePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;
  const query = single(params?.q);
  const mood = single(params?.mood);
  const category = single(params?.category);
  const sort = normalizeSort(single(params?.sort));
  const offset = normalizeOffset(single(params?.offset));
  const result = await getPublishedSamples({
    query,
    moodSlug: mood,
    categorySlug: category,
    sort,
    limit: 24,
    offset,
  });
  const nextOffset = offset + result.limit;
  const prevOffset = Math.max(0, offset - result.limit);

  return (
    <section className="grid gap-6 pb-24">
      <div className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6 sm:p-8">
        <p className="ais-meta text-ais-amber">browse</p>
        <h1 className="ais-display mt-3 text-5xl leading-tight text-ais-text sm:text-6xl">Find the sound by feeling.</h1>
        <p className="mt-4 max-w-3xl leading-7 text-ais-muted">
          Search poetic names, moods, and quiet metadata. The waveform and name stay first; technical filters wait their turn.
        </p>
      </div>

      <form className="grid gap-4 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-4">
        <label className="grid gap-2">
          <span className="ais-meta text-ais-faint">search</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ais-faint" size={18} aria-hidden="true" />
            <input
              className="ais-input pl-10"
              defaultValue={query ?? ""}
              name="q"
              placeholder="search by mood, memory, texture..."
            />
          </span>
        </label>

        <div className="grid gap-2">
          <p className="ais-meta text-ais-faint">mood rail</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {moods.map((moodSlug) => (
              <FilterLink active={mood === moodSlug} href={hrefWith(params, { mood: moodSlug, offset: null })} key={moodSlug}>
                {moodSlug}
              </FilterLink>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <p className="ais-meta text-ais-faint">category rail</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((categorySlug) => (
              <FilterLink
                active={category === categorySlug}
                href={hrefWith(params, { category: categorySlug, offset: null })}
                key={categorySlug}
              >
                {categorySlug.replaceAll("_", " ")}
              </FilterLink>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-ais-border-soft pt-4">
          <label className="grid min-w-48 gap-2">
            <span className="ais-meta flex items-center gap-2 text-ais-faint">
              <SlidersHorizontal size={15} aria-hidden="true" />
              sort
            </span>
            <select className="ais-input" defaultValue={sort} name="sort">
              {sorts.map((sortValue) => (
                <option key={sortValue} value={sortValue}>{sortValue}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Link className="rounded-ais-sm border border-ais-border-soft px-4 py-2 text-sm text-ais-muted" href="/browse">
              Clear
            </Link>
            <button className="rounded-ais-sm border border-ais-amber bg-ais-amber px-4 py-2 font-medium text-ais-bg" type="submit">
              Apply
            </button>
          </div>
        </div>
      </form>

      <ActiveFilters query={query} mood={mood} category={category} sort={sort} />

      {result.items.length > 0 ? (
        <SampleGrid samples={result.items} sourceSurface="browse" />
      ) : (
        <EmptyState
          eyebrow="no results"
          title="No published samples match this path"
          description="Try clearing the search text, changing mood, or stepping out of the selected category."
        />
      )}

      <nav className="flex flex-wrap justify-between gap-3" aria-label="Browse pagination">
        {offset > 0 ? (
          <Link className="rounded-ais-sm border border-ais-border-soft px-4 py-2 text-ais-muted" href={hrefWith(params, { offset: String(prevOffset) })}>
            Previous page
          </Link>
        ) : <span />}
        {result.hasMore ? (
          <Link className="rounded-ais-sm border border-ais-amber px-4 py-2 text-ais-amber" href={hrefWith(params, { offset: String(nextOffset) })}>
            Next page
          </Link>
        ) : null}
      </nav>
    </section>
  );
}

function ActiveFilters({
  category,
  mood,
  query,
  sort,
}: {
  category: string | null;
  mood: string | null;
  query: string | null;
  sort: PublishedSampleSort;
}) {
  const chips = [
    query ? `search: ${query}` : null,
    mood ? `mood: ${mood}` : null,
    category ? `category: ${category.replaceAll("_", " ")}` : null,
    sort !== "newest" ? `sort: ${sort}` : null,
  ].filter(Boolean);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span className="ais-meta rounded-full border border-ais-border-soft bg-ais-panel px-3 py-1 text-xs text-ais-amber" key={chip}>
          {chip}
        </span>
      ))}
    </div>
  );
}

function FilterLink({ active, children, href }: { active: boolean; children: ReactNode; href: string }) {
  return (
    <Link
      className={[
        "ais-meta whitespace-nowrap rounded-full border px-4 py-2 text-sm transition duration-ais-base",
        active
          ? "border-ais-amber bg-ais-amber text-ais-bg"
          : "border-ais-border-soft bg-ais-panel text-ais-muted hover:border-ais-moss hover:text-ais-text",
      ].join(" ")}
      href={href}
    >
      {children}
    </Link>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeSort(value: string | null): PublishedSampleSort {
  return sorts.includes(value as PublishedSampleSort) ? (value as PublishedSampleSort) : "newest";
}

function normalizeOffset(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function hrefWith(
  params: Record<string, string | string[] | undefined> | undefined,
  updates: Record<string, string | null>,
) {
  const url = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    const singleValue = single(value);
    if (singleValue) {
      url.set(key, singleValue);
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      url.delete(key);
    } else {
      url.set(key, value);
    }
  }
  const query = url.toString();
  return query ? `/browse?${query}` : "/browse";
}
