import { describe, expect, it } from "vitest";
import {
  adjustmentAverageCausalEffect,
  averageCausalEffect,
  defaultDiscreteParameters,
  normalizeDiscreteParameters,
  type DiscreteScmParameters,
} from "@/engine/discrete-scm";
import { validateGraph, type Graph } from "@/engine/graph";

const chainGraph: Graph = validateGraph({
  v: 1,
  nodes: [
    { id: "x", idx: 0, name: "X", kind: "observed" },
    { id: "m", idx: 1, name: "M", kind: "observed" },
    { id: "y", idx: 2, name: "Y", kind: "observed" },
  ],
  edges: [
    { from: "x", to: "m" },
    { from: "m", to: "y" },
  ],
  roles: { exposureId: "x", outcomeId: "y" },
});

const forkGraph: Graph = validateGraph({
  v: 1,
  nodes: [
    { id: "u", idx: 0, name: "U", kind: "observed" },
    { id: "x", idx: 1, name: "X", kind: "observed" },
    { id: "y", idx: 2, name: "Y", kind: "observed" },
  ],
  edges: [
    { from: "u", to: "x" },
    { from: "u", to: "y" },
  ],
  roles: { exposureId: "x", outcomeId: "y" },
});

function forkParameters(): DiscreteScmParameters {
  return {
    v: 1,
    logits: {
      u: { intercept: 0, coefficients: {} },
      x: { intercept: -1, coefficients: { u: 2 } },
      y: { intercept: -1, coefficients: { u: 2 } },
    },
  };
}

describe("discrete SCM oracle (item 2 of §2.6)", () => {
  it("normalises parameters, rejects non-parent coefficients, and defaults to unit logits", () => {
    const defaults = defaultDiscreteParameters(chainGraph);
    expect(defaults.logits.m.coefficients.x).toBe(1);
    expect(() =>
      normalizeDiscreteParameters(chainGraph, {
        v: 1,
        logits: { y: { intercept: 0, coefficients: { x: 1 } } },
      }),
    ).toThrow(/non-parent/);
  });

  it("gives zero ATE for a pure fork where X does not cause Y", () => {
    const ate = averageCausalEffect(forkGraph, forkParameters(), "x", "y");
    expect(ate.ate).toBeCloseTo(0, 12);
    // Naive plug-in without adjustment picks up the confounding term and is nonzero.
    const naive = adjustmentAverageCausalEffect(forkGraph, forkParameters(), "x", "y", []);
    expect(Math.abs(naive)).toBeGreaterThan(0);
    // Adjusting on the confounder recovers zero exactly.
    const adjusted = adjustmentAverageCausalEffect(forkGraph, forkParameters(), "x", "y", ["u"]);
    expect(adjusted).toBeCloseTo(0, 12);
  });

  it("computes chain ATE via the plug-in identity when no confounder exists", () => {
    const parameters: DiscreteScmParameters = {
      v: 1,
      logits: {
        x: { intercept: 0, coefficients: {} },
        m: { intercept: -1, coefficients: { x: 2 } },
        y: { intercept: -1, coefficients: { m: 2 } },
      },
    };
    const ate = averageCausalEffect(chainGraph, parameters, "x", "y");
    // The empty-adjustment plug-in equals the ATE because there is no back-door.
    const empty = adjustmentAverageCausalEffect(chainGraph, parameters, "x", "y", []);
    expect(empty).toBeCloseTo(ate.ate, 12);
  });
});
