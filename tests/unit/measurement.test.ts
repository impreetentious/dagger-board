import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateDesign, measuredDefaults } from "@/engine/design";
import {
  attenuateCovariance,
  attenuationNotes,
  measurementNoiseVariance,
  reliabilityDefaults,
} from "@/engine/measurement";
import { buildScmModel, edgeParameterKey, matrixTotalEffect } from "@/engine/scm";
import { conditionalVariance, olsEstimand } from "@/engine/stats";
import type { Graph } from "@/engine/graph";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

function fixture(file: string): Graph {
  const path = fileURLToPath(new URL(`../../fixtures/tier1/${file}`, import.meta.url));
  return Tier1FixtureSchema.parse(JSON.parse(readFileSync(path, "utf8"))).graph;
}

/** The fork canon plus the X → Y edge: U confounds, and adjusting for U fixes it exactly. */
function forkWithEffect(): Graph {
  const graph = fixture("02-fork.json");
  return { ...graph, edges: [...graph.edges, { from: "x", to: "y" }] };
}

const PARAMETERS = {
  v: 1 as const,
  edgeCoefficients: {
    [edgeParameterKey("u", "x")]: 0.6,
    [edgeParameterKey("u", "y")]: 0.6,
    [edgeParameterKey("x", "y")]: 0.5,
  },
  errorSds: { u: 1, x: 1, y: 1 },
};

function contextFor(graph: Graph) {
  const model = buildScmModel(graph, PARAMETERS);
  return { model, context: { covariance: model.covariance, indexById: model.indexById } };
}

