"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { sampleDetailRoute } from "@/lib/routes";
import type { SampleActionEntitlement } from "@/components/sample-actions/sample-actions";

type CollectionItemView = {
  sampleId: string;
  sortOrder: number;
  addedAt: string;
  sample: {
    id: string;
    poeticName: string;
    displayTitle: string;
    shortDescription: string | null;
    categorySlug: string;
    sampleTypeSlug: string;
    bpm: number | null;
    musicalKey: string | null;
    durationSeconds: number | null;
    loopable: boolean;
  } | null;
};

type PrivateCollectionView = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  items: CollectionItemView[];
};

type CollectionQueryRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  collection_items?: CollectionItemQueryRow[] | null;
};

type CollectionItemQueryRow = {
  sample_id: string;
  sort_order: number;
  added_at: string;
  samples?: SampleQueryRow | SampleQueryRow[] | null;
};

type SampleQueryRow = {
  id: string;
  poetic_name: string;
  display_title: string;
  short_description: string | null;
  category_slug: string;
  sample_type_slug: string;
  bpm: number | string | null;
  musical_key: string | null;
  duration_seconds: number | string | null;
  loopable: boolean;
  status?: string | null;
};

type WorkspaceMessage = {
  tone: "success" | "warning" | "error";
  text: string;
};

type CollectionsWorkspaceProps = {
  entitlement: SampleActionEntitlement;
};

