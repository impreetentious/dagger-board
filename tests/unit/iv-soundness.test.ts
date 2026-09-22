import { describe, expect, it } from "vitest";

import { checkConditionalInstrument, enumerateConditionalInstruments } from "@/engine/iv";
import { type Graph, validateGraph } from "@/engine/graph";
import {
  buildScmModel,
  defaultScmParameters,
  edgeParameterKey,
  matrixTotalEffect,
} from "@/engine/scm";
import { ivMultiplicativeIdentity } from "@/engine/stats";

import fixture16 from "../../fixtures/tier1/16-iv-descendant-repair.json";

/**
 * Why the conservative `({Z} ∪ W) ∩ De(X) = ∅` barrier in §3.6 is retained
 * for the total effect, and why the DAGitty/Brito–Pearl "literature" ancestral
 * instrument is not a sound drop-in here.
 *
 * The total-effect Wald identity `Σ_{ZY·W} = TE · Σ_{ZX·W}` is validated by a
 * d-separation in `G_out(X)`. That d-separation faithfully computes the required
 * covariance ONLY when cutting X's outgoing edges leaves the joint law of
 * `{Z} ∪ W` unchanged — i.e. exactly when none of them is a descendant of X.
 * Admitting a descendant instrument (as the broader ancestral search does)
 * re-introduces a back-door term the mutilated-graph check cannot see, so the
 * Wald ratio stops equalling the total effect. Fixture #16 (CX-B) is the witness:
 * Z ∈ De(X), Z ⊄ De(Y), yet β_IV = 0.95 ≠ TE = 0.7.
 *
 * The genuinely sound literature relaxation (van der Zander–Textor–Liśkiewicz
 * ancestral instruments with the arrow-cut `X → Y` mutilation) identifies the
 * direct effect, not the total effect targeted by this implementation.
 */

const graph = validateGraph(fixture16.graph as Graph);

describe("conditional-IV soundness boundary (§3.6)", () => {
  it("reproduces β_IV = 0.95 ≠ TE = 0.7 for the descendant instrument Z (fixture #16)", () => {
    const parameters = defaultScmParameters(graph); // all coefficients 1, all SDs 1
    parameters.edgeCoefficients[edgeParameterKey("x", "y")] = 0.7;
    const model = buildScmModel(graph, parameters);

    const totalEffect = matrixTotalEffect(model, "x", "y");
    expect(totalEffect).toBeCloseTo(0.7, 10);

    // With W = ∅, the Wald identity for the descendant instrument Z is far from 0.
    const identity = ivMultiplicativeIdentity(model, "z", "x", "y", [], totalEffect);
    expect(Math.abs(identity)).toBeGreaterThan(1e-6);

    // β_IV = Σ_ZY / Σ_ZX = TE + identity/Σ_ZX; the derivation pins it at 0.95.
    // ivMultiplicativeIdentity(ctx, z, exposure, outcome, W, 0) returns partialCov(z, outcome, W).
    const sigmaZX = ivMultiplicativeIdentity(model, "z", "x", "x", [], 0); // Σ_ZX
    const sigmaZY = ivMultiplicativeIdentity(model, "z", "x", "y", [], 0); // Σ_ZY
    expect(sigmaZY / sigmaZX).toBeCloseTo(0.95, 6);
  });

  it("the conservative criterion correctly excludes the descendant Z", () => {
    expect(checkConditionalInstrument(graph, "x", "y", "z", new Set()).nonDescendant).toBe(false);
    const instruments = enumerateConditionalInstruments(graph, "x", "y");
    expect(instruments.every((entry) => entry.instrumentId !== "z")).toBe(true);
  });

  it("every enumerated conditional instrument satisfies the Wald identity exactly", () => {
    const parameters = defaultScmParameters(graph);
    parameters.edgeCoefficients[edgeParameterKey("x", "y")] = 0.7;
    const model = buildScmModel(graph, parameters);
    const totalEffect = matrixTotalEffect(model, "x", "y");
    for (const instrument of enumerateConditionalInstruments(graph, "x", "y")) {
      for (const conditionedIds of instrument.conditioningSets) {
        expect(
          Math.abs(
            ivMultiplicativeIdentity(
              model,
              instrument.instrumentId,
              "x",
              "y",
              conditionedIds,
              totalEffect,
            ),
          ),
        ).toBeLessThan(1e-9);
      }
    }
  });
});
