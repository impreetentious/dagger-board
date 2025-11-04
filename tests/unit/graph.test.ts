import { describe, expect, it } from "vitest";
import {
  EMPTY_GRAPH,
  GraphMutationError,
  addEdge,
  addNode,
  ancestorsOf,
  descendantsOf,
  removeNode,
  setRoles,
  topologicalOrder,
} from "@/engine/graph";

describe("graph core", () => {
  it("maintains stable idx order and rejects cycles", () => {
    let graph = addNode(EMPTY_GRAPH, { id: "x", name: "X", kind: "observed" });
    graph = addNode(graph, { id: "m", name: "M", kind: "observed" });
    graph = addNode(graph, { id: "y", name: "Y", kind: "observed" });
    graph = addEdge(graph, { from: "x", to: "m" });
    graph = addEdge(graph, { from: "m", to: "y" });
    graph = setRoles(graph, { exposureId: "x", outcomeId: "y" });

    expect(topologicalOrder(graph)).toEqual(["x", "m", "y"]);
    expect([...ancestorsOf(graph, ["y"])]).toEqual(["y", "m", "x"]);
    expect([...descendantsOf(graph, ["x"])]).toEqual(["x", "m", "y"]);
    expect(() => addEdge(graph, { from: "y", to: "x" })).toThrow(GraphMutationError);
  });

  it("clears roles and incident edges when a designated node is deleted", () => {
    let graph = addNode(EMPTY_GRAPH, { id: "x", name: "X", kind: "observed" });
    graph = addNode(graph, { id: "y", name: "Y", kind: "observed" });
    graph = addEdge(graph, { from: "x", to: "y" });
    graph = setRoles(graph, { exposureId: "x", outcomeId: "y" });

    const next = removeNode(graph, "x");
    expect(next.roles.exposureId).toBeUndefined();
    expect(next.edges).toEqual([]);
  });
});
