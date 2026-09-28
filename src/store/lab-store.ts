"use client";

import { create } from "zustand";
import { EXAMPLE_SNAPSHOTS } from "@/content/examples";
import {
  addEdge,
  addNode,
  removeNode,
  setNodeKind,
  setRoles,
  validateGraph,
  type Graph,
  type NodeKind,
} from "@/engine/graph";
import { assistedLayout } from "@/engine/layout";
import { edgeParameterKey, normalizeScmParameters } from "@/engine/scm";
import { RELIABILITY_MIN } from "@/engine/measurement";
import { pruneLabSnapshot, type LabSnapshot } from "@/lib/codec";

export type LabSurface = "draw" | "prove" | "simulate" | "design" | "communicate";

interface LabStore extends LabSnapshot {
  activeSurface: LabSurface;
  selectedNodeId: string | null;
  edgeStartId: string | null;
  highlightedPathNodeIds: string[] | null;
  notice: string | null;
  past: LabSnapshot[];
  future: LabSnapshot[];
  /**
   * Coalescing key for the newest history entry. A continuous gesture — a
   * pointer drag, a held arrow key — reports one tag for its whole run and so
   * costs a single undo step. Without it a drag pushed one entry per pointer
   * move, and two or three drags evicted every structural edit from the
   * hundred-entry history.
   */
  historyTag: string | null;
  setActiveSurface: (surface: LabSurface) => void;
  selectNode: (id: string | null) => void;
  setHighlightedPath: (nodeIds: string[] | null) => void;
  clearNotice: () => void;
  setNotice: (notice: string | null) => void;
  addNode: (kind?: NodeKind) => void;
  moveNode: (id: string, dx: number, dy: number) => void;
  /** Closes the current gesture so the next one starts its own undo step. */
  endGesture: () => void;
  renameNode: (id: string, name: string) => void;
  setNodeKind: (id: string, kind: NodeKind) => void;
  assignRole: (role: "exposureId" | "outcomeId", id: string) => void;
  deleteNode: (id: string) => void;
  startEdge: (id: string) => void;
  completeEdge: (id: string) => void;
  setConditioning: (ids: string[]) => void;
  setSelection: (selection: LabSnapshot["selection"]) => void;
  setMeasured: (id: string, measured: boolean) => void;
  setReliability: (id: string, reliability: number) => void;
  setCoefficient: (from: string, to: string, value: number) => void;
  setErrorSd: (id: string, value: number) => void;
  setSeed: (seed: number) => void;
  setSampleSize: (n: number) => void;
  loadSnapshot: (snapshot: LabSnapshot, notice?: string) => void;
  loadExample: (slug: keyof typeof EXAMPLE_SNAPSHOTS) => void;
  applyLayoutAssist: () => void;
  undo: () => void;
  redo: () => void;
}

function emptySnapshot(): LabSnapshot {
  return pruneLabSnapshot({
    v: 1,
    graph: { v: 1, nodes: [], edges: [], roles: {} },
    conditioning: [],
    selection: null,
    measured: {},
    reliability: {},
    seed: 314159,
    n: 10_000,
  });
}

function snapshotOf(state: LabSnapshot): LabSnapshot {
  return pruneLabSnapshot({
    v: 1,
    graph: state.graph,
    parameters: state.parameters,
    conditioning: state.conditioning,
    selection: state.selection,
    measured: state.measured,
    reliability: state.reliability,
    seed: state.seed,
    n: state.n,
  });
}

function nextName(graph: Graph): string {
  const used = new Set(graph.nodes.map((node) => node.name.toLocaleLowerCase()));
  let sequence = graph.nodes.length + 1;
  let candidate = `Node ${sequence}`;
  while (used.has(candidate.toLocaleLowerCase())) {
    sequence += 1;
    candidate = `Node ${sequence}`;
  }
  return candidate;
}

