"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { primaryMoods } from "@/config/moods";
import { sampleCategories, sampleTypes } from "@/config/categories";
import type { SearchInput, SearchSort, SuggestedCategory } from "@/types/api";

const sortOptions: Array<{ value: SearchSort; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "most_played", label: "Most played" },
  { value: "most_downloaded", label: "Most downloaded" },
  { value: "most_favorited", label: "Most favorited" },
  { value: "featured", label: "Featured" },
  { value: "random_seeded", label: "Wander-sort" },
];

const categoryLabels = new Map([
  ["field_recordings", "Field Recordings"],
  ["loops", "Loops"],
  ["textures", "Textures"],
  ["drones", "Drones"],
  ["percussive", "Percussive"],
  ["one_shots", "One-Shots"],
  ["processed", "Processed"],
]);

const sampleTypeLabels = new Map([
  ["loop", "Loop"],
  ["one_shot", "One-Shot"],
  ["field_recording", "Field Recording"],
  ["texture", "Texture"],
  ["drone", "Drone"],
  ["processed", "Processed"],
]);

type BrowseSearchControlsProps = {
  initialInput: SearchInput;
  suggestedCategories: SuggestedCategory[];
};

export function BrowseSearchControls({ initialInput, suggestedCategories }: BrowseSearchControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialInput.query ?? "");
  const activeMoods = initialInput.moods ?? [];
  const activeCategories = initialInput.categories ?? [];
  const activeTypes = initialInput.sampleTypes ?? [];
  const sort = initialInput.sort ?? (initialInput.query ? "relevance" : "newest");
  const activeChips = activeFilterChips(initialInput);

  const baseParams = useMemo(() => inputToParams(initialInput), [initialInput]);

  useEffect(() => {
    if (query.trim() === (initialInput.query ?? "")) {
      return;
    }

    const handle = window.setTimeout(() => {
      const next = new URLSearchParams(baseParams);
      const cleaned = query.trim();

      if (cleaned.length > 0) {
        next.set("q", cleaned);
      } else {
        next.delete("q");
      }

      next.delete("page");
      pushParams(pathname, next, router, startTransition);
    }, 350);

    return () => window.clearTimeout(handle);
  }, [baseParams, initialInput.query, pathname, query, router, startTransition]);

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(baseParams);

    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    next.delete("page");
    pushParams(pathname, next, router, startTransition);
  };

  const toggleListValue = (key: "mood" | "cat" | "type", value: string) => {
    const current = splitParam(baseParams.get(key));
    const nextValues = current.includes(value) ? withoutToken(current, value) : [...current, value];
    updateParams({ [key]: nextValues.length > 0 ? nextValues.join(",") : null });
  };

  return (
    <section className="grid gap-4 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-4 sm:p-5">
      <div className="grid gap-2">
        <label className="ais-meta text-ais-faint" htmlFor="browse-search">search</label>
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ais-faint" size={18} aria-hidden="true" />
          <input
            className="ais-input pl-10"
            id="browse-search"
            name="q"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search by mood, memory, texture..."
            type="search"
            value={query}
          />
        </span>
      </div>

      <FilterRail label="moods">
        {primaryMoods.map((mood) => (
          <button
            aria-pressed={activeMoods.includes(mood)}
            className={chipClass(activeMoods.includes(mood))}
            key={mood}
            onClick={() => toggleListValue("mood", mood)}
            type="button"
          >
            {mood}
          </button>
        ))}
      </FilterRail>

      <FilterRail label="categories">
        {sampleCategories.map((category) => (
          <button
            aria-pressed={activeCategories.includes(category)}
            className={chipClass(activeCategories.includes(category))}
            key={category}
            onClick={() => toggleListValue("cat", category)}
            type="button"
          >
            {categoryLabels.get(category) ?? category.replaceAll("_", " ")}
          </button>
        ))}
      </FilterRail>

      {suggestedCategories.length > 0 ? (
        <div className="rounded-ais-md border border-ais-border-soft bg-ais-panel p-3">
          <p className="ais-meta flex items-center gap-2 text-ais-amber">
            <Sparkles size={15} aria-hidden="true" />
            mood-category suggestions
          </p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {suggestedCategories.map((category) => (
              <button
                className={chipClass(activeCategories.includes(category.slug))}
                key={category.slug}
                onClick={() => toggleListValue("cat", category.slug)}
                type="button"
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <details className="rounded-ais-md border border-ais-border-soft bg-ais-panel p-3">
        <summary className="ais-meta flex cursor-pointer list-none items-center gap-2 text-ais-faint">
          <SlidersHorizontal size={15} aria-hidden="true" />
          technical filters
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
          <FilterRail compact label="type">
            {sampleTypes.map((type) => (
              <button
                aria-pressed={activeTypes.includes(type)}
                className={chipClass(activeTypes.includes(type))}
                key={type}
                onClick={() => toggleListValue("type", type)}
                type="button"
              >
                {sampleTypeLabels.get(type) ?? type.replaceAll("_", " ")}
              </button>
            ))}
          </FilterRail>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2">
              <span className="ais-meta text-ais-faint">bpm min</span>
              <input
                className="ais-input"
                defaultValue={initialInput.bpmMin ?? ""}
                min={1}
                max={400}
                name="bpm_min"
                onBlur={(event) => updateParams({ bpm_min: event.target.value || null })}
                type="number"
              />
            </label>
            <label className="grid gap-2">
              <span className="ais-meta text-ais-faint">bpm max</span>
              <input
                className="ais-input"
                defaultValue={initialInput.bpmMax ?? ""}
                min={1}
                max={400}
                name="bpm_max"
                onBlur={(event) => updateParams({ bpm_max: event.target.value || null })}
                type="number"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2">
              <span className="ais-meta text-ais-faint">key</span>
              <input
                className="ais-input"
                defaultValue={initialInput.musicalKey ?? ""}
                name="key"
                onBlur={(event) => updateParams({ key: event.target.value || null })}
                placeholder="Cm"
              />
            </label>
            <label className="grid gap-2">
              <span className="ais-meta text-ais-faint">flags</span>
              <select
                className="ais-input"
                defaultValue={initialInput.loopable === true ? "loopable" : initialInput.featuredOnly ? "featured" : ""}
                onChange={(event) => {
                  updateParams({
                    loopable: event.target.value === "loopable" ? "true" : null,
                    featured: event.target.value === "featured" ? "true" : null,
                  });
                }}
              >
                <option value="">Any</option>
                <option value="loopable">Loopable</option>
                <option value="featured">Featured</option>
              </select>
            </label>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-ais-border-soft pt-4">
        <label className="grid min-w-52 gap-2">
          <span className="ais-meta text-ais-faint">sort</span>
          <select className="ais-input" onChange={(event) => updateParams({ sort: event.target.value })} value={sort}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          {isPending ? <span className="ais-meta text-xs text-ais-faint">searching</span> : null}
          <button
            className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-border-soft px-4 py-2 text-sm text-ais-muted transition duration-ais-base hover:border-ais-amber hover:text-ais-text"
            onClick={() => {
              setQuery("");
              pushParams(pathname, new URLSearchParams(), router, startTransition);
            }}
            type="button"
          >
            <X size={15} aria-hidden="true" />
            Clear
          </button>
        </div>
      </div>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Active browse filters">
          {activeChips.map((chip) => (
            <button
              className="ais-meta inline-flex items-center gap-2 rounded-full border border-ais-border-soft bg-ais-panel px-3 py-1.5 text-xs text-ais-amber transition duration-ais-base hover:border-ais-amber"
              key={chip.key}
              onClick={() => updateParams(chip.updates)}
              type="button"
            >
              {chip.label}
              <X size={13} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FilterRail({ children, compact = false, label }: { children: ReactNode; compact?: boolean; label: string }) {
  return (
    <div className="grid gap-2">
      <p className="ais-meta text-ais-faint">{label}</p>
      <div className={compact ? "flex flex-wrap gap-2" : "flex gap-2 overflow-x-auto pb-1"}>{children}</div>
    </div>
  );
}

function chipClass(active: boolean) {
  return [
    "ais-meta whitespace-nowrap rounded-full border px-4 py-2 text-sm transition duration-ais-base",
    active
      ? "border-ais-amber bg-ais-amber text-ais-bg"
      : "border-ais-border-soft bg-ais-bg text-ais-muted hover:border-ais-moss hover:text-ais-text",
  ].join(" ");
}

function inputToParams(input: SearchInput) {
  const params = new URLSearchParams();
  setParam(params, "q", input.query);
  setListParam(params, "mood", input.moods);
  setListParam(params, "cat", input.categories);
  setListParam(params, "type", input.sampleTypes);
  setParam(params, "bpm_min", input.bpmMin);
  setParam(params, "bpm_max", input.bpmMax);
  setParam(params, "key", input.musicalKey);
  setParam(params, "loopable", input.loopable === true ? "true" : null);
  setParam(params, "featured", input.featuredOnly === true ? "true" : null);
  setParam(params, "sort", input.sort);
  setParam(params, "page", input.page && input.page > 1 ? input.page : null);
  setParam(params, "size", input.pageSize);
  setParam(params, "seed", input.seed);
  return params;
}

function splitParam(value: string | null) {
  return value?.split(",").filter(Boolean) ?? [];
}

function withoutToken(tokens: string[], token: string) {
  return tokens.filter((item) => item !== token);
}

function activeFilterChips(input: SearchInput) {
  const chips: Array<{ key: string; label: string; updates: Record<string, string | null> }> = [];
  const moods = input.moods ?? [];
  const categories = input.categories ?? [];
  const types = input.sampleTypes ?? [];
  const defaultSort = input.query ? "relevance" : "newest";

  if (input.query) {
    chips.push({ key: "q", label: `search: ${input.query}`, updates: { q: null } });
  }

  for (const mood of moods) {
    chips.push({
      key: `mood:${mood}`,
      label: `mood: ${mood}`,
      updates: { mood: withoutToken(moods, mood).join(",") || null },
    });
  }

  for (const category of categories) {
    chips.push({
      key: `cat:${category}`,
      label: `category: ${categoryLabels.get(category) ?? category.replaceAll("_", " ")}`,
      updates: { cat: withoutToken(categories, category).join(",") || null },
    });
  }

  for (const type of types) {
    chips.push({
      key: `type:${type}`,
      label: `type: ${sampleTypeLabels.get(type) ?? type.replaceAll("_", " ")}`,
      updates: { type: withoutToken(types, type).join(",") || null },
    });
  }

  if (input.bpmMin || input.bpmMax) {
    chips.push({ key: "bpm", label: `bpm: ${input.bpmMin ?? 1}-${input.bpmMax ?? 400}`, updates: { bpm_min: null, bpm_max: null } });
  }

  if (input.musicalKey) {
    chips.push({ key: "key", label: `key: ${input.musicalKey}`, updates: { key: null } });
  }

  if (input.loopable === true) {
    chips.push({ key: "loopable", label: "loopable", updates: { loopable: null } });
  }

  if (input.featuredOnly === true) {
    chips.push({ key: "featured", label: "featured", updates: { featured: null } });
  }

  if (input.sort && input.sort !== defaultSort) {
    chips.push({ key: "sort", label: `sort: ${input.sort.replaceAll("_", " ")}`, updates: { sort: null } });
  }

  return chips;
}

function setParam(params: URLSearchParams, key: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return;
  }

  params.set(key, String(value));
}

function setListParam(params: URLSearchParams, key: string, values: string[] | null | undefined) {
  if (values && values.length > 0) {
    params.set(key, values.join(","));
  }
}

function pushParams(
  pathname: string,
  params: URLSearchParams,
  router: ReturnType<typeof useRouter>,
  startTransition: ReturnType<typeof useTransition>[1],
) {
  const query = params.toString();
  startTransition(() => {
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  });
}