export function CollectionsWorkspace({ entitlement }: CollectionsWorkspaceProps) {
  const [collections, setCollections] = useState<PrivateCollectionView[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<WorkspaceMessage | null>(null);
  const [isLoading, setIsLoading] = useState(entitlement.isAuthenticated);
  const [isCreating, startCreateTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const activeCollection = useMemo(
    () => collections.find((collection) => collection.id === activeCollectionId) ?? collections[0] ?? null,
    [activeCollectionId, collections],
  );

  useEffect(() => {
    if (!entitlement.isAuthenticated) {
      return;
    }

    let cancelled = false;

    async function loadCollections() {
      setIsLoading(true);
      setMessage(null);

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("collections")
          .select(
            "id,name,description,created_at,updated_at,collection_items(sample_id,sort_order,added_at,samples(id,poetic_name,display_title,short_description,category_slug,sample_type_slug,bpm,musical_key,duration_seconds,loopable,status))",
          )
          .eq("visibility", "private")
          .order("updated_at", { ascending: false });

        if (error) {
          throw error;
        }

        if (cancelled) {
          return;
        }

        const nextCollections = ((data ?? []) as CollectionQueryRow[]).map(mapCollectionRow);
        setCollections(nextCollections);
        setActiveCollectionId((current) => current ?? nextCollections[0]?.id ?? null);
      } catch {
        if (!cancelled) {
          setMessage({ tone: "error", text: "Unable to load your private collections." });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadCollections();

    return () => {
      cancelled = true;
    };
  }, [entitlement.isAuthenticated]);

  function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const safeName = name.trim();

    if (!safeName) {
      setMessage({ tone: "warning", text: "Name the collection first." });
      return;
    }

    startCreateTransition(async () => {
      setMessage(null);

      try {
        const response = await fetch("/api/collections", {
          body: JSON.stringify({
            description: description.trim() || null,
            name: safeName,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const payload = await readApiJson(response);

        if (!response.ok || !isCollectionPayload(payload)) {
          throw new Error(apiMessage(payload, "Could not create that private collection."));
        }

        const data = payload.data;
        const created: PrivateCollectionView = {
          id: data.id,
          name: data.name,
          description: data.description,
          createdAt: data.createdAt ?? data.created_at ?? new Date().toISOString(),
          updatedAt: data.updatedAt ?? data.updated_at ?? new Date().toISOString(),
          items: [],
        };
        setCollections((current) => [created, ...current]);
        setActiveCollectionId(created.id);
        setName("");
        setDescription("");
        setMessage({ tone: "success", text: "Private collection created." });
      } catch {
        setMessage({ tone: "error", text: "Could not create that private collection." });
      }
    });
  }

  async function removeItem(collectionId: string, sampleId: string) {
    const previous = collections;
    setPendingKey(`remove:${sampleId}`);
    setCollections((current) =>
      current.map((collection) =>
        collection.id === collectionId
          ? { ...collection, items: collection.items.filter((item) => item.sampleId !== sampleId) }
          : collection,
      ),
    );
    setMessage(null);

    try {
      const response = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(sampleId)}`, {
        method: "DELETE",
      });
      const payload = await readApiJson(response);

      if (!response.ok) {
        throw new Error(apiMessage(payload, "Could not remove that item."));
      }

      setMessage({ tone: "success", text: "Removed from collection." });
    } catch {
      setCollections(previous);
      setMessage({ tone: "error", text: "Could not remove that item. The change was reverted." });
    } finally {
      setPendingKey(null);
    }
  }

  async function moveItem(collectionId: string, sampleId: string, direction: "up" | "down") {
    const collection = collections.find((item) => item.id === collectionId);

    if (!collection) {
      return;
    }

    const currentIndex = collection.items.findIndex((item) => item.sampleId === sampleId);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= collection.items.length) {
      return;
    }

    const previous = collections;
    const reorderedItems = [...collection.items];
    const currentItem = reorderedItems[currentIndex];
    const nextItem = reorderedItems[nextIndex];
    reorderedItems[currentIndex] = { ...nextItem, sortOrder: currentIndex };
    reorderedItems[nextIndex] = { ...currentItem, sortOrder: nextIndex };

    setPendingKey(`move:${sampleId}`);
    setCollections((current) =>
      current.map((item) => (item.id === collectionId ? { ...item, items: reorderedItems } : item)),
    );
    setMessage(null);

    try {
      const response = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/items/reorder`, {
        body: JSON.stringify({ sampleIds: reorderedItems.map((item) => item.sampleId) }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = await readApiJson(response);

      if (!response.ok) {
        throw new Error(apiMessage(payload, "Could not reorder the collection."));
      }

      setMessage({ tone: "success", text: "Collection order updated." });
    } catch {
      setCollections(previous);
      setMessage({ tone: "error", text: "Could not reorder the collection. The change was reverted." });
    } finally {
      setPendingKey(null);
    }
  }

  async function deleteCollection(collectionId: string) {
    const previous = collections;
    const collection = collections.find((item) => item.id === collectionId);
    setPendingKey(`delete:${collectionId}`);
    setCollections((current) => current.filter((item) => item.id !== collectionId));
    setActiveCollectionId((current) => (current === collectionId ? null : current));
    setMessage(null);

    try {
      const response = await fetch(`/api/collections/${encodeURIComponent(collectionId)}`, {
        method: "DELETE",
      });
      const payload = await readApiJson(response);

      if (!response.ok) {
        throw new Error(apiMessage(payload, "Could not delete that collection."));
      }

      setMessage({ tone: "success", text: collection ? `${collection.name} deleted.` : "Collection deleted." });
    } catch {
      setCollections(previous);
      setActiveCollectionId(collectionId);
      setMessage({ tone: "error", text: "Could not delete that collection. The change was reverted." });
    } finally {
      setPendingKey(null);
    }
  }

  if (!entitlement.isAuthenticated) {
    return (
      <section className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6">
        <p className="ais-meta text-ais-amber">login required</p>
        <h2 className="ais-title mt-2 text-3xl text-ais-text">Private collections need an AIS identity</h2>
        <p className="mt-3 max-w-2xl leading-7 text-ais-muted">
          Favorites and collections are stored in your own Supabase-backed library, protected by row-level security.
        </p>
        <Link
          className="mt-5 inline-flex items-center rounded-ais-sm border border-ais-amber bg-ais-amber px-4 py-2 font-medium text-ais-bg transition duration-ais-base hover:bg-ais-pale-green"
          href="/login"
        >
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-4">
        <form className="grid gap-3 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-4" onSubmit={createCollection}>
          <p className="ais-meta text-ais-amber">new collection</p>
          <input
            className="ais-input"
            maxLength={90}
            onChange={(event) => setName(event.target.value)}
            placeholder="warm broken loops"
            value={name}
          />
          <textarea
            className="ais-input min-h-20 resize-y"
            maxLength={220}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="private note"
            value={description}
          />
          <button
            className="inline-flex items-center justify-center gap-2 rounded-ais-sm border border-ais-amber bg-ais-amber px-4 py-2 text-sm font-medium text-ais-bg transition duration-ais-base hover:bg-ais-pale-green disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isCreating}
            type="submit"
          >
            {isCreating ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            Create
          </button>
        </form>

        <div className="grid gap-2">
          {isLoading ? (
            <p className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-2 text-sm text-ais-muted">Loading private collections</p>
          ) : collections.length > 0 ? (
            collections.map((collection) => (
              <button
                className={[
                  "rounded-ais-sm border px-3 py-3 text-left transition duration-ais-base",
                  activeCollection?.id === collection.id
                    ? "border-ais-amber bg-ais-surface text-ais-text"
                    : "border-ais-border-soft bg-ais-panel text-ais-muted hover:border-ais-moss hover:text-ais-text",
                ].join(" ")}
                key={collection.id}
                onClick={() => setActiveCollectionId(collection.id)}
                type="button"
              >
                <span className="block truncate text-sm font-medium">{collection.name}</span>
                <span className="ais-meta mt-1 block text-xs text-ais-faint">
                  {collection.items.length === 1 ? "1 sound" : `${collection.items.length} sounds`}
                </span>
              </button>
            ))
          ) : (
            <p className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-3 text-sm leading-6 text-ais-muted">
              No collections yet. Create one, then add sounds from browse or detail pages.
            </p>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        {activeCollection ? (
          <div className="grid gap-4">
            <header className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="ais-meta text-ais-amber">private</p>
                  <h2 className="ais-title mt-2 break-words text-4xl text-ais-text">{activeCollection.name}</h2>
                  {activeCollection.description ? (
                    <p className="mt-3 max-w-2xl leading-7 text-ais-muted">{activeCollection.description}</p>
                  ) : null}
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-danger px-3 py-2 text-sm text-ais-danger transition duration-ais-base hover:bg-ais-panel disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={pendingKey === `delete:${activeCollection.id}`}
                  onClick={() => void deleteCollection(activeCollection.id)}
                  type="button"
                >
                  {pendingKey === `delete:${activeCollection.id}` ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
                  Delete
                </button>
              </div>
            </header>

            {activeCollection.items.length > 0 ? (
              <ol className="grid gap-3">
                {activeCollection.items.map((item, index) => (
                  <li className="rounded-ais-md border border-ais-border-soft bg-ais-surface p-4" key={item.sampleId}>
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        {item.sample ? (
                          <>
                            <Link
                              className="ais-name block break-words text-2xl leading-tight text-ais-text underline-offset-4 transition duration-ais-base hover:text-ais-pale-green hover:underline"
                              href={sampleDetailRoute(item.sample.poeticName)}
                            >
                              {item.sample.displayTitle}
                            </Link>
                            <p className="ais-slug mt-1 break-words text-xs text-ais-amber">{item.sample.poeticName}</p>
                            {item.sample.shortDescription ? (
                              <p className="mt-3 line-clamp-2 leading-6 text-ais-muted">{item.sample.shortDescription}</p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <MetaPill>{item.sample.sampleTypeSlug.replaceAll("_", " ")}</MetaPill>
                              <MetaPill>{item.sample.categorySlug.replaceAll("_", " ")}</MetaPill>
                              {item.sample.loopable ? <MetaPill>loopable</MetaPill> : null}
                              {item.sample.bpm ? <MetaPill>{Math.round(item.sample.bpm)} bpm</MetaPill> : null}
                              {item.sample.musicalKey ? <MetaPill>{item.sample.musicalKey}</MetaPill> : null}
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="ais-meta text-ais-warning">hidden sample</p>
                            <p className="mt-2 text-sm leading-6 text-ais-muted">
                              This item is archived, unpublished, or no longer readable on public routes. You can remove it from this private collection.
                            </p>
                          </>
                        )}
                      </div>

                      <div className="flex justify-end gap-1">
                        <IconButton
                          disabled={index === 0 || pendingKey === `move:${item.sampleId}`}
                          label="Move up"
                          onClick={() => void moveItem(activeCollection.id, item.sampleId, "up")}
                        >
                          <ArrowUp size={15} aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          disabled={index === activeCollection.items.length - 1 || pendingKey === `move:${item.sampleId}`}
                          label="Move down"
                          onClick={() => void moveItem(activeCollection.id, item.sampleId, "down")}
                        >
                          <ArrowDown size={15} aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          disabled={pendingKey === `remove:${item.sampleId}`}
                          label="Remove from collection"
                          onClick={() => void removeItem(activeCollection.id, item.sampleId)}
                        >
                          {pendingKey === `remove:${item.sampleId}` ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
                        </IconButton>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="rounded-ais-md border border-ais-border-soft bg-ais-panel p-6">
                <p className="ais-meta text-ais-amber">empty</p>
                <h3 className="ais-title mt-2 text-2xl text-ais-text">No sounds in this private collection yet</h3>
                <p className="mt-3 leading-7 text-ais-muted">Use the collection button on sample cards or detail pages to add published sounds.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-ais-md border border-ais-border-soft bg-ais-panel p-6">
            <p className="ais-meta text-ais-amber">no collection selected</p>
            <h2 className="ais-title mt-2 text-2xl text-ais-text">Create a private collection to begin</h2>
          </div>
        )}

        {message ? <WorkspaceMessageView message={message} /> : null}
      </div>
    </section>
  );
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid size-9 place-items-center rounded-full border border-ais-border-soft text-ais-muted transition duration-ais-base hover:border-ais-amber hover:text-ais-text disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="ais-meta rounded-full border border-ais-border-soft bg-ais-panel px-2.5 py-1 text-xs text-ais-faint">
      {children}
    </span>
  );
}

function WorkspaceMessageView({ message }: { message: WorkspaceMessage }) {
  const toneClass = {
    error: "border-ais-danger text-ais-danger",
    success: "border-ais-success text-ais-success",
    warning: "border-ais-warning text-ais-warning",
  }[message.tone];

  return <p className={`mt-4 rounded-ais-sm border bg-ais-panel px-3 py-2 text-sm ${toneClass}`}>{message.text}</p>;
}

function mapCollectionRow(row: CollectionQueryRow): PrivateCollectionView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.collection_items ?? [])
      .map(mapCollectionItemRow)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.addedAt.localeCompare(right.addedAt)),
  };
}

async function readApiJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function isCollectionPayload(value: unknown): value is {
  data: {
    id: string;
    name: string;
    description: string | null;
    createdAt?: string;
    created_at?: string;
    updatedAt?: string;
    updated_at?: string;
  };
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      "data" in value &&
      value.data &&
      typeof value.data === "object" &&
      "id" in value.data &&
      typeof value.data.id === "string" &&
      "name" in value.data &&
      typeof value.data.name === "string",
  );
}

function apiMessage(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") {
    return value.message;
  }

  return fallback;
}

function mapCollectionItemRow(row: CollectionItemQueryRow): CollectionItemView {
  const sample = Array.isArray(row.samples) ? row.samples[0] : row.samples;

  return {
    sampleId: row.sample_id,
    sortOrder: row.sort_order,
    addedAt: row.added_at,
    sample:
      sample && sample.status === "published"
        ? {
            id: sample.id,
            poeticName: sample.poetic_name,
            displayTitle: sample.display_title,
            shortDescription: sample.short_description,
            categorySlug: sample.category_slug,
            sampleTypeSlug: sample.sample_type_slug,
            bpm: toNumber(sample.bpm),
            musicalKey: sample.musical_key,
            durationSeconds: toNumber(sample.duration_seconds),
            loopable: sample.loopable,
          }
        : null,
  };
}

function toNumber(value: number | string | null) {
  if (value === null) {
    return null;
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
