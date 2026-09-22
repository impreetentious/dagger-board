import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dSeparatedBayesBall, dSeparatedByPaths } from "@/engine/dsep";
import { hasEdge, validateGraph, type Graph, type GraphNode } from "@/engine/graph";
import { enumerateSimplePaths } from "@/engine/paths";

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };
}

function graphFromSeed(seed: number): Graph {
  const random = mulberry32(seed);
  const count = 3 + Math.floor(random() * 10);
  const nodes: GraphNode[] = Array.from({ length: count }, (_, idx) => ({
    id: `n${idx}`,
    idx,
    name: `N${idx}`,
    kind:
      idx === 0 || idx === count - 1 || random() > 0.2
        ? "observed"
        : random() > 0.5
          ? "latent"
          : "selection",
  }));
  const edges = [] as Graph["edges"];
  for (let from = 0; from < count; from += 1) {
    for (let to = from + 1; to < count; to += 1) {
      if (random() < 0.27 && edges.length < 24) edges.push({ from: `n${from}`, to: `n${to}` });
    }
  }
  return validateGraph({
    v: 1,
    nodes,
    edges,
    roles: { exposureId: "n0", outcomeId: `n${count - 1}` },
  });
}

function queryFor(graph: Graph, seed: number) {
  const random = mulberry32(seed);
  const from = graph.nodes[Math.floor(random() * graph.nodes.length)]?.id ?? "n0";
  const to =
    graph.nodes.find((node) => node.id !== from && node.kind === "observed")?.id ??
    graph.nodes[1]?.id ??
    "n1";
  const conditioned = new Set(
    graph.nodes
      .filter(
        (node) => node.kind === "observed" && node.id !== from && node.id !== to && random() > 0.55,
      )
      .map((node) => node.id),
  );
  const selectionNode = graph.nodes.find((node) => node.kind === "selection" && random() > 0.5);
  return {
    from,
    to,
    conditioned,
    selection: selectionNode ? { nodeId: selectionNode.id } : undefined,
  };
}

describe("d-separation implementation agreement", () => {
  it("matches exhaustive simple-path evaluation across seeded random DAGs", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (graphSeed, querySeed) => {
        const graph = graphFromSeed(graphSeed);
        const query = queryFor(graph, querySeed);
        expect(
          dSeparatedBayesBall(graph, query.from, query.to, query.conditioned, query.selection),
        ).toBe(dSeparatedByPaths(graph, query.from, query.to, query.conditioned, query.selection));
      }),
      { seed: 0x51a7, numRuns: 200 },
    );
  });

  it("enumerates only simple, edge-connected witnesses", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const graph = graphFromSeed(seed);
        const paths = enumerateSimplePaths(
          graph,
          graph.roles.exposureId ?? "n0",
          graph.roles.outcomeId ?? "n1",
        );
        for (const path of paths) {
          expect(new Set(path.nodeIds).size).toBe(path.nodeIds.length);
          for (let index = 0; index < path.nodeIds.length - 1; index += 1) {
            const from = path.nodeIds[index];
            const to = path.nodeIds[index + 1];
            expect(hasEdge(graph, from, to) || hasEdge(graph, to, from)).toBe(true);
          }
        }
      }),
      { seed: 0x5197, numRuns: 100 },
    );
  });
});
