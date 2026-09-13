"use client";

import { useMemo, useState } from "react";
import { graphFragmentStatus, snapshotJson, type LabSnapshot } from "@/lib/codec";
import { exportDagittyText, importDagittyText } from "@/lib/dagitty-io";
import {
  duplicateLibraryEntry,
  loadLibrary,
  saveToLibrary,
  type SavedLabModel,
} from "@/lib/persist";
import { useLabStore } from "@/store/lab-store";

function snapshotFromStore(state: LabSnapshot): LabSnapshot {
  return {
    v: 1,
    graph: state.graph,
    parameters: state.parameters,
    conditioning: state.conditioning,
    selection: state.selection,
    measured: state.measured,
    reliability: state.reliability,
    seed: state.seed,
    n: state.n,
  };
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function InteropPanel() {
  const store = useLabStore();
  const snapshot = useMemo(() => snapshotFromStore(store), [store]);
  const library: SavedLabModel[] = typeof window === "undefined" ? [] : loadLibrary();
  const [dagittyText, setDagittyText] = useState("");

  const share = async () => {
    try {
      const status = await graphFragmentStatus(snapshot);
      if (!status.shareable) {
        store.setNotice("Graph too large for a URL — use JSON export.");
        return;
      }
      const url = `${window.location.origin}${window.location.pathname}${status.fragment}`;
      window.history.replaceState(null, "", status.fragment);
      await navigator.clipboard?.writeText(url);
      store.setNotice("Share link copied to the clipboard.");
    } catch (error) {
      store.setNotice(error instanceof Error ? error.message : "Unable to encode share link.");
    }
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      store.loadSnapshot(JSON.parse(await file.text()) as LabSnapshot, "JSON model imported.");
    } catch (error) {
      store.setNotice(error instanceof Error ? error.message : "That JSON model is invalid.");
    }
  };

  return (
    <details className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
      <summary className="cursor-pointer text-sm font-bold">Save, share, and interchange</summary>
      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            className="tool-button"
            onClick={() => {
              try {
                saveToLibrary("Saved model", snapshot);
                store.setNotice("Saved in this browser.");
              } catch (error) {
                store.setNotice(error instanceof Error ? error.message : "Unable to save model.");
              }
            }}
            type="button"
          >
            Save locally
          </button>
          <button className="tool-button" onClick={share} type="button">
            Share URL
          </button>
          <button
            className="tool-button"
            onClick={() => download("causal-model.json", snapshotJson(snapshot))}
            type="button"
          >
            Export JSON
          </button>
          <label className="tool-button cursor-pointer text-center">
            Import JSON
            <input
              accept="application/json"
              className="sr-only"
              onChange={(event) => void importJson(event.target.files?.[0])}
              type="file"
            />
          </label>
        </div>
        {library.length > 0 ? (
          <div className="space-y-2 border-t border-[var(--line)] pt-3">
            <p className="font-mono text-[11px] font-bold tracking-[0.12em] text-[var(--signal)]">
              SAVED MODELS
            </p>
            {library.slice(0, 4).map((entry) => (
              <div className="flex items-center gap-2" key={entry.id}>
                <button
                  className="min-w-0 flex-1 truncate rounded-lg border border-[var(--line)] px-2 py-1.5 text-left text-xs font-bold hover:bg-[var(--moss-soft)]"
                  onClick={() => store.loadSnapshot(entry.snapshot, `Loaded ${entry.name}.`)}
                  type="button"
                >
                  {entry.name}
                </button>
                <button
                  className="tool-button px-2 py-1.5 text-xs"
                  onClick={() => {
                    duplicateLibraryEntry(entry);
                    store.setNotice("Saved copy created.");
                  }}
                  type="button"
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="border-t border-[var(--line)] pt-3">
          <div className="flex gap-2">
            <button
              className="tool-button flex-1"
              onClick={() => setDagittyText(exportDagittyText(snapshot))}
              type="button"
            >
              Export DAGitty text
            </button>
            <button
              className="tool-button flex-1"
              onClick={() => {
                try {
                  const result = importDagittyText(dagittyText);
                  store.loadSnapshot(
                    result.snapshot,
                    result.warnings[0] ?? "DAGitty model imported.",
                  );
                } catch (error) {
                  store.setNotice(
                    error instanceof Error ? error.message : "DAGitty text could not be read.",
                  );
                }
              }}
              type="button"
            >
              Import text
            </button>
          </div>
          <textarea
            aria-label="DAGitty model text"
            className="field-input mt-2 min-h-24 font-mono text-xs"
            onChange={(event) => setDagittyText(event.target.value)}
            placeholder='dag { "X" [exposure] ... }'
            value={dagittyText}
          />
        </div>
      </div>
    </details>
  );
}
