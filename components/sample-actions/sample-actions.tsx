"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, Download, ExternalLink, FolderOpen, FolderPlus, Heart, Loader2 } from "lucide-react";
import { CollectionModal } from "@/components/collections/collection-modal";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useCollectionUiStore } from "@/stores/collection-ui-store";

export type SampleActionEntitlement = {
  userId: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  accessMode: "local_owner" | "free_launch" | "paid_test" | "paid_live";
  subscriptionStatus: string | null;
  canFavorite: boolean;
  canCreateCollections: boolean;
  canDownloadOriginal: boolean;
  canUsePlugin: boolean;
  shouldShowCheckout: boolean;
  reason: string | null;
};

export type SampleActionSample = {
  id: string;
  poeticName: string;
  displayTitle: string;
  bpm: number | null;
  musicalKey: string | null;
};

type SampleActionsProps = {
  sample: SampleActionSample;
  entitlement: SampleActionEntitlement;
  initialFavorited: boolean;
  compact?: boolean;
};

type ActionMessage = {
  tone: "success" | "warning" | "error";
  text: string;
};

type DownloadResponse = {
  signedUrl?: string;
  signed_url?: string;
  url?: string;
  expiresAt?: string;
  expires_at?: string;
  filename?: string;
  fileName?: string;
  error?: string;
  code?: string;
  message?: string;
  ok?: boolean;
};

type LocalActionResponse = {
  data?: {
    tokenizedPath?: string;
    tokenized_path?: string;
    dropzoneTokenizedPath?: string;
    dropzone_tokenized_path?: string;
    absolutePath?: string;
    absolute_path?: string;
    path?: string;
    filename?: string;
  };
  ok?: boolean;
  tokenizedPath?: string;
  tokenized_path?: string;
  dropzoneTokenizedPath?: string;
  dropzone_tokenized_path?: string;
  absolutePath?: string;
  absolute_path?: string;
  path?: string;
  filename?: string;
  message?: string;
  code?: string;
  error?: string;
};

