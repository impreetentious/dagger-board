import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertScmIntegrity,
  auditScmIntegrity,
  buildScmModel,
  covarianceAt,
  defaultScmParameters,
  edgeParameterKey,
  matrixTotalEffect,
  type SCMParameters,
} from "@/engine/scm";
import {
  frontdoorEstimand,
  frontdoorSetEstimand,
  ivEstimand,
  ivMultiplicativeIdentity,
  olsEstimand,
} from "@/engine/stats";
import { normalCdf, normalInverse, truncateCovariance } from "@/engine/truncation";
import { boxMullerPair, createUniformGenerator, mulberry32, uniformFromRaw } from "@/lib/rng";
import { Tier1FixtureSchema, type Tier1Fixture } from "../../fixtures/tier1/schema";

const fixtureDirectory = fileURLToPath(new URL("../../fixtures/tier1/", import.meta.url));
const fixtures = readdirSync(fixtureDirectory)
  .filter((file) => file.endsWith(".json"))
  .map((file) =>
    Tier1FixtureSchema.parse(JSON.parse(readFileSync(`${fixtureDirectory}/${file}`, "utf8"))),
  ) as Tier1Fixture[];

function fixture(id: string): Tier1Fixture {
  const value = fixtures.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing fixture ${id}.`);
  return value;
}

function parametersFor(graph: Tier1Fixture["graph"], coefficient = 0.5): SCMParameters {
  const result = defaultScmParameters(graph);
  for (const key of Object.keys(result.edgeCoefficients))
    result.edgeCoefficients[key] = coefficient;
  return result;
}

describe("WU-3.1 seeded primitives", () => {
  it("matches raw mulberry32, open-interval, Box–Muller, and poison-seed vectors", () => {
    const raw = mulberry32(0);
    expect([raw(), raw(), raw()]).toEqual([1144304738, 1416247, 958946056]);
    const poison = mulberry32(0x92d4860b);
    expect(poison()).toBe(0);
    expect(uniformFromRaw(0)).toBe(0.5 / 2 ** 32);
    expect(uniformFromRaw(0)).toBeGreaterThan(0);
    expect(uniformFromRaw(0xffffffff)).toBeLessThan(1);

    const pair = boxMullerPair(createUniformGenerator(0));
    expect(pair.first).toBeCloseTo(1.6264323079191505, 14);
    expect(pair.second).toBeCloseTo(0.00336973522237399, 14);
    const poisonUniform = createUniformGenerator(0x92d4860b)();
    expect(Number.isFinite(Math.sqrt(-2 * Math.log(poisonUniform)))).toBe(true);
  });
});

describe("WU-3.2–3.4 exact SCM", () => {
  it("reproduces the M-bias hand derivation", () => {
    const graph = fixture("m-bias").graph;
    const model = buildScmModel(graph, parametersFor(graph));
    const audit = assertScmIntegrity(model, "x", "y");
    expect(audit.ok).toBe(true);
    expect(covarianceAt(model, "x", "m")).toBeCloseTo(0.25, 12);
    expect(covarianceAt(model, "m", "y")).toBeCloseTo(0.25, 12);
    expect(covarianceAt(model, "m", "m")).toBeCloseTo(1.5, 12);
    expect(covarianceAt(model, "x", "x")).toBeCloseTo(1.25, 12);
    expect(covarianceAt(model, "x", "y")).toBeCloseTo(0, 12);
    expect(matrixTotalEffect(model, "x", "y")).toBe(0);
    expect(olsEstimand(model, "x", "y", [], 0).estimand).toBeCloseTo(0, 12);
    expect(olsEstimand(model, "x", "y", ["m"], 0).estimand).toBeCloseTo(-1 / 29, 12);
  });

  it("keeps matrix and ordered-trek covariance identical across every canon graph", () => {
    for (const item of fixtures) {
      const exposure = item.graph.roles.exposureId;
      const outcome = item.graph.roles.outcomeId;
      if (!exposure || !outcome) continue;
      const model = buildScmModel(item.graph, parametersFor(item.graph, 0.35));
      const audit = auditScmIntegrity(model, exposure, outcome);
      expect(audit.covarianceAgrees, item.id).toBe(true);
      expect(audit.totalEffectAgrees, item.id).toBe(true);
    }
  });

  it("computes frontdoor and IV population estimands from covariance", () => {
    const frontdoorGraph = fixture("frontdoor").graph;
    const frontdoorModel = buildScmModel(frontdoorGraph, parametersFor(frontdoorGraph));
    const totalEffect = matrixTotalEffect(frontdoorModel, "x", "y");
    expect(frontdoorEstimand(frontdoorModel, "x", "m", "y")).toBeCloseTo(totalEffect, 12);
    expect(frontdoorSetEstimand(frontdoorModel, "x", ["m"], "y")).toBeCloseTo(totalEffect, 12);

    const ivGraph = fixture("iv").graph;
    const ivModel = buildScmModel(ivGraph, parametersFor(ivGraph));
    const ivTotalEffect = matrixTotalEffect(ivModel, "x", "y");
    const estimate = ivEstimand(ivModel, "z", "x", "y", [], ivTotalEffect);
    expect(estimate.status).toBe("defined");
    expect(estimate.populationBias).toBeCloseTo(0, 12);
    expect(ivMultiplicativeIdentity(ivModel, "z", "x", "y", [], ivTotalEffect)).toBeCloseTo(0, 12);
  });

  it("reproduces the hand-derived set-valued frontdoor closed form", () => {
    const graph = fixture("set-frontdoor").graph;
    const model = buildScmModel(graph, parametersFor(graph));
    const totalEffect = matrixTotalEffect(model, "x", "y");
    expect(totalEffect).toBeCloseTo(0.5, 12);
    expect(covarianceAt(model, "x", "x")).toBeCloseTo(1.25, 12);
    expect(covarianceAt(model, "x", "y")).toBeCloseTo(0.875, 12);
    expect(covarianceAt(model, "m1", "y")).toBeCloseTo(0.9375, 12);
    expect(covarianceAt(model, "m1", "m1")).toBeCloseTo(1.3125, 12);
    expect(covarianceAt(model, "m1", "m2")).toBeCloseTo(0.3125, 12);
    const naive = olsEstimand(model, "x", "y", [], totalEffect);
    expect(naive.estimand).toBeCloseTo(0.7, 12);
    expect(naive.populationBias).toBeCloseTo(0.2, 12);
    expect(frontdoorSetEstimand(model, "x", ["m1", "m2"], "y")).toBeCloseTo(0.5, 12);
  });

  it("uses the undefined rather than numeric state for exact first-stage cancellation", () => {
    const graph = fixture("iv-exact-cancellation").graph;
    const parameters = parametersFor(graph, 1);
    parameters.edgeCoefficients[edgeParameterKey("z", "x")] = -1;
    const model = buildScmModel(graph, parameters);
    const result = ivEstimand(model, "z", "x", "y", [], matrixTotalEffect(model, "x", "y"));
    expect(result.status).toBe("undefined");
    expect(result.estimand).toBeNull();
  });

  it("uses the marginal selection SD and a positive-semidefinite truncation", () => {
    const graph = fixture("berkson-selection").graph;
    const model = buildScmModel(graph, parametersFor(graph));
    const truncated = truncateCovariance(model, { nodeId: "s", quantile: 0.8 });
    expect(truncated.marginalSd ** 2).toBeCloseTo(1.5, 12);
    expect(truncated.delta).toBeGreaterThan(0);
    expect(truncated.delta).toBeLessThan(1);
    expect(
      truncated.covariance[model.indexById.get("x") ?? 0][model.indexById.get("y") ?? 0],
    ).toBeLessThan(0);
  });

  it("pins Acklam vectors and a high-precision round trip", () => {
    expect(normalInverse(0.5)).toBeCloseTo(0, 14);
    expect(normalInverse(0.975)).toBeCloseTo(1.959963984540054, 12);
    expect(normalInverse(0.99)).toBeCloseTo(2.3263478740408408, 12);
    expect(normalInverse(1e-6)).toBeCloseTo(-4.753424308822899, 10);
    expect(normalInverse(1e-9)).toBeCloseTo(-5.9978070150076865, 10);
    for (const probability of [1e-9, 1e-6, 0.2, 0.8, 1 - 1e-9]) {
      expect(normalCdf(normalInverse(probability))).toBeCloseTo(probability, 10);
    }
  });
});
