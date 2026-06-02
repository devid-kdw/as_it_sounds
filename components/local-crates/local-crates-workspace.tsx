"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, FolderOpen, Loader2, PackagePlus } from "lucide-react";
import { LocalCrateSelector } from "@/components/local-crates/local-crate-selector";
import {
  readLocalCrateState,
  revealLocalCrate,
  statusLabel,
  subscribeToLocalCrates,
  syncLocalCrateEntry,
  upsertLocalCrateEntry,
  type LocalCrateClientState,
} from "@/components/local-crates/local-crate-state";
import { sampleDetailRoute } from "@/lib/routes";
import type { SampleActionEntitlement } from "@/components/sample-actions/sample-actions";
import type { LocalCrateSampleStatus, LocalProjectCrateEntry } from "@/types/api";

type LocalCratesWorkspaceProps = {
  entitlement: SampleActionEntitlement;
};

type WorkspaceMessage = {
  tone: "success" | "warning" | "error";
  text: string;
};

export function LocalCratesWorkspace({ entitlement }: LocalCratesWorkspaceProps) {
  const [state, setState] = useState<LocalCrateClientState>(() => readLocalCrateState());
  const [message, setMessage] = useState<WorkspaceMessage | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const isLocalOwnerSurface =
    entitlement.accessMode === "local_owner" &&
    entitlement.isAuthenticated &&
    (entitlement.isAdmin || entitlement.subscriptionStatus === "lifetime_granted" || entitlement.canUsePlugin);
  const activeCrate = useMemo(
    () => state.crates.find((crate) => crate.name === state.activeCrateName) ?? null,
    [state.activeCrateName, state.crates],
  );
  const entries = activeCrate ? state.entriesByCrate[activeCrate.name] ?? [] : [];
  const groups = groupEntries(entries);

  useEffect(() => subscribeToLocalCrates(() => setState(readLocalCrateState())), []);

  if (!isLocalOwnerSurface) {
    return (
      <div className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6">
        <p className="ais-meta text-xs text-ais-amber">owner only</p>
        <p className="mt-3 leading-7 text-ais-muted">Project Crates are hidden outside authenticated local owner mode.</p>
      </div>
    );
  }

  async function markUsed(entry: LocalProjectCrateEntry) {
    if (!activeCrate) {
      setMessage({ tone: "warning", text: "Select an active Project Crate first." });
      return;
    }

    setPendingKey(`used:${entry.sampleId}`);
    setMessage(null);

    try {
      upsertLocalCrateEntry({
        crateName: activeCrate.name,
        sample: {
          sampleId: entry.sampleId,
          poeticName: entry.poeticName,
          displayTitle: entry.displayTitle,
          bpm: entry.bpm,
          musicalKey: entry.musicalKey,
          exportedPath: entry.exportedPath,
        },
        status: "used",
        exportedPath: entry.exportedPath,
      });
      await syncLocalCrateEntry({
        crateName: activeCrate.name,
        sample: {
          sampleId: entry.sampleId,
          poeticName: entry.poeticName,
          displayTitle: entry.displayTitle,
          bpm: entry.bpm,
          musicalKey: entry.musicalKey,
          exportedPath: entry.exportedPath,
        },
        status: "used",
        exportedPath: entry.exportedPath,
      });
      setState(readLocalCrateState());
      setMessage({ tone: "success", text: `${entry.displayTitle} marked used.` });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not sync used status.",
      });
    } finally {
      setPendingKey(null);
    }
  }

  async function openCrateFolder() {
    if (!activeCrate) {
      setMessage({ tone: "warning", text: "Create or select a Project Crate first." });
      return;
    }

    setPendingKey("open-crate");
    setMessage(null);

    try {
      await revealLocalCrate(activeCrate.name);
      setMessage({ tone: "success", text: "Crate folder reveal requested in Finder." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not open the crate folder.",
      });
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          <p className="ais-meta text-xs text-ais-amber">active crate</p>
          <h2 className="ais-name mt-2 break-words text-3xl leading-tight text-ais-text">
            {activeCrate?.name ?? "No Project Crate selected"}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <SummaryPill label="considered" value={groups.considered.length} />
            <SummaryPill label="exported" value={groups.exported.length} />
            <SummaryPill label="used" value={groups.used.length} />
          </div>
        </div>

        <div className="grid gap-3 sm:min-w-80">
          <LocalCrateSelector compact={false} onMessage={setMessage} />
          <button
            className="inline-flex items-center justify-center gap-2 rounded-ais-sm border border-ais-amber px-4 py-2 text-sm text-ais-amber transition duration-ais-base hover:bg-ais-panel disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pendingKey === "open-crate" || !activeCrate}
            onClick={() => void openCrateFolder()}
            type="button"
          >
            {pendingKey === "open-crate" ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <FolderOpen size={16} aria-hidden="true" />}
            Open crate folder
          </button>
        </div>
      </section>

      {message ? <WorkspaceMessageView message={message} /> : null}

      {activeCrate ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <CrateGroup title="considered" status="considered" entries={groups.considered} onMarkUsed={markUsed} pendingKey={pendingKey} />
          <CrateGroup title="exported" status="exported" entries={groups.exported} onMarkUsed={markUsed} pendingKey={pendingKey} />
          <CrateGroup title="used" status="used" entries={groups.used} onMarkUsed={markUsed} pendingKey={pendingKey} />
        </div>
      ) : (
        <div className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6">
          <PackagePlus className="text-ais-amber" size={22} aria-hidden="true" />
          <p className="mt-3 leading-7 text-ais-muted">Create a crate, then add samples from Browse or a sample detail page.</p>
        </div>
      )}
    </div>
  );
}

