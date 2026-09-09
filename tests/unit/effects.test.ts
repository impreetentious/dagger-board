import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  controlledDirectEffect,
  directEdgeCoefficient,
  pathSpecificEffects,
} from "@/engine/effects";
import {
  defaultScmParameters,
  matrixTotalEffect,
  buildScmModel,
  type SCMParameters,
} from "@/engine/scm";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

function fixture(file: string) {
  const path = fileURLToPath(new URL(`../../fixtures/tier1/${file}`, import.meta.url));
  return Tier1FixtureSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

function halfParameters(graph: ReturnType<typeof fixture>["graph"]): SCMParameters {
  const parameters = defaultScmParameters(graph);
  for (const key of Object.keys(parameters.edgeCoefficients))
    parameters.edgeCoefficients[key] = 0.5;
  return parameters;
}

describe("direct and path-specific effects (item 3 of §2.6)", () => {
  it("returns the edge coefficient for a direct X→Y edge, and 0 otherwise", () => {
    const chain = fixture("01-chain.json");
    const setFd = fixture("19-set-frontdoor.json");
    expect(directEdgeCoefficient(chain.graph, halfParameters(chain.graph), "x", "y")).toBe(0);
    // set-frontdoor has no direct X→Y edge in v1's fixture (only X→M1→Y and X→M2→Y)
    expect(directEdgeCoefficient(setFd.graph, halfParameters(setFd.graph), "x", "y")).toBe(0);
  });

  it("controlledDirectEffect sums directed paths that avoid the blocked mediator set", () => {
    const setFd = fixture("19-set-frontdoor.json");
    const parameters = halfParameters(setFd.graph);
    const model = buildScmModel(setFd.graph, parameters);
    const te = matrixTotalEffect(model, "x", "y");
    expect(controlledDirectEffect(setFd.graph, parameters, "x", "y", [])).toBeCloseTo(te, 12);
    // Blocking both mediators kills both directed paths (there is no direct X→Y edge).
    expect(controlledDirectEffect(setFd.graph, parameters, "x", "y", ["m1", "m2"])).toBe(0);
    // Blocking one mediator leaves the other path (0.5 · 0.5 = 0.25).
    expect(controlledDirectEffect(setFd.graph, parameters, "x", "y", ["m1"])).toBeCloseTo(0.25, 12);
    expect(controlledDirectEffect(setFd.graph, parameters, "x", "y", ["m2"])).toBeCloseTo(0.25, 12);
  });

  it("pathSpecificEffects contributions sum to TE and preserve Wright's decomposition", () => {
    const setFd = fixture("19-set-frontdoor.json");
    const parameters = halfParameters(setFd.graph);
    const model = buildScmModel(setFd.graph, parameters);
    const te = matrixTotalEffect(model, "x", "y");
    const decomposition = pathSpecificEffects(setFd.graph, parameters, "x", "y");
    expect(decomposition.totalEffect).toBeCloseTo(te, 12);
    expect(decomposition.paths).toHaveLength(2);
    expect(decomposition.paths.every((entry) => Math.abs(entry.contribution - 0.25) < 1e-12)).toBe(
      true,
    );
  });
});