export function SampleActions({ compact = true, entitlement, initialFavorited, sample }: SampleActionsProps) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [favoritePending, startFavoriteTransition] = useTransition();
  const [downloadPending, setDownloadPending] = useState(false);
  const [localPending, setLocalPending] = useState<string | null>(null);
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [localTokenizedPath, setLocalTokenizedPath] = useState<string | null>(null);
  const [dropzoneTokenizedPath, setDropzoneTokenizedPath] = useState<string | null>(null);
  const openCollectionModal = useCollectionUiStore((state) => state.openForSample);
  const modalTargetSampleId = useCollectionUiStore((state) => state.targetSampleId);
  const isLocalOwnerSurface =
    entitlement.accessMode === "local_owner" &&
    entitlement.isAuthenticated &&
    (entitlement.isAdmin || entitlement.subscriptionStatus === "lifetime_granted" || entitlement.canUsePlugin);

  useEffect(() => {
    if (!entitlement.isAuthenticated || !entitlement.userId) {
      return;
    }

    let cancelled = false;
    const userId = entitlement.userId;

    async function loadFavoriteState() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("favorites")
          .select("sample_id")
          .eq("sample_id", sample.id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!cancelled && !error) {
          setFavorited(Boolean(data));
        }
      } catch {
        // The toggle still works optimistically; stale initial state is safer than noisy card chrome.
      }
    }

    void loadFavoriteState();

    return () => {
      cancelled = true;
    };
  }, [entitlement.isAuthenticated, entitlement.userId, sample.id]);

  const buttonSize = compact ? "size-9" : "size-10";

  function showMessage(next: ActionMessage) {
    setMessage(next);
  }

  function toggleFavorite() {
    if (!entitlement.isAuthenticated || !entitlement.canFavorite || !entitlement.userId) {
      showMessage({ tone: "warning", text: "Sign in to save this sound as a favorite." });
      return;
    }

    const userId = entitlement.userId;
    const nextFavorited = !favorited;
    setFavorited(nextFavorited);
    setMessage(null);

    startFavoriteTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const result = nextFavorited
          ? await supabase.from("favorites").insert({ sample_id: sample.id, user_id: userId })
          : await supabase.from("favorites").delete().eq("sample_id", sample.id).eq("user_id", userId);

        if (result.error) {
          throw result.error;
        }

        showMessage({
          tone: "success",
          text: nextFavorited ? "Favorited." : "Removed from favorites.",
        });
      } catch {
        setFavorited(!nextFavorited);
        showMessage({
          tone: "error",
          text: nextFavorited
            ? "Could not favorite this published sample. The change was reverted."
            : "Could not remove this favorite. The change was reverted.",
        });
      }
    });
  }

  function openCollections() {
    if (!entitlement.isAuthenticated || !entitlement.canCreateCollections) {
      showMessage({ tone: "warning", text: "Sign in to place this sound in a private collection." });
      return;
    }

    setMessage(null);
    openCollectionModal(sample.id);
  }

  async function downloadSample() {
    if (!entitlement.isAuthenticated) {
      showMessage({ tone: "warning", text: "Sign in to download original WAV files." });
      return;
    }

    if (!entitlement.canDownloadOriginal) {
      showMessage({ tone: "warning", text: entitlement.shouldShowCheckout ? "Subscription required for this download." : "Your account is not entitled to download this original yet." });
      return;
    }

    setDownloadPending(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/download/${encodeURIComponent(sample.id)}`, {
        method: "GET",
      });
      const payload = (await readJson(response)) as DownloadResponse;

      if (!response.ok) {
        throw new DownloadError(downloadErrorMessage(response.status, payload));
      }

      const signedUrl = payload.signedUrl ?? payload.signed_url ?? payload.url;
      if (!signedUrl) {
        throw new DownloadError("Signed URL failed: the download route did not return a URL.");
      }

      const anchor = document.createElement("a");
      anchor.href = signedUrl;
      anchor.download = payload.filename ?? payload.fileName ?? `${sample.poeticName}.wav`;
      anchor.rel = "noreferrer";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();

      const expiry = payload.expiresAt ?? payload.expires_at;
      showMessage({
        tone: "success",
        text: expiry ? `Download started. Signed URL expires at ${formatSignedUrlExpiry(expiry)}.` : "Download started.",
      });
    } catch (error) {
      showMessage({ tone: "error", text: error instanceof Error ? error.message : "Download failed." });
    } finally {
      setDownloadPending(false);
    }
  }

  async function runLocalAction(action: "export" | "reveal" | "copy_path") {
    if (!isLocalOwnerSurface) {
      showMessage({ tone: "warning", text: "Local producer controls are available only in local owner mode." });
      return;
    }

    setLocalPending(action);
    setMessage(null);

    try {
      const endpoint =
        action === "export"
          ? "/api/local/dropzone/export"
          : action === "reveal"
            ? "/api/local/path/reveal"
            : "/api/local/path/copy";
      const tokenizedPath = action === "reveal" ? localTokenizedPath ?? dropzoneTokenizedPath : localTokenizedPath;

      if (action !== "export" && !tokenizedPath) {
        showMessage({
          tone: "warning",
          text: action === "reveal" ? "Export this sound before revealing it in Finder." : "Export this sound before copying its file path.",
        });
        return;
      }

      const response = await fetch(endpoint, {
        body: JSON.stringify(action === "export" ? { sampleId: sample.id } : { tokenizedPath }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await readJson(response)) as LocalActionResponse;

      if (!response.ok) {
        throw new Error(localActionErrorMessage(action, response.status, payload));
      }

      const data = payload.data ?? {};
      const nextTokenizedPath = data.tokenizedPath ?? data.tokenized_path ?? payload.tokenizedPath ?? payload.tokenized_path ?? null;
      const nextDropzoneTokenizedPath =
        data.dropzoneTokenizedPath ?? data.dropzone_tokenized_path ?? payload.dropzoneTokenizedPath ?? payload.dropzone_tokenized_path ?? null;
      const resolvedPath = data.absolutePath ?? data.absolute_path ?? data.path ?? payload.absolutePath ?? payload.absolute_path ?? payload.path ?? nextTokenizedPath;

      if (action === "export") {
        setLocalTokenizedPath(nextTokenizedPath);
        setDropzoneTokenizedPath(nextDropzoneTokenizedPath);
      }

      if (action === "copy_path") {
        if (!resolvedPath) {
          throw new Error("Copy File Path failed: the local route did not return a usable path.");
        }
        await navigator.clipboard.writeText(resolvedPath);
      }

      showMessage({
        tone: "success",
        text:
          action === "export"
            ? `Exported to FL Dropzone${data.filename ?? payload.filename ? ` as ${data.filename ?? payload.filename}` : ""}.`
            : action === "reveal"
              ? "Dropzone reveal requested in Finder."
              : "File path copied.",
      });
    } catch (error) {
      showMessage({ tone: "error", text: error instanceof Error ? error.message : "Local action failed." });
    } finally {
      setLocalPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1">
        <IconActionButton
          active={favorited}
          ariaLabel={favorited ? `Remove ${sample.displayTitle} from favorites` : `Favorite ${sample.displayTitle}`}
          disabled={favoritePending}
          onClick={toggleFavorite}
          sizeClass={buttonSize}
          title={favorited ? "Remove favorite" : "Favorite"}
        >
          {favoritePending ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Heart fill={favorited ? "currentColor" : "none"} size={16} aria-hidden="true" />}
        </IconActionButton>
        <IconActionButton
          ariaLabel={`Add ${sample.displayTitle} to a private collection`}
          onClick={openCollections}
          sizeClass={buttonSize}
          title="Add to collection"
        >
          <FolderPlus size={16} aria-hidden="true" />
        </IconActionButton>
        <IconActionButton
          ariaLabel={`Download ${sample.displayTitle}`}
          disabled={downloadPending}
          onClick={downloadSample}
          sizeClass={buttonSize}
          title={downloadButtonTitle(entitlement)}
        >
          {downloadPending ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
        </IconActionButton>
      </div>

      {isLocalOwnerSurface ? (
        <div className="flex flex-wrap justify-end gap-1 border-t border-ais-border-soft pt-2">
          <IconActionButton
            ariaLabel={`Export ${sample.displayTitle} to FL Dropzone`}
            disabled={Boolean(localPending)}
            onClick={() => void runLocalAction("export")}
            sizeClass={buttonSize}
            title="Export to FL Dropzone"
          >
            {localPending === "export" ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <ExternalLink size={16} aria-hidden="true" />}
          </IconActionButton>
          <IconActionButton
            ariaLabel="Reveal FL Dropzone in Finder"
            disabled={Boolean(localPending)}
            onClick={() => void runLocalAction("reveal")}
            sizeClass={buttonSize}
            title="Reveal in Finder"
          >
            {localPending === "reveal" ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <FolderOpen size={16} aria-hidden="true" />}
          </IconActionButton>
          <IconActionButton
            ariaLabel={`Copy local file path for ${sample.displayTitle}`}
            disabled={Boolean(localPending)}
            onClick={() => void runLocalAction("copy_path")}
            sizeClass={buttonSize}
            title="Copy File Path"
          >
            {localPending === "copy_path" ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          </IconActionButton>
        </div>
      ) : null}

      {message ? <ActionMessageView message={message} /> : null}
      {modalTargetSampleId === sample.id ? <CollectionModal sample={sample} /> : null}
    </div>
  );
}

function IconActionButton({
  active = false,
  ariaLabel,
  children,
  disabled,
  onClick,
  sizeClass,
  title,
}: {
  active?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  sizeClass: string;
  title: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={[
        "grid shrink-0 place-items-center rounded-full border transition duration-ais-base disabled:cursor-not-allowed disabled:opacity-60",
        sizeClass,
        active ? "border-ais-amber text-ais-amber" : "border-ais-border-soft text-ais-muted hover:border-ais-moss hover:text-ais-text",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function ActionMessageView({ message }: { message: ActionMessage }) {
  const toneClass = {
    error: "border-ais-danger text-ais-danger",
    success: "border-ais-success text-ais-success",
    warning: "border-ais-warning text-ais-warning",
  }[message.tone];

  return (
    <p className={`max-w-72 rounded-ais-sm border bg-ais-panel px-3 py-2 text-right text-xs leading-5 ${toneClass}`}>
      {message.text}
    </p>
  );
}

function downloadButtonTitle(entitlement: SampleActionEntitlement) {
  if (!entitlement.isAuthenticated) {
    return "Login required";
  }

  if (!entitlement.canDownloadOriginal) {
    return entitlement.shouldShowCheckout ? "Subscription required" : "Download unavailable";
  }

  return "Download original";
}

function downloadErrorMessage(status: number, payload: DownloadResponse) {
  const code = payload.code ?? payload.error;
  const message = payload.message;

  if (status === 401 || code === "not_authenticated") {
    return "Login required before downloading this original.";
  }

  if (status === 402 || status === 403 || code === "subscription_required" || code === "not_entitled") {
    return "Subscription required: your account is not entitled to this original.";
  }

  if (status === 404 || code === "original_missing" || code === "missing_original_asset") {
    return "Original missing: this sample cannot be downloaded until its source WAV is restored.";
  }

  if (status === 409 || code === "sample_unpublished" || code === "sample_archived") {
    return "Archived or unpublished samples cannot be downloaded from public routes.";
  }

  if (status === 501) {
    return "Signed URL failed: the download route is not implemented yet.";
  }

  if (code === "signed_url_failed") {
    return "Signed URL failed. Try again after the storage route is healthy.";
  }

  return message ?? "Download failed. The route did not provide a usable signed URL.";
}

function localActionErrorMessage(action: "export" | "reveal" | "copy_path", status: number, payload: LocalActionResponse) {
  if (status === 401) {
    return "Login required before using local producer controls.";
  }

  if (status === 403) {
    return "Local owner mode is required for this action.";
  }

  if (status === 404) {
    return action === "export"
      ? "Export failed: the original WAV is missing or the local route is unavailable."
      : "Local route unavailable for this action.";
  }

  if (status === 501) {
    return "Local export route is not implemented yet.";
  }

  return payload.message ?? payload.error ?? "Local producer action failed.";
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function formatSignedUrlExpiry(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadError";
  }
}
