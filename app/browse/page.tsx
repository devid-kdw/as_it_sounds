import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BrowseSearchControls } from "@/app/browse/browse-search-controls";
import { SampleGrid } from "@/components/library/sample-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { parseSearchParams, searchSamples, serializeSearchParams } from "@/lib/data/search";
import { getEntitlementForCurrentUser } from "@/lib/entitlement";
import type { SearchInput, SearchSort } from "@/types/api";

type BrowsePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;
  const input = parseSearchParams(params ?? {});
  const [response, entitlement] = await Promise.all([searchSamples(input), getEntitlementForCurrentUser()]);
  const hasActiveSearch = hasVisibleSearchState(response.appliedFilters);

  return (
    <section className="grid gap-6 pb-24">
      <div className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6 sm:p-8">
        <p className="ais-meta text-ais-amber">browse</p>
        <h1 className="ais-display mt-3 text-5xl leading-tight text-ais-text sm:text-6xl">Find the sound by feeling.</h1>
        <p className="mt-4 max-w-3xl leading-7 text-ais-muted">
          Search poetic names, moods, and quiet metadata. The waveform and name stay first; technical filters wait their turn.
        </p>
      </div>

      <BrowseSearchControls initialInput={response.appliedFilters} suggestedCategories={response.suggestedCategories ?? []} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActiveFilters input={response.appliedFilters} />
        <p className="ais-meta text-xs text-ais-faint">
          {response.total === 1 ? "1 published sound" : `${response.total} published sounds`}
        </p>
      </div>

      {response.results.length > 0 ? (
        <SampleGrid entitlement={entitlement} samples={response.results} sourceSurface="browse" />
      ) : (
        <EmptyState
          eyebrow={hasActiveSearch ? "no results" : "empty library"}
          title={hasActiveSearch ? "Nothing matched this path" : "No published samples are ready yet"}
          description={
            hasActiveSearch
              ? "Clear one filter, try a mood instead, or search with a broader atmospheric word."
              : "Published sounds will appear here once the archive opens."
          }
        />
      )}

      <Pagination input={response.appliedFilters} hasMore={response.hasMore} />
    </section>
  );
}

function ActiveFilters({ input }: { input: SearchInput }) {
  const chips = [
    input.query ? `search: ${input.query}` : null,
    ...(input.moods ?? []).map((mood) => `mood: ${mood}`),
    ...(input.categories ?? []).map((category) => `category: ${category.replaceAll("_", " ")}`),
    ...(input.sampleTypes ?? []).map((type) => `type: ${type.replaceAll("_", " ")}`),
    input.bpmMin ? `min: ${input.bpmMin} bpm` : null,
    input.bpmMax ? `max: ${input.bpmMax} bpm` : null,
    input.musicalKey ? `key: ${input.musicalKey}` : null,
    input.loopable ? "loopable" : null,
    input.featuredOnly ? "featured" : null,
    input.sort && input.sort !== defaultSort(input) ? `sort: ${input.sort.replaceAll("_", " ")}` : null,
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

function Pagination({ hasMore, input }: { hasMore: boolean; input: SearchInput }) {
  const currentPage = input.page ?? 1;

  if (currentPage <= 1 && !hasMore) {
    return null;
  }

  return (
    <nav className="flex flex-wrap justify-between gap-3" aria-label="Browse pagination">
      {currentPage > 1 ? (
        <Link
          className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-border-soft px-4 py-2 text-ais-muted transition duration-ais-base hover:border-ais-amber hover:text-ais-text"
          href={browseHref({ ...input, page: currentPage - 1 })}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Previous page
        </Link>
      ) : <span />}
      {hasMore ? (
        <Link
          className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-amber px-4 py-2 text-ais-amber transition duration-ais-base hover:bg-ais-panel"
          href={browseHref({ ...input, page: currentPage + 1 })}
        >
          Next page
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}

function browseHref(input: SearchInput) {
  const params = serializeSearchParams(input);
  return params ? `/browse?${params}` : "/browse";
}

function hasVisibleSearchState(input: SearchInput) {
  return Boolean(
    input.query ||
      input.moods?.length ||
      input.categories?.length ||
      input.sampleTypes?.length ||
      input.bpmMin ||
      input.bpmMax ||
      input.musicalKey ||
      input.loopable ||
      input.featuredOnly,
  );
}

function defaultSort(input: SearchInput): SearchSort {
  return input.query ? "relevance" : "newest";
}
