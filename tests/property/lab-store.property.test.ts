import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pruneLabSnapshot } from "@/lib/codec";
import { useLabStore } from "@/store/lab-store";

function resetStore() {
  const snapshot = pruneLabSnapshot({
    v: 1,
    graph: { v: 1, nodes: [], edges: [], roles: {} },
    conditioning: [],
    selection: null,
    measured: {},
    seed: 314159,
    n: 10_000,
  });
  useLabStore.setState({
    ...snapshot,
    activeSurface: "draw",
    selectedNodeId: null,
    edgeStartId: null,
    notice: null,
    past: [],
    future: [],
  });
}

function assertIntegrity() {
  const state = useLabStore.getState();
  const snapshot = pruneLabSnapshot({
    v: 1,
    graph: state.graph,
    parameters: state.parameters,
    conditioning: state.conditioning,
    selection: state.selection,
    measured: state.measured,
    seed: state.seed,
    n: state.n,
  });
  expect(snapshot.conditioning).toEqual(state.conditioning);
  expect(snapshot.selection).toEqual(state.selection);
  expect(snapshot.measured).toEqual(state.measured);
}

describe("shared-lab mutation integrity", () => {
  it("purges dangling conditioning, measurement, and selection references on deletion", () => {
    resetStore();
    const store = useLabStore.getState();
    store.addNode();
    store.addNode();
    store.addNode("selection");
    store.setConditioning(["node-1"]);
    store.setMeasured("node-1", false);
    store.setSelection({ nodeId: "node-2", quantile: 0.7 });
    store.deleteNode("node-1");
    store.deleteNode("node-2");
    const state = useLabStore.getState();
    expect(state.conditioning).toEqual([]);
    expect(state.selection).toBeNull();
    expect(state.measured["node-1"]).toBeUndefined();
  });

  it("never leaves a random mutation sequence in an invalid referential state", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("add", "condition", "select", "measure", "delete", "kind"), {
          minLength: 1,
          maxLength: 35,
        }),
        (operations) => {
          resetStore();
          for (const operation of operations) {
            const state = useLabStore.getState();
            const nodes = state.graph.nodes;
            if (operation === "add" && nodes.length < 12)
              state.addNode(nodes.length % 3 === 2 ? "selection" : "observed");
            if (operation === "condition") {
              const node = nodes.find((candidate) => candidate.kind === "observed");
              if (node) state.setConditioning([node.id]);
            }
            if (operation === "select") {
              const node = nodes.find((candidate) => candidate.kind === "selection");
              if (node) state.setSelection({ nodeId: node.id, quantile: 0.6 });
            }
            if (operation === "measure") {
              const node = nodes.find((candidate) => candidate.kind === "observed");
              if (node) state.setMeasured(node.id, false);
            }
            if (operation === "kind") {
              const node = nodes.find(
                (candidate) =>
                  candidate.kind === "observed" &&
                  candidate.id !== state.graph.roles.exposureId &&
                  candidate.id !== state.graph.roles.outcomeId,
              );
              if (node) state.setNodeKind(node.id, "latent");
            }
            if (operation === "delete" && nodes.length > 0)
              state.deleteNode(nodes[nodes.length - 1].id);
            assertIntegrity();
          }
        },
      ),
      { seed: 0x411, numRuns: 75 },
    );
  });
});
