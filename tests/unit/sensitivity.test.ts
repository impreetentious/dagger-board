import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildScmModel, edgeParameterKey, matrixTotalEffect } from "@/engine/scm";
import { confounderBias, evaluateSensitivity, robustnessValue } from "@/engine/sensitivity";
import type { Graph } from "@/engine/graph";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

function fixture(file: string): Graph {
  const path = fileURLToPath(new URL(`../../fixtures/tier1/${file}`, import.meta.url));
  return Tier1FixtureSchema.parse(JSON.parse(readFileSync(path, "utf8"))).graph;
}

function evaluate(graph: Graph, coefficients: Record<string, number>, conditioning: string[]) {
  const model = buildScmModel(graph, {
    v: 1,
    edgeCoefficients: coefficients,
    errorSds: Object.fromEntries(graph.nodes.map((node) => [node.id, 1])),
  });
  const context = { covariance: model.covariance, indexById: model.indexById };
  const report = evaluateSensitivity({
    graph,
    context,
    exposureId: "x",
    outcomeId: "y",
    conditioningIds: conditioning,
    totalEffect: matrixTotalEffect(model, "x", "y"),
  });
  return { model, context, report };
}

/** The fork canon: U → X, U → Y, plus the X → Y edge the sensitivity question is about. */
function forkWithEffect(): Graph {
  const graph = fixture("02-fork.json");
  return { ...graph, edges: [...graph.edges, { from: "x", to: "y" }] };
}

const FORK_COEFFICIENTS = {
  [edgeParameterKey("u", "x")]: 0.5,
  [edgeParameterKey("u", "y")]: 0.5,
  [edgeParameterKey("x", "y")]: 0.6,
};

describe("sensitivity surface", () => {
  /**
   * The robustness value is *defined* as where the iso-bias curve crosses the diagonal, so the
   * definition is the test: a confounder of exactly that strength on both axes must produce a
   * bias of exactly the estimate. If the closed form and the solved value disagree, one of
   * them is wrong.
   */
  it("defines the robustness value as the strength that cancels the estimate", () => {
    const { report } = evaluate(forkWithEffect(), FORK_COEFFICIENTS, ["u"]);
    expect(report.populationBias).toBeCloseTo(0, 12);
    expect(
      confounderBias(report.biasScale, report.robustnessValue, report.robustnessValue),
    ).toBeCloseTo(Math.abs(report.estimand), 9);
  });

  it("needs a stronger confounder to reverse a result than to erase it", () => {
    const { report } = evaluate(forkWithEffect(), FORK_COEFFICIENTS, ["u"]);
    expect(report.robustnessValueSignFlip).toBeGreaterThan(report.robustnessValue);
    expect(report.robustnessValue).toBeGreaterThan(0);
    expect(report.robustnessValue).toBeLessThan(1);
  });

  it("makes a stronger effect harder to explain away", () => {
    const values = [0.2, 0.6, 1.2].map(
      (coefficient) =>
        evaluate(
          forkWithEffect(),
          { ...FORK_COEFFICIENTS, [edgeParameterKey("x", "y")]: coefficient },
          ["u"],
        ).report.robustnessValue,
    );
    expect(values[1]).toBeGreaterThan(values[0]);
    expect(values[2]).toBeGreaterThan(values[1]);
  });

  /**
   * The benchmark is the exact counterfactual rather than a bound: dropping U from the
   * adjustment set is a covariance computation this engine can just do.
   */
  it("benchmarks a drawn covariate by what dropping it actually does", () => {
    const graph = forkWithEffect();
    const { model, report } = evaluate(
      graph,
      {
        ...FORK_COEFFICIENTS,
        [edgeParameterKey("u", "x")]: 0.8,
        [edgeParameterKey("u", "y")]: 0.8,
      },
      ["u"],
    );
    const benchmark = report.benchmarks.find((entry) => entry.nodeId === "u")!;
    const xIndex = model.indexById.get("x")!;
    const yIndex = model.indexById.get("y")!;
    const naive = model.covariance[xIndex][yIndex] / model.covariance[xIndex][xIndex];
    expect(benchmark.adjusted).toBe(true);
    expect(benchmark.estimandWithout).toBeCloseTo(naive, 12);
    expect(benchmark.estimandWithout!).toBeGreaterThan(report.totalEffect);
  });

  it("traces every contour from its own closed form", () => {
    const { report } = evaluate(forkWithEffect(), FORK_COEFFICIENTS, ["u"]);
    const zeroCurve = report.contour.find((level) => level.value === 0)!;
    expect(zeroCurve.points.length).toBeGreaterThan(10);
    for (const point of zeroCurve.points) {
      expect(confounderBias(report.biasScale, point.x, point.y)).toBeCloseTo(
        Math.abs(report.estimand),
        9,
      );
      expect(point.y).toBeLessThanOrEqual(1);
    }
  });

  it("says so plainly when there is no estimate left to overturn", () => {
    const { report } = evaluate(
      forkWithEffect(),
      { ...FORK_COEFFICIENTS, [edgeParameterKey("x", "y")]: 0 },
      ["u"],
    );
    expect(report.degenerate).toBe(true);
    expect(report.contour).toEqual([]);
    expect(report.robustnessValue).toBe(0);
  });

  it("returns zero robustness where the formula has nothing to work with", () => {
    expect(robustnessValue(1, 0)).toBe(0);
    expect(robustnessValue(0, 1)).toBe(0);
  });
});
