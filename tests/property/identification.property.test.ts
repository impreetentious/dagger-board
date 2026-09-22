import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkAdjustmentSet, enumerateAdjustmentSets } from "@/engine/adjust";
import { dSeparatedBayesBall } from "@/engine/dsep";
import { enumerateImpliedConditionalIndependencies } from "@/engine/implications";
import { validateGraph, type Graph, type GraphNode } from "@/engine/graph";

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
  const count = 3 + Math.floor(random() * 8);
  const nodes: GraphNode[] = Array.from({ length: count }, (_, idx) => ({
    id: `n${idx}`,
    idx,
    name: `N${idx}`,
    kind: idx === 0 || idx === count - 1 || random() > 0.25 ? "observed" : "latent",
  }));
  const edges = [] as Graph["edges"];
  for (let from = 0; from < count; from += 1) {
    for (let to = from + 1; to < count; to += 1) {
      if (random() < 0.28 && edges.length < 24) edges.push({ from: `n${from}`, to: `n${to}` });
    }
  }
  return validateGraph({
    v: 1,
    nodes,
    edges,
    roles: { exposureId: "n0", outcomeId: `n${count - 1}` },
  });
}

describe("graphical identification properties", () => {
  it("returns only valid, inclusion-minimal adjustment sets and validates canonical existence", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const graph = graphFromSeed(seed);
        const exposureId = graph.roles.exposureId ?? "n0";
        const outcomeId = graph.roles.outcomeId ?? "n1";
        const result = enumerateAdjustmentSets(graph, exposureId, outcomeId);
        for (const set of result.minimalSets) {
          expect(checkAdjustmentSet(graph, exposureId, outcomeId, new Set(set)).valid).toBe(true);
          for (const nodeId of set) {
            expect(
              checkAdjustmentSet(
                graph,
                exposureId,
                outcomeId,
                new Set(set.filter((id) => id !== nodeId)),
              ).valid,
            ).toBe(false);
          }
        }
        expect(result.minimalSets.length > 0).toBe(result.canonicalSetValid);
      }),
      { seed: 0x2a02, numRuns: 150 },
    );
  });

  it("emits only minimal conditional independencies that re-verify by d-separation", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const graph = graphFromSeed(seed);
        for (const implication of enumerateImpliedConditionalIndependencies(graph)) {
          expect(
            dSeparatedBayesBall(
              graph,
              implication.leftId,
              implication.rightId,
              new Set(implication.separatorIds),
            ),
          ).toBe(true);
          for (const nodeId of implication.separatorIds) {
            expect(
              dSeparatedBayesBall(
                graph,
                implication.leftId,
                implication.rightId,
                new Set(implication.separatorIds.filter((id) => id !== nodeId)),
              ),
            ).toBe(false);
          }
        }
      }),
      { seed: 0x207, numRuns: 120 },
    );
  });
});
