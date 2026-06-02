"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useCollectionUiStore } from "@/stores/collection-ui-store";
import type { SampleActionSample } from "@/components/sample-actions/sample-actions";

type PrivateCollection = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  containsTarget: boolean;
};

type CollectionRow = {
  id: string;
  name: string;
  description: string | null;
  collection_items?: { sample_id: string }[] | null;
};

type ModalMessage = {
  tone: "success" | "warning" | "error";
  text: string;
};

type CollectionModalProps = {
  sample: SampleActionSample;
};

export function CollectionModal({ sample }: CollectionModalProps) {
  const close = useCollectionUiStore((state) => state.close);
  const targetSampleId = useCollectionUiStore((state) => state.targetSampleId);
  const optimisticCollectionIdsBySample = useCollectionUiStore((state) => state.optimisticCollectionIdsBySample);
  const setOptimisticMembership = useCollectionUiStore((state) => state.setOptimisticMembership);
  const [collections, setCollections] = useState<PrivateCollection[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<ModalMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, startCreateTransition] = useTransition();
  const [pendingCollectionId, setPendingCollectionId] = useState<string | null>(null);
  const sampleId = targetSampleId ?? sample.id;
  const selectedIds = useMemo(
    () => optimisticCollectionIdsBySample[sampleId] ?? collections.filter((collection) => collection.containsTarget).map((collection) => collection.id),
    [collections, optimisticCollectionIdsBySample, sampleId],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCollections() {
      setIsLoading(true);
      setMessage(null);

      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error("Sign in to use private collections.");
        }

        const { data, error } = await supabase
          .from("collections")
          .select("id,name,description,collection_items(sample_id)")
          .eq("visibility", "private")
          .order("updated_at", { ascending: false });

        if (error) {
          throw error;
        }

        if (cancelled) {
          return;
        }

        const rows = (data ?? []) as CollectionRow[];
        const nextCollections = rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          itemCount: row.collection_items?.length ?? 0,
          containsTarget: Boolean(row.collection_items?.some((item) => item.sample_id === sampleId)),
        }));

        setCollections(nextCollections);
        setOptimisticMembership(
          sampleId,
          nextCollections.filter((collection) => collection.containsTarget).map((collection) => collection.id),
        );
      } catch (error) {
        if (!cancelled) {
          setMessage({
            tone: "error",
            text: error instanceof Error ? error.message : "Unable to load private collections.",
          });
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
  }, [sampleId, setOptimisticMembership]);

  function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const safeName = name.trim();

    if (!safeName) {
      setMessage({ tone: "warning", text: "Give the private collection a name first." });
      return;
    }

    startCreateTransition(async () => {
      setMessage(null);

      try {
        const createResponse = await fetch("/api/collections", {
          body: JSON.stringify({
            description: description.trim() || null,
            name: safeName,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        const createPayload = await readApiJson(createResponse);

        if (!createResponse.ok || !isCollectionPayload(createPayload)) {
          throw new Error(apiMessage(createPayload, "Could not create that private collection."));
        }

        const collection = createPayload.data;
        const itemResponse = await fetch(`/api/collections/${encodeURIComponent(collection.id)}/items`, {
          body: JSON.stringify({ sampleId, sortOrder: 0 }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const itemPayload = await readApiJson(itemResponse);

        if (!itemResponse.ok) {
          throw new Error(apiMessage(itemPayload, "Could not add this sample to the new collection."));
        }

        const created = {
          id: collection.id,
          name: collection.name,
          description: collection.description,
          itemCount: 1,
          containsTarget: true,
        };
        setCollections((current) => [created, ...current]);
        setOptimisticMembership(sampleId, [...selectedIds, collection.id]);
        setName("");
        setDescription("");
        setMessage({ tone: "success", text: "Created and added." });
      } catch {
        setMessage({ tone: "error", text: "Could not create that private collection." });
      }
    });
  }

  async function toggleMembership(collection: PrivateCollection) {
    const nextSelected = selectedIds.includes(collection.id)
      ? selectedIds.filter((id) => id !== collection.id)
      : [...selectedIds, collection.id];
    const wasSelected = selectedIds.includes(collection.id);

    setPendingCollectionId(collection.id);
    setOptimisticMembership(sampleId, nextSelected);
    setCollections((current) =>
      current.map((item) =>
        item.id === collection.id
          ? {
              ...item,
              containsTarget: !wasSelected,
              itemCount: Math.max(0, item.itemCount + (wasSelected ? -1 : 1)),
            }
          : item,
      ),
    );
    setMessage(null);

    try {
      const response = wasSelected
        ? await fetch(`/api/collections/${encodeURIComponent(collection.id)}/items/${encodeURIComponent(sampleId)}`, {
            method: "DELETE",
          })
        : await fetch(`/api/collections/${encodeURIComponent(collection.id)}/items`, {
            body: JSON.stringify({ sampleId, sortOrder: collection.itemCount }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
      const payload = await readApiJson(response);

      if (!response.ok) {
        throw new Error(apiMessage(payload, "Collection update failed."));
      }

      setMessage({
        tone: "success",
        text: wasSelected ? "Removed from collection." : "Added to collection.",
      });
    } catch {
      setOptimisticMembership(sampleId, selectedIds);
      setCollections((current) =>
        current.map((item) =>
          item.id === collection.id
            ? {
                ...item,
                containsTarget: wasSelected,
                itemCount: Math.max(0, item.itemCount + (wasSelected ? 1 : -1)),
              }
            : item,
        ),
      );
      setMessage({ tone: "error", text: "Collection update failed. The change was reverted." });
    } finally {
      setPendingCollectionId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="collection-modal-title">
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-ais-lg border border-ais-border bg-ais-surface p-5 shadow-2xl shadow-black/40 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="ais-meta text-ais-amber">private collections</p>
            <h2 className="ais-title mt-2 break-words text-3xl text-ais-text" id="collection-modal-title">
              {sample.displayTitle}
            </h2>
            <p className="ais-slug mt-2 break-words text-xs text-ais-faint">{sample.poeticName}</p>
          </div>
          <button
            aria-label="Close collection modal"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-ais-border-soft text-ais-muted transition duration-ais-base hover:border-ais-amber hover:text-ais-text"
            onClick={close}
            type="button"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form className="mt-6 grid gap-3 rounded-ais-md border border-ais-border-soft bg-ais-panel p-4" onSubmit={createCollection}>
          <label className="grid gap-2">
            <span className="ais-meta text-xs text-ais-faint">new collection</span>
            <input
              className="ais-input"
              maxLength={90}
              onChange={(event) => setName(event.target.value)}
              placeholder="late night metal"
              value={name}
            />
          </label>
          <label className="grid gap-2">
            <span className="ais-meta text-xs text-ais-faint">note</span>
            <textarea
              className="ais-input min-h-20 resize-y"
              maxLength={220}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="for sounds that scrape but still glow"
              value={description}
            />
          </label>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-ais-sm border border-ais-amber bg-ais-amber px-4 py-2 font-medium text-ais-bg transition duration-ais-base hover:bg-ais-pale-green disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isCreating}
            type="submit"
          >
            {isCreating ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            Create and add
          </button>
        </form>

        <div className="mt-5 grid gap-2">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-3 text-sm text-ais-muted">
              <Loader2 className="animate-spin" size={16} aria-hidden="true" />
              Loading private collections
            </div>
          ) : collections.length > 0 ? (
            collections.map((collection) => {
              const selected = selectedIds.includes(collection.id);

              return (
                <button
                  className={[
                    "flex items-center justify-between gap-4 rounded-ais-sm border bg-ais-panel px-4 py-3 text-left transition duration-ais-base",
                    selected ? "border-ais-amber text-ais-text" : "border-ais-border-soft text-ais-muted hover:border-ais-moss hover:text-ais-text",
                  ].join(" ")}
                  disabled={pendingCollectionId === collection.id}
                  key={collection.id}
                  onClick={() => void toggleMembership(collection)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{collection.name}</span>
                    <span className="ais-meta mt-1 block text-xs text-ais-faint">
                      {collection.itemCount === 1 ? "1 sound" : `${collection.itemCount} sounds`}
                    </span>
                  </span>
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-current">
                    {pendingCollectionId === collection.id ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : selected ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-4 py-3 text-sm leading-6 text-ais-muted">
              No private collections yet.
            </p>
          )}
        </div>

        {message ? <ModalMessageView message={message} /> : null}
      </div>
    </div>
  );
}

function ModalMessageView({ message }: { message: ModalMessage }) {
  const toneClass = {
    error: "border-ais-danger text-ais-danger",
    success: "border-ais-success text-ais-success",
    warning: "border-ais-warning text-ais-warning",
  }[message.tone];

  return <p className={`mt-4 rounded-ais-sm border bg-ais-panel px-3 py-2 text-sm ${toneClass}`}>{message.text}</p>;
}

async function readApiJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function isCollectionPayload(value: unknown): value is { data: { id: string; name: string; description: string | null } } {
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
