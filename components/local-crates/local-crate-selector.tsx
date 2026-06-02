"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import {
  createLocalCrate,
  readLocalCrateState,
  selectLocalCrate,
  subscribeToLocalCrates,
  syncLocalCrateSelection,
  type LocalCrateClientState,
} from "@/components/local-crates/local-crate-state";

type LocalCrateSelectorProps = {
  compact?: boolean;
  onMessage?: (message: { tone: "success" | "warning" | "error"; text: string }) => void;
};

export function LocalCrateSelector({ compact = true, onMessage }: LocalCrateSelectorProps) {
  const [state, setState] = useState<LocalCrateClientState>(() => readLocalCrateState());
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const activeCrate = useMemo(
    () => state.crates.find((crate) => crate.name === state.activeCrateName) ?? null,
    [state.activeCrateName, state.crates],
  );

  useEffect(() => subscribeToLocalCrates(() => setState(readLocalCrateState())), []);

  async function createCrate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);

    try {
      const crateName = createLocalCrate(name);
      setName("");
      setState(readLocalCrateState());
      await syncLocalCrateSelection(crateName);

      onMessage?.({ tone: "success", text: `Active crate: ${crateName}.` });
    } catch (error) {
      onMessage?.({ tone: "warning", text: error instanceof Error ? error.message : "Could not create that crate." });
    } finally {
      setIsCreating(false);
    }
  }

  async function selectCrate(value: string) {
    const selected = selectLocalCrate(value);
    setState(readLocalCrateState());

    if (selected) {
      try {
        await syncLocalCrateSelection(selected);
        onMessage?.({ tone: "success", text: `Active crate: ${selected}.` });
      } catch (error) {
        onMessage?.({
          tone: "error",
          text: error instanceof Error ? error.message : "Could not sync the active Project Crate.",
        });
      }
    }
  }

  return (
    <div className={compact ? "grid gap-2" : "grid gap-3"}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {state.crates.length > 0 ? (
          <label className="min-w-[11rem]">
            <span className="sr-only">Active Project Crate</span>
            <select
              className="ais-input h-9 rounded-full py-1.5 text-xs"
              onChange={(event) => void selectCrate(event.target.value)}
              value={activeCrate?.name ?? ""}
            >
              {state.crates.map((crate) => (
                <option key={crate.name} value={crate.name}>
                  {crate.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="ais-meta rounded-full border border-ais-border-soft px-3 py-2 text-xs text-ais-faint">
            no active crate
          </span>
        )}
        {activeCrate ? <Check className="text-ais-success" size={16} aria-hidden="true" /> : null}
      </div>

      <form className="flex justify-end gap-1" onSubmit={createCrate}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">New Project Crate name</span>
          <input
            className="ais-input h-9 rounded-full py-1.5 text-xs"
            onChange={(event) => setName(event.target.value)}
            placeholder="new_project_crate"
            value={name}
          />
        </label>
        <button
          aria-label="Create Project Crate"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-ais-border-soft text-ais-muted transition duration-ais-base hover:border-ais-amber hover:text-ais-text disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreating}
          title="Create Project Crate"
          type="submit"
        >
          {isCreating ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
        </button>
      </form>
    </div>
  );
}