describe("measurement error", () => {
  it("turns a stated reliability into the noise variance it implies", () => {
    // λ = 0.8 on a unit-variance node: signal 1, noise 0.25, observed 1.25 ⇒ 1/1.25 = 0.8.
    expect(measurementNoiseVariance(1, 0.8)).toBeCloseTo(0.25, 12);
    expect(measurementNoiseVariance(4, 0.5)).toBeCloseTo(4, 12);
    expect(measurementNoiseVariance(3, 1)).toBe(0);
    expect(() => measurementNoiseVariance(1, 0)).toThrow();
    expect(() => measurementNoiseVariance(1, 1.2)).toThrow();
  });

  /**
   * The whole content of the classical model is that the noise is independent, so only the
   * variance of the affected node moves. Any change to an off-diagonal entry would be a
   * different model.
   */
  it("moves the diagonal and nothing else", () => {
    const graph = forkWithEffect();
    const { context } = contextFor(graph);
    const attenuated = attenuateCovariance(context, { x: 0.7 });
    const xIndex = context.indexById.get("x")!;
    for (let row = 0; row < context.covariance.length; row += 1) {
      for (let column = 0; column < context.covariance.length; column += 1) {
        if (row === xIndex && column === xIndex) {
          expect(attenuated.covariance[row][column]).toBeGreaterThan(
            context.covariance[row][column],
          );
        } else {
          expect(attenuated.covariance[row][column]).toBe(context.covariance[row][column]);
        }
      }
    }
  });

  it("leaves everything untouched when every node is perfectly measured", () => {
    const graph = forkWithEffect();
    const { context } = contextFor(graph);
    expect(attenuateCovariance(context, reliabilityDefaults(graph))).toBe(context);
    expect(attenuationNotes(context, reliabilityDefaults(graph))).toEqual([]);
  });

  /**
   * The classical attenuation result: a mismeasured exposure shrinks its own coefficient
   * toward zero, because the noise inflates the denominator and leaves the numerator alone.
   *
   * The factor is the reliability *of the residualised exposure*, not of the raw one — once
   * other regressors are in the model it is `Σ_{XX·Z}` that the noise is added to. That
   * distinction is the reason this test states the partial form: the marginal reliability
   * would be a plausible-looking wrong answer, and the two coincide only when Z is empty.
   */
  it("attenuates a mismeasured exposure by the reliability of its residual", () => {
    const graph = forkWithEffect();
    const { model, context } = contextFor(graph);
    const totalEffect = matrixTotalEffect(model, "x", "y");
    const xIndex = context.indexById.get("x")!;
    const marginalVariance = context.covariance[xIndex][xIndex];
    const partialVariance = conditionalVariance(context, "x", ["u"]);

    for (const reliability of [0.9, 0.6, 0.25]) {
      const noise = measurementNoiseVariance(marginalVariance, reliability);
      const attenuated = attenuateCovariance(context, { x: reliability });
      const estimate = olsEstimand(attenuated, "x", "y", ["u"], totalEffect);
      expect(estimate.estimand).toBeCloseTo(
        (totalEffect * partialVariance) / (partialVariance + noise),
        12,
      );
      expect(Math.abs(estimate.estimand)).toBeLessThan(Math.abs(totalEffect));
    }
  });

  /** With nothing else in the regression the two readings coincide, and the factor is λ. */
  it("reduces to the textbook λ·β when the exposure is the only regressor", () => {
    const graph = fixture("01-chain.json");
    const parameters = {
      v: 1 as const,
      edgeCoefficients: {
        [edgeParameterKey("x", "m")]: 0.6,
        [edgeParameterKey("m", "y")]: 0.5,
      },
      errorSds: Object.fromEntries(graph.nodes.map((node) => [node.id, 1])),
    };
    const model = buildScmModel(graph, parameters);
    const context = { covariance: model.covariance, indexById: model.indexById };
    const totalEffect = matrixTotalEffect(model, "x", "y");
    for (const reliability of [0.9, 0.5]) {
      const attenuated = attenuateCovariance(context, { x: reliability });
      expect(olsEstimand(attenuated, "x", "y", [], totalEffect).estimand).toBeCloseTo(
        reliability * totalEffect,
        12,
      );
    }
  });

  /**
   * The lesson the Design surface exists to deliver: adjusting for a noisy proxy of a
   * confounder removes only part of the confounding. The bias must sit strictly between the
   * unadjusted bias and zero — neither "controlled for" nor "not controlled for".
   */
  it("shows a mismeasured confounder only partly deconfounding", () => {
    const graph = forkWithEffect();
    const { model, context } = contextFor(graph);
    const totalEffect = matrixTotalEffect(model, "x", "y");
    const unadjusted = olsEstimand(context, "x", "y", [], totalEffect).populationBias;
    const perfect = olsEstimand(context, "x", "y", ["u"], totalEffect).populationBias;
    const noisy = olsEstimand(
      attenuateCovariance(context, { u: 0.5 }),
      "x",
      "y",
      ["u"],
      totalEffect,
    ).populationBias;

    expect(perfect).toBeCloseTo(0, 12);
    expect(unadjusted).toBeGreaterThan(0);
    expect(noisy).toBeGreaterThan(0);
    expect(noisy).toBeLessThan(unadjusted);
  });

  it("gives the design table a bias column that only speaks when it has something to say", () => {
    const graph = forkWithEffect();
    const measured = measuredDefaults(graph);
    const clean = evaluateDesign(graph, PARAMETERS, measured, undefined, 10_000, []);
    expect(clean.rows.every((row) => row.biasUnderMismeasurement === null)).toBe(true);
    expect(clean.attenuation).toEqual([]);

    const noisy = evaluateDesign(graph, PARAMETERS, measured, undefined, 10_000, [], { u: 0.5 });
    const adjustmentRow = noisy.rows.find((row) => row.conditioningIds.includes("u"))!;
    expect(adjustmentRow.populationBias).toBeCloseTo(0, 12);
    expect(adjustmentRow.biasUnderMismeasurement).toBeGreaterThan(0);
    expect(noisy.attenuation).toHaveLength(1);
    expect(noisy.attenuation[0].nodeId).toBe("u");
    expect(noisy.attenuation[0].observedVariance).toBeCloseTo(
      noisy.attenuation[0].trueVariance / 0.5,
      12,
    );
  });

  it("never attenuates the true effect — only what an estimator recovers", () => {
    const graph = forkWithEffect();
    const measured = measuredDefaults(graph);
    const clean = evaluateDesign(graph, PARAMETERS, measured, undefined, 10_000, []);
    const noisy = evaluateDesign(graph, PARAMETERS, measured, undefined, 10_000, [], { x: 0.4 });
    expect(noisy.totalEffect).toBe(clean.totalEffect);
  });
});
