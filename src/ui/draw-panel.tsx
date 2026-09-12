"use client";

import { useState } from "react";
import { useLabStore } from "@/store/lab-store";
import { InteropPanel } from "@/ui/interop-panel";

const nodeKinds = [
  ["observed", "Observed"],
  ["latent", "Latent"],
  ["selection", "Selection"],
] as const;

export function DrawPanel() {
  const graph = useLabStore((state) => state.graph);
  const selectedNodeId = useLabStore((state) => state.selectedNodeId);
  const edgeStartId = useLabStore((state) => state.edgeStartId);
  const addNode = useLabStore((state) => state.addNode);
  const startEdge = useLabStore((state) => state.startEdge);
  const renameNode = useLabStore((state) => state.renameNode);
  const setNodeKind = useLabStore((state) => state.setNodeKind);
  const assignRole = useLabStore((state) => state.assignRole);
  const deleteNode = useLabStore((state) => state.deleteNode);
  const undo = useLabStore((state) => state.undo);
  const redo = useLabStore((state) => state.redo);
  const loadExample = useLabStore((state) => state.loadExample);
  const applyLayoutAssist = useLabStore((state) => state.applyLayoutAssist);
  const selected = graph.nodes.find((node) => node.id === selectedNodeId);
  const [name, setName] = useState("");

  const commitName = () => {
    if (selected && name.trim()) renameNode(selected.id, name.trim());
  };

  return (
    <section aria-labelledby="draw-panel-title" className="space-y-5">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">DRAW</p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.05em]" id="draw-panel-title">
          Make the assumption inspectable.
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {nodeKinds.map(([kind, label]) => (
          <button className="tool-button" key={kind} onClick={() => addNode(kind)} type="button">
            + {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="tool-button"
          disabled={!selected}
          onClick={() => selected && startEdge(selected.id)}
          type="button"
        >
          {edgeStartId ? "Pick target" : "Draw edge"}
        </button>
        <button className="tool-button" onClick={() => loadExample("m-bias")} type="button">
          Load M-bias
        </button>
        <button className="tool-button" onClick={undo} type="button">
          Undo
        </button>
        <button className="tool-button" onClick={redo} type="button">
          Redo
        </button>
        <button
          className="tool-button col-span-2"
          disabled={graph.nodes.length === 0}
          onClick={applyLayoutAssist}
          type="button"
        >
          Arrange layers
        </button>
      </div>

      {selected ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
          <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--signal)]">
            ACTIVE NODE
          </p>
          <label className="mt-3 block text-sm font-bold" htmlFor="node-name">
            Name
          </label>
          <input
            className="field-input mt-1"
            defaultValue={selected.name}
            id="node-name"
            key={selected.id}
            maxLength={64}
            onBlur={commitName}
            onChange={(event) => setName(event.target.value)}
            onFocus={() => setName(selected.name)}
          />
          <label className="mt-4 block text-sm font-bold" htmlFor="node-kind">
            Kind
          </label>
          <select
            className="field-input mt-1"
            id="node-kind"
            onChange={(event) =>
              setNodeKind(selected.id, event.target.value as typeof selected.kind)
            }
            value={selected.kind}
          >
            {nodeKinds.map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              className="tool-button"
              onClick={() => assignRole("exposureId", selected.id)}
              type="button"
            >
              Set X
            </button>
            <button
              className="tool-button"
              onClick={() => assignRole("outcomeId", selected.id)}
              type="button"
            >
              Set Y
            </button>
          </div>
          <button
            className="mt-2 w-full rounded-xl border border-[var(--signal)] px-3 py-2 text-sm font-bold text-[var(--signal)] hover:bg-[var(--signal-soft)]"
            onClick={() => deleteNode(selected.id)}
            type="button"
          >
            Delete node
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-4 text-sm leading-6 text-[var(--muted)]">
          Select a node to rename it, assign X/Y, change its kind, or begin an edge.
        </div>
      )}
      <InteropPanel />
    </section>
  );
}