function CrateGroup({
  entries,
  onMarkUsed,
  pendingKey,
  status,
  title,
}: {
  entries: LocalProjectCrateEntry[];
  onMarkUsed: (entry: LocalProjectCrateEntry) => Promise<void>;
  pendingKey: string | null;
  status: LocalCrateSampleStatus;
  title: string;
}) {
  return (
    <section className="grid content-start gap-3 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="ais-meta text-sm text-ais-amber">{title}</h3>
        <span className="ais-meta rounded-full border border-ais-border-soft px-2.5 py-1 text-xs text-ais-faint">{entries.length}</span>
      </div>

      {entries.length > 0 ? (
        entries.map((entry) => (
          <article className="grid gap-3 rounded-ais-sm border border-ais-border-soft bg-ais-panel p-3" key={entry.sampleId}>
            <div>
              <Link
                className="ais-name break-words text-2xl leading-tight text-ais-text underline-offset-4 transition duration-ais-base hover:text-ais-pale-green hover:underline"
                href={sampleDetailRoute(entry.poeticName)}
              >
                {entry.displayTitle}
              </Link>
              <p className="ais-slug mt-1 break-words text-xs text-ais-amber">{entry.poeticName}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <MetaPill>{statusLabel(entry.status)}</MetaPill>
              {entry.bpm ? <MetaPill>{Math.round(entry.bpm)} bpm</MetaPill> : null}
              {entry.musicalKey ? <MetaPill>{entry.musicalKey}</MetaPill> : null}
              {entry.exportedPath ? <MetaPill>export logged</MetaPill> : null}
            </div>
            {status !== "used" ? (
              <button
                className="inline-flex items-center justify-center gap-2 rounded-ais-sm border border-ais-border-soft px-3 py-2 text-xs text-ais-muted transition duration-ais-base hover:border-ais-amber hover:text-ais-text disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pendingKey === `used:${entry.sampleId}`}
                onClick={() => void onMarkUsed(entry)}
                type="button"
              >
                {pendingKey === `used:${entry.sampleId}` ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                Mark used
              </button>
            ) : null}
          </article>
        ))
      ) : (
        <p className="rounded-ais-sm border border-ais-border-soft bg-ais-panel px-3 py-4 text-sm leading-6 text-ais-faint">
          No {title} samples yet.
        </p>
      )}
    </section>
  );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="ais-meta rounded-full border border-ais-border-soft bg-ais-panel px-3 py-1.5 text-xs text-ais-muted">
      {label}: <span className="text-ais-text">{value}</span>
    </span>
  );
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="ais-meta rounded-full border border-ais-border-soft px-2.5 py-1 text-xs text-ais-faint">
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

  return <p className={`rounded-ais-sm border bg-ais-panel px-4 py-3 text-sm leading-6 ${toneClass}`}>{message.text}</p>;
}

function groupEntries(entries: LocalProjectCrateEntry[]) {
  return {
    considered: entries.filter((entry) => entry.status === "considered"),
    exported: entries.filter((entry) => entry.status === "exported"),
    used: entries.filter((entry) => entry.status === "used"),
  };
}
