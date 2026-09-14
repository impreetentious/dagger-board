import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { proveGraph } from "@/engine/prove";
import { buildScmModel, covarianceAt, edgeParameterKey, matrixTotalEffect } from "@/engine/scm";
import { observedNodeIds, type Graph } from "@/engine/graph";
import {
  findWitnessPair,
  WITNESS_COVARIANCE_TOLERANCE,
  WITNESS_EFFECT_SEPARATION,
} from "@/engine/witness";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

function fixture(file: string): Graph {
  const path = fileURLToPath(new URL(`../../fixtures/tier1/${file}`, import.meta.url));
  return Tier1FixtureSchema.parse(JSON.parse(readFileSync(path, "utf8"))).graph;
}

/** Latent U confounds X and Y, and there is an X → Y edge to be uncertain about. */
function unidentifiedGraph(): Graph {
  const graph = fixture("13-no-adjustment.json");
  return { ...graph, edges: [...graph.edges, { from: "x", to: "y" }] };
}

const COEFFICIENTS = {
  [edgeParameterKey("u", "x")]: 0.7,
  [edgeParameterKey("u", "y")]: 0.7,
  [edgeParameterKey("x", "y")]: 0.6,
};

const PARAMETERS = {
  v: 1 as const,
  edgeCoefficients: COEFFICIENTS,
  errorSds: { u: 1, x: 1, y: 1 },
};

describe("non-identification witnesses", () => {
  it("only has work to do where the verdict says the effect is not identified", () => {
    const graph = unidentifiedGraph();
    expect(proveGraph(graph, new Set()).verdict).toBe("unsupported");
  });

  /**
   * The claim a witness makes is precise, so the test checks precisely that claim: every
   * observable covariance agrees to tolerance, and the total effect does not.
   */
  it("produces two parameterizations that agree on everything observable", () => {
    const graph = unidentifiedGraph();
    const witness = findWitnessPair({ graph, parameters: PARAMETERS });

    expect(witness.status).toBe("found");
    expect(witness.observedCovarianceGap).toBeLessThanOrEqual(WITNESS_COVARIANCE_TOLERANCE);
    expect(witness.effectGap).toBeGreaterThanOrEqual(WITNESS_EFFECT_SEPARATION);

    const left = buildScmModel(graph, witness.left!.parameters);
    const right = buildScmModel(graph, witness.right!.parameters);
    const observed = observedNodeIds(graph);
    for (const a of observed) {
      for (const b of observed) {
        expect(covarianceAt(right, a, b)).toBeCloseTo(covarianceAt(left, a, b), 6);
      }
    }
    expect(matrixTotalEffect(right, "x", "y")).not.toBeCloseTo(
      matrixTotalEffect(left, "x", "y"),
      2,
    );
  });

  it("reports the reported effects as the models actually compute them", () => {
    const witness = findWitnessPair({ graph: unidentifiedGraph(), parameters: PARAMETERS });
    const graph = unidentifiedGraph();
    expect(witness.left!.totalEffect).toBeCloseTo(
      matrixTotalEffect(buildScmModel(graph, witness.left!.parameters), "x", "y"),
      12,
    );
    expect(witness.right!.totalEffect).toBeCloseTo(
      matrixTotalEffect(buildScmModel(graph, witness.right!.parameters), "x", "y"),
      12,
    );
  });

  it("names which parameters the impostor moved", () => {
    const witness = findWitnessPair({ graph: unidentifiedGraph(), parameters: PARAMETERS });
    expect(witness.movedParameters.length).toBeGreaterThan(0);
    for (const moved of witness.movedParameters) {
      expect(Math.abs(moved.to - moved.from)).toBeGreaterThan(1e-6);
    }
  });

  it("is deterministic: the same graph and parameters give the same witness", () => {
    const graph = unidentifiedGraph();
    const first = findWitnessPair({ graph, parameters: PARAMETERS });
    const second = findWitnessPair({ graph, parameters: PARAMETERS });
    expect(second.right!.parameters).toEqual(first.right!.parameters);
    expect(second.effectGap).toBe(first.effectGap);
  });

  /**
   * A chain is identified, so no witness should exist — and where the search cannot find one it
   * must say so rather than presenting a near-miss as a counterexample.
   */
  it("finds nothing on an identified graph, and says nothing rather than something", () => {
    const chain = fixture("01-chain.json");
    const witness = findWitnessPair({
      graph: chain,
      parameters: {
        v: 1,
        edgeCoefficients: {
          [edgeParameterKey("x", "m")]: 0.6,
          [edgeParameterKey("m", "y")]: 0.5,
        },
        errorSds: Object.fromEntries(chain.nodes.map((node) => [node.id, 1])),
      },
    });
    expect(witness.status).toBe("not-found");
    expect(witness.right).toBeNull();
    expect(witness.reason).toContain("not proof of identification");
  });

  it("refuses to search without an exposure and an outcome", () => {
    const graph = unidentifiedGraph();
    const roleless: Graph = { ...graph, roles: {} };
    expect(findWitnessPair({ graph: roleless, parameters: PARAMETERS }).status).toBe("not-found");
  });
});
