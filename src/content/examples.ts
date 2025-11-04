import { defaultScmParameters, edgeParameterKey } from "@/engine/scm";
import { pruneLabSnapshot, type LabSnapshot } from "@/lib/codec";

function mBias(): LabSnapshot {
  const graph = {
    v: 1 as const,
    nodes: [
      { id: "u1", idx: 0, name: "U1", kind: "latent" as const, position: { x: 115, y: 130 } },
      { id: "u2", idx: 1, name: "U2", kind: "latent" as const, position: { x: 115, y: 360 } },
      { id: "x", idx: 2, name: "X", kind: "observed" as const, position: { x: 355, y: 120 } },
      { id: "m", idx: 3, name: "M", kind: "observed" as const, position: { x: 370, y: 250 } },
      { id: "y", idx: 4, name: "Y", kind: "observed" as const, position: { x: 625, y: 245 } },
    ],
    edges: [
      { from: "u1", to: "x" },
      { from: "u1", to: "m" },
      { from: "u2", to: "m" },
      { from: "u2", to: "y" },
    ],
    roles: { exposureId: "x", outcomeId: "y" },
  };
  const parameters = defaultScmParameters(graph);
  for (const edge of graph.edges)
    parameters.edgeCoefficients[edgeParameterKey(edge.from, edge.to)] = 0.5;
  return pruneLabSnapshot({
    v: 1,
    graph,
    parameters,
    conditioning: [],
    selection: null,
    measured: {},
    seed: 314159,
    n: 10_000,
  });
}

function chain(): LabSnapshot {
  const graph = {
    v: 1 as const,
    nodes: [
      { id: "x", idx: 0, name: "X", kind: "observed" as const, position: { x: 150, y: 250 } },
      { id: "m", idx: 1, name: "M", kind: "observed" as const, position: { x: 380, y: 250 } },
      { id: "y", idx: 2, name: "Y", kind: "observed" as const, position: { x: 610, y: 250 } },
    ],
    edges: [
      { from: "x", to: "m" },
      { from: "m", to: "y" },
    ],
    roles: { exposureId: "x", outcomeId: "y" },
  };
  return pruneLabSnapshot({
    v: 1,
    graph,
    parameters: defaultScmParameters(graph),
    conditioning: [],
    selection: null,
    measured: {},
    seed: 314159,
    n: 10_000,
  });
}

export const EXAMPLE_SNAPSHOTS = {
  "m-bias": mBias(),
  chain: chain(),
} as const;

export const EXAMPLE_GALLERY = [
  {
    slug: "m-bias",
    title: "M-bias",
    description: "Adjusting for M opens an otherwise closed path.",
  },
  { slug: "chain", title: "Mediation", description: "A simple total effect through a mediator." },
] as const;
