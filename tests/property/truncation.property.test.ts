import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateGraph, type Graph, type GraphNode } from "@/engine/graph";
import { defaultScmParameters, matrixTotalEffect } from "@/engine/scm";
import { runSimulation } from "@/engine/sim";
import { olsEstimand, olsStandardError } from "@/engine/stats";
import { truncateCovariance } from "@/engine/truncation";

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

function selectionDagFromSeed(seed: number): Graph {
  const random = seededUniform(seed);
  const middleCount = 1 + Math.floor(random() * 4);
  const nodes: GraphNode[] = [
    { id: "x", idx: 0, name: "X", kind: "observed" },
    ...Array.from({ length: middleCount }, (_, index) => ({
      id: `c${index}`,
      idx: index + 1,
      name: `C${index + 1}`,
      kind: "observed" as const,
    })),
    { id: "y", idx: middleCount + 1, name: "Y", kind: "observed" },
    { id: "s", idx: middleCount + 2, name: "S", kind: "selection" },
  ];
  const yIndex = middleCount + 1;
  const edges: Graph["edges"] = [
    { from: "x", to: "y" },
    { from: "x", to: "s" },
    { from: "y", to: "s" },
  ];
  for (let from = 0; from <= yIndex; from += 1) {
    for (let to = from + 1; to <= yIndex; to += 1) {
      const source = nodes[from]!.id;
      const target = nodes[to]!.id;
      if (source === "x" && target === "y") continue;
      if (random() < 0.2) edges.push({ from: source, to: target });
    }
  }
  return validateGraph({
    v: 1,
    nodes,
    edges,
    roles: { exposureId: "x", outcomeId: "y" },
  });
}

describe("selected-sample truncation agrees with its population target", () => {
  it("keeps realized OLS within four standard errors on seeded random selection DAGs", () => {
    // The committed seed list varies both topology and coefficients. No advanced seed is skipped;
    // every run retains well over the 50-row minimum required by the readout contract.
    fc.assert(
      fc.property(
        fc.constantFrom(0x801, 0x802, 0x803, 0x804, 0x805, 0x806, 0x807, 0x808),
        (seed) => {
          const graph = selectionDagFromSeed(seed);
          const random = seededUniform(seed ^ 0x8_000);
          const parameters = defaultScmParameters(graph);
          for (const key of Object.keys(parameters.edgeCoefficients)) {
            parameters.edgeCoefficients[key] = 0.15 + random() * 0.3;
          }
          const selection = { nodeId: "s", quantile: 0.6 };
          const run = runSimulation(graph, parameters, "x", "y", { seed, n: 5_000, selection });
          const totalEffect = matrixTotalEffect(run.model, "x", "y");
          const target = olsEstimand(
            truncateCovariance(run.model, selection),
            "x",
            "y",
            [],
            totalEffect,
          ).estimand;
          expect(run.sample.sampleSize).toBeGreaterThanOrEqual(50);
          const estimate = olsEstimand(run.sample, "x", "y", [], totalEffect).estimand;
          const standardError = olsStandardError(run.sample, "x", "y", [], run.sample.sampleSize);
          expect(Math.abs(estimate - target)).toBeLessThanOrEqual(4 * standardError);
        },
      ),
      { seed: 0x508, numRuns: 8 },
    );
  });
});
