import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateGraph, type Graph, type GraphNode } from "@/engine/graph";
import { defaultScmParameters, buildScmModel } from "@/engine/scm";
import { generateSimulationData } from "@/engine/sim";
import {
  decodeGraphFragment,
  encodeGraphFragment,
  pruneLabSnapshot,
  type LabSnapshot,
} from "@/lib/codec";
import { exportDagittyText, importDagittyText } from "@/lib/dagitty-io";

function seededUniform(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };
}

function snapshotFromSeed(seed: number): LabSnapshot {
  const random = seededUniform(seed);
  const count = 3 + Math.floor(random() * 6);
  const nodes: GraphNode[] = Array.from({ length: count }, (_, idx) => ({
    id: `n${idx}`,
    idx,
    name: `N${idx}`,
    kind: idx === 0 || idx === count - 1 || random() > 0.3 ? "observed" : "latent",
    position: { x: 100 + idx * 80, y: 140 + (idx % 2) * 90 },
  }));
  const edges: Graph["edges"] = [];
  for (let from = 0; from < count; from += 1) {
    for (let to = from + 1; to < count; to += 1) {
      if (random() < 0.28 && edges.length < 24) edges.push({ from: `n${from}`, to: `n${to}` });
    }
  }
  const graph = validateGraph({
    v: 1,
    nodes,
    edges,
    roles: { exposureId: "n0", outcomeId: `n${count - 1}` },
  });
  return pruneLabSnapshot({
    v: 1,
    graph,
    parameters: defaultScmParameters(graph),
    conditioning: graph.nodes
      .filter((node) => node.kind === "observed" && node.id !== "n0" && node.id !== `n${count - 1}`)
      .filter(() => random() > 0.6)
      .map((node) => node.id),
    selection: null,
    measured: {},
    seed: 314159,
    n: 100,
  });
}

function structureByName(snapshot: LabSnapshot) {
  const name = new Map(snapshot.graph.nodes.map((node) => [node.id, node.name]));
  return {
    nodes: snapshot.graph.nodes.map((node) => ({ name: node.name, kind: node.kind })),
    edges: snapshot.graph.edges.map((edge) => ({
      from: name.get(edge.from),
      to: name.get(edge.to),
    })),
    roles: {
      exposure: name.get(snapshot.graph.roles.exposureId ?? ""),
      outcome: name.get(snapshot.graph.roles.outcomeId ?? ""),
    },
    conditioning: snapshot.conditioning.map((id) => name.get(id)),
  };
}

describe("PROP-9 and PROP-10: randomized codec and DAGitty interop", () => {
  it("PROP-9 preserves idx and seeded simulation output across URL round-trips", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), async (seed) => {
        const original = snapshotFromSeed(seed);
        const decoded = await decodeGraphFragment(await encodeGraphFragment(original));
        expect(decoded.graph.nodes.map((node) => node.idx)).toEqual(
          original.graph.nodes.map((node) => node.idx),
        );

        const permuted = pruneLabSnapshot({
          ...original,
          graph: { ...original.graph, edges: [...original.graph.edges].reverse() },
        });
        const first = generateSimulationData(buildScmModel(original.graph, original.parameters), {
          seed: 0x509,
          n: 100,
        });
        const second = generateSimulationData(buildScmModel(permuted.graph, permuted.parameters), {
          seed: 0x509,
          n: 100,
        });
        for (const id of first.nodeIds)
          expect([...first.columns.get(id)!]).toEqual([...second.columns.get(id)!]);
      }),
      { seed: 0x509, numRuns: 50 },
    );
  });

  it("PROP-10 preserves representable structure, kind, roles, and adjustments", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const original = snapshotFromSeed(seed);
        const imported = importDagittyText(exportDagittyText(original));
        expect(structureByName(imported.snapshot)).toEqual(structureByName(original));
      }),
      { seed: 0x510, numRuns: 100 },
    );
  });
});
