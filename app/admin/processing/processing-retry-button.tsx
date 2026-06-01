"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

export function ProcessingRetryButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retryJob() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/processing-jobs/${encodeURIComponent(jobId)}/retry`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to retry this processing job.");
      }

      router.refresh();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Unable to retry this processing job.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-amber px-3 py-2 text-sm font-medium text-ais-text transition hover:bg-ais-panel disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        onClick={retryJob}
        type="button"
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" size={15} /> : <RotateCcw aria-hidden="true" size={15} />}
        Retry
      </button>
      {error ? <p className="text-sm text-ais-danger">{error}</p> : null}
    </div>
  );
}
