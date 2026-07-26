import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { enumerateAdjustmentSets } from "@/engine/adjust";
import { enumerateConditionalInstruments } from "@/engine/iv";
import { validateGraph, type Graph, type GraphNode } from "@/engine/graph";
import {
  auditScmIntegrity,
  buildScmModel,
  defaultScmParameters,
  matrixTotalEffect,
} from "@/engine/scm";
import { ivMultiplicativeIdentity, olsEstimand } from "@/engine/stats";

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

function graphFromSeed(seed: number): Graph {
  const random = seededUniform(seed);
  const count = 3 + Math.floor(random() * 7);
  const nodes: GraphNode[] = Array.from({ length: count }, (_, idx) => ({
    id: `n${idx}`,
    idx,
    name: `N${idx}`,
    kind: idx === 0 || idx === count - 1 || random() > 0.3 ? "observed" : "latent",
  }));
  const edges: Graph["edges"] = [];
  for (let from = 0; from < count; from += 1) {
    for (let to = from + 1; to < count; to += 1) {
      if (random() < 0.25 && edges.length < 24) edges.push({ from: `n${from}`, to: `n${to}` });
    }
  }
  return validateGraph({
    v: 1,
    nodes,
    edges,
    roles: { exposureId: "n0", outcomeId: `n${count - 1}` },
  });
}

function moderateParameters(graph: Graph) {
  const parameters = defaultScmParameters(graph);
  for (const key of Object.keys(parameters.edgeCoefficients))
    parameters.edgeCoefficients[key] = 0.35;
  return parameters;
}

describe("PROP-4 through PROP-6", () => {
  it("keeps trek/matrix covariance and path/matrix total effect identical", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const graph = graphFromSeed(seed);
        const model = buildScmModel(graph, moderateParameters(graph));
        const audit = auditScmIntegrity(model, "n0", `n${graph.nodes.length - 1}`);
        expect(audit.covarianceAgrees).toBe(true);
        expect(audit.totalEffectAgrees).toBe(true);
        expect(audit.illConditioned).toBe(false);
      }),
      { seed: 0x304, numRuns: 100 },
    );
  });

  it("gives every graphically valid adjustment set zero population bias", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const graph = graphFromSeed(seed);
        const model = buildScmModel(graph, moderateParameters(graph));
        const totalEffect = matrixTotalEffect(model, "n0", `n${graph.nodes.length - 1}`);
        for (const set of enumerateAdjustmentSets(graph, "n0", `n${graph.nodes.length - 1}`)
          .minimalSets) {
          expect(
            olsEstimand(model, "n0", `n${graph.nodes.length - 1}`, set, totalEffect).populationBias,
          ).toBeCloseTo(0, 8);
        }
      }),
      { seed: 0x305, numRuns: 100 },
    );
  });

  it("gives every graphically valid conditional IV the division-free identity", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const graph = graphFromSeed(seed);
        const model = buildScmModel(graph, moderateParameters(graph));
        const totalEffect = matrixTotalEffect(model, "n0", `n${graph.nodes.length - 1}`);
        for (const instrument of enumerateConditionalInstruments(
          graph,
          "n0",
          `n${graph.nodes.length - 1}`,
        )) {
          for (const conditionedIds of instrument.conditioningSets) {
            expect(
              ivMultiplicativeIdentity(
                model,
                instrument.instrumentId,
                "n0",
                `n${graph.nodes.length - 1}`,
                conditionedIds,
                totalEffect,
              ),
            ).toBeCloseTo(0, 8);
          }
        }
      }),
      { seed: 0x306, numRuns: 100 },
    );
  });
});
