"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  Archive,
  AudioWaveform,
  Eye,
  Loader2,
  RotateCcw,
  Sparkles,
  Star,
  Undo2,
} from "lucide-react";
import { adminSampleEditRoute, sampleDetailRoute } from "@/lib/routes";

type SampleAction = "publish" | "archive" | "restore" | "retry" | "reprocess-preview" | "reprocess-waveform";

type AdminSampleRowActionsProps = {
  failedJobId?: string | null;
  poeticName: string;
  sampleId: string;
  status: string;
};

export function AdminSampleRowActions({
  failedJobId,
  poeticName,
  sampleId,
  status,
}: AdminSampleRowActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<SampleAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canArchive = status !== "archived";
  const canRestore = status === "archived" || status === "failed";
  const canPreview = status === "published";

  async function runAction(action: SampleAction) {
    setPendingAction(action);
    setMessage(null);

    try {
      const response = await fetch(actionUrl(sampleId, failedJobId, action), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(actionPayload(action)),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? `Unable to ${action} this row.`);
      }

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to ${action} this row.`);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="grid min-w-52 gap-2">
      <div className="flex flex-wrap gap-2">
        <a
          className="inline-flex size-9 items-center justify-center rounded-ais-sm border border-ais-border-soft bg-ais-panel text-ais-muted transition hover:border-ais-amber hover:text-ais-text"
          href={adminSampleEditRoute(sampleId)}
          title="Open edit workspace"
        >
          <Eye aria-hidden="true" size={15} />
        </a>
        <a
          aria-disabled={!canPreview}
          className={[
            "inline-flex size-9 items-center justify-center rounded-ais-sm border bg-ais-panel transition",
            canPreview
              ? "border-ais-border-soft text-ais-muted hover:border-ais-amber hover:text-ais-text"
              : "pointer-events-none border-ais-border-soft text-ais-faint opacity-50",
          ].join(" ")}
          href={canPreview ? sampleDetailRoute(poeticName) : "#"}
          title={canPreview ? "Preview public sample" : "Preview appears after publish"}
        >
          <AudioWaveform aria-hidden="true" size={15} />
        </a>
        <ActionIconButton
          disabled={pendingAction !== null || status === "published" || status === "archived"}
          icon={<Sparkles aria-hidden="true" size={15} />}
          label="Publish row"
          loading={pendingAction === "publish"}
          onClick={() => runAction("publish")}
        />
        <ActionIconButton
          disabled={pendingAction !== null || !canArchive}
          icon={<Archive aria-hidden="true" size={15} />}
          label="Archive row"
          loading={pendingAction === "archive"}
          onClick={() => runAction("archive")}
        />
        <ActionIconButton
          disabled={pendingAction !== null || !canRestore}
          icon={<Undo2 aria-hidden="true" size={15} />}
          label="Restore to review"
          loading={pendingAction === "restore"}
          onClick={() => runAction("restore")}
        />
        <ActionIconButton
          disabled={pendingAction !== null || !failedJobId}
          icon={<RotateCcw aria-hidden="true" size={15} />}
          label="Retry failed processing"
          loading={pendingAction === "retry"}
          onClick={() => runAction("retry")}
        />
        <ActionIconButton
          disabled={pendingAction !== null}
          icon={<AudioWaveform aria-hidden="true" size={15} />}
          label="Reprocess preview"
          loading={pendingAction === "reprocess-preview"}
          onClick={() => runAction("reprocess-preview")}
        />
        <ActionIconButton
          disabled={pendingAction !== null}
          icon={<AudioWaveform aria-hidden="true" size={15} />}
          label="Reprocess waveform"
          loading={pendingAction === "reprocess-waveform"}
          onClick={() => runAction("reprocess-waveform")}
        />
        <ActionIconButton
          disabled
          icon={<Star aria-hidden="true" size={15} />}
          label="Toggle featured in edit workspace"
        />
      </div>
      {message ? <p className="max-w-72 text-xs leading-5 text-ais-danger">{message}</p> : null}
    </div>
  );
}

type ActionIconButtonProps = {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  loading?: boolean;
  onClick?: () => void;
};

function ActionIconButton({
  disabled = false,
  icon,
  label,
  loading = false,
  onClick,
}: ActionIconButtonProps) {
  return (
    <button
      className="inline-flex size-9 items-center justify-center rounded-ais-sm border border-ais-border-soft bg-ais-panel text-ais-muted transition hover:border-ais-amber hover:text-ais-text disabled:cursor-not-allowed disabled:text-ais-faint disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={15} /> : icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function actionUrl(sampleId: string, failedJobId: string | null | undefined, action: SampleAction) {
  if (action === "retry" && failedJobId) {
    return `/api/admin/processing-jobs/${encodeURIComponent(failedJobId)}/retry`;
  }

  if (action === "reprocess-preview" || action === "reprocess-waveform") {
    return `/api/admin/samples/${encodeURIComponent(sampleId)}/${action}`;
  }

  return `/api/admin/samples/${encodeURIComponent(sampleId)}/${action}`;
}

function actionPayload(action: SampleAction) {
  if (action === "publish") {
    return { confirm_publish: true };
  }

  if (action === "archive") {
    return { confirm_archive: true };
  }

  if (action === "restore") {
    return { confirm_restore: true };
  }

  return {};
}