function statePatch(
  snapshot: LabSnapshot,
  current: LabStore,
  recordHistory: boolean,
  notice?: string,
  tag: string | null = null,
) {
  const continuesGesture = recordHistory && tag !== null && tag === current.historyTag;
  return {
    ...snapshot,
    selectedNodeId:
      current.selectedNodeId &&
      snapshot.graph.nodes.some((node) => node.id === current.selectedNodeId)
        ? current.selectedNodeId
        : null,
    edgeStartId:
      current.edgeStartId && snapshot.graph.nodes.some((node) => node.id === current.edgeStartId)
        ? current.edgeStartId
        : null,
    highlightedPathNodeIds: current.highlightedPathNodeIds?.every((id) =>
      snapshot.graph.nodes.some((node) => node.id === id),
    )
      ? current.highlightedPathNodeIds
      : null,
    past:
      recordHistory && !continuesGesture
        ? [...current.past.slice(-99), snapshotOf(current)]
        : current.past,
    future: recordHistory ? [] : current.future,
    historyTag: recordHistory ? tag : null,
    notice: notice ?? current.notice,
  };
}

export const useLabStore = create<LabStore>((set, get) => {
  const initial = emptySnapshot();
  const apply = (
    next: LabSnapshot,
    recordHistory = true,
    notice?: string,
    tag: string | null = null,
  ) => {
    const current = get();
    const sanitized = pruneLabSnapshot(next);
    set(statePatch(sanitized, current, recordHistory, notice, tag));
  };
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (error) {
      set({ notice: error instanceof Error ? error.message : "The edit could not be applied." });
    }
  };
  return {
    ...initial,
    activeSurface: "draw",
    selectedNodeId: null,
    edgeStartId: null,
    highlightedPathNodeIds: null,
    notice: null,
    past: [],
    future: [],
    historyTag: null,
    setActiveSurface: (activeSurface) => set({ activeSurface }),
    // Moving focus/selection between nodes must NOT cancel an in-progress edge:
    // the "E → navigate → Enter" workflow depends on edgeStartId surviving the
    // arrow-key navigation (and the node's onFocus) to the target. Only an
    // explicit deselect (id === null, e.g. a background click) cancels it.
    selectNode: (selectedNodeId) =>
      set((current) => ({
        selectedNodeId,
        edgeStartId: selectedNodeId === null ? null : current.edgeStartId,
      })),
    setHighlightedPath: (highlightedPathNodeIds) => set({ highlightedPathNodeIds }),
    clearNotice: () => set({ notice: null }),
    setNotice: (notice) => set({ notice }),
    addNode: (kind = "observed") =>
      attempt(() => {
        const current = get();
        const index = current.graph.nodes.length;
        const graph = addNode(current.graph, {
          name: nextName(current.graph),
          kind,
          position: { x: 130 + (index % 4) * 140, y: 140 + Math.floor(index / 4) * 130 },
        });
        const selectedNodeId = graph.nodes.at(-1)?.id ?? null;
        apply({ ...snapshotOf(current), graph }, true, `${kind} node added.`);
        set({ selectedNodeId });
      }),
    moveNode: (id, dx, dy) =>
      attempt(() => {
        const current = get();
        const graph = validateGraph({
          ...current.graph,
          nodes: current.graph.nodes.map((node) =>
            node.id === id
              ? {
                  ...node,
                  position: {
                    x: Math.round(((node.position?.x ?? 100) + dx) / 8) * 8,
                    y: Math.round(((node.position?.y ?? 100) + dy) / 8) * 8,
                  },
                }
              : node,
          ),
        });
        // One drag is one undo step: every move in the run shares this tag,
        // and the canvas closes the run on pointer-up.
        apply({ ...snapshotOf(current), graph }, true, undefined, `move:${id}`);
      }),
    endGesture: () => {
      if (get().historyTag !== null) set({ historyTag: null });
    },
    renameNode: (id, name) =>
      attempt(() => {
        const current = get();
        const graph = validateGraph({
          ...current.graph,
          nodes: current.graph.nodes.map((node) => (node.id === id ? { ...node, name } : node)),
        });
        apply({ ...snapshotOf(current), graph });
      }),
    setNodeKind: (id, kind) =>
      attempt(() => {
        const current = get();
        apply({ ...snapshotOf(current), graph: setNodeKind(current.graph, id, kind) });
      }),
    assignRole: (role, id) =>
      attempt(() => {
        const current = get();
        const graph = setRoles(current.graph, { [role]: id });
        apply(
          { ...snapshotOf(current), graph },
          true,
          `${role === "exposureId" ? "Exposure" : "Outcome"} set.`,
        );
      }),
    deleteNode: (id) =>
      attempt(() => {
        const current = get();
        apply(
          { ...snapshotOf(current), graph: removeNode(current.graph, id) },
          true,
          "Node deleted.",
        );
      }),
    startEdge: (id) =>
      set({ edgeStartId: id, selectedNodeId: id, notice: "Choose an edge target." }),
    completeEdge: (id) =>
      attempt(() => {
        const current = get();
        if (!current.edgeStartId) {
          set({ notice: "Start edge mode from a source node first." });
          return;
        }
        const graph = addEdge(current.graph, { from: current.edgeStartId, to: id });
        apply({ ...snapshotOf(current), graph }, true, "Causal edge added.");
        set({ edgeStartId: null, selectedNodeId: id });
      }),
    setConditioning: (ids) => {
      const current = get();
      apply({ ...snapshotOf(current), conditioning: ids }, false);
    },
    setSelection: (selection) => {
      const current = get();
      apply({ ...snapshotOf(current), selection }, false);
    },
    setMeasured: (id, measured) => {
      const current = get();
      const node = current.graph.nodes.find((candidate) => candidate.id === id);
      if (
        !node ||
        node.id === current.graph.roles.exposureId ||
        node.id === current.graph.roles.outcomeId
      ) {
        set({ notice: "The design must measure its exposure and outcome." });
        return;
      }
      apply({ ...snapshotOf(current), measured: { ...current.measured, [id]: measured } }, false);
    },
    setReliability: (id, reliability) => {
      const current = get();
      const node = current.graph.nodes.find((candidate) => candidate.id === id);
      if (!node || node.kind !== "observed") {
        set({ notice: "Only an observed node can carry a measurement reliability." });
        return;
      }
      const clamped = Math.min(1, Math.max(RELIABILITY_MIN, reliability));
      apply(
        { ...snapshotOf(current), reliability: { ...current.reliability, [id]: clamped } },
        false,
      );
    },
    setCoefficient: (from, to, value) =>
      attempt(() => {
        const current = get();
        const parameters = normalizeScmParameters(current.graph, {
          ...current.parameters,
          edgeCoefficients: {
            ...current.parameters.edgeCoefficients,
            [edgeParameterKey(from, to)]: value,
          },
        });
        apply({ ...snapshotOf(current), parameters }, false);
      }),
    setErrorSd: (id, value) =>
      attempt(() => {
        const current = get();
        const parameters = normalizeScmParameters(current.graph, {
          ...current.parameters,
          errorSds: { ...current.parameters.errorSds, [id]: value },
        });
        apply({ ...snapshotOf(current), parameters }, false);
      }),
    // A number field emits its interim value on every keystroke — empty while
    // being cleared, out of range while being retyped, fractional if typed that
    // way. The snapshot contract rejects all three, so they are refused with a
    // notice here; letting them reach it threw an uncaught schema error out of
    // the change handler and left the field showing a value the store never took.
    setSeed: (seed) => {
      const current = get();
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
        set({ notice: "The seed must be a whole number from 0 to 4,294,967,295." });
        return;
      }
      apply({ ...snapshotOf(current), seed }, false);
    },
    setSampleSize: (n) => {
      const current = get();
      if (!Number.isInteger(n) || n < 100 || n > 1_000_000) {
        set({ notice: "Rows must be a whole number from 100 to 1,000,000." });
        return;
      }
      apply({ ...snapshotOf(current), n }, false);
    },
    loadSnapshot: (snapshot, notice = "Model loaded.") => apply(snapshot, true, notice),
    loadExample: (slug) => apply(EXAMPLE_SNAPSHOTS[slug], true, "Example loaded."),
    applyLayoutAssist: () => {
      const current = get();
      apply(
        { ...snapshotOf(current), graph: assistedLayout(current.graph) },
        true,
        "Layout assist applied.",
      );
    },
    undo: () => {
      const current = get();
      const previous = current.past.at(-1);
      if (!previous) return;
      set({
        ...previous,
        past: current.past.slice(0, -1),
        future: [snapshotOf(current), ...current.future].slice(0, 100),
        historyTag: null,
        selectedNodeId: null,
        edgeStartId: null,
        notice: "Undid graph edit.",
      });
    },
    redo: () => {
      const current = get();
      const next = current.future[0];
      if (!next) return;
      set({
        ...next,
        past: [...current.past, snapshotOf(current)].slice(-100),
        future: current.future.slice(1),
        historyTag: null,
        selectedNodeId: null,
        edgeStartId: null,
        notice: "Redid graph edit.",
      });
    },
  };
});
