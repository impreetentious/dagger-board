import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildScmModel,
  defaultScmParameters,
  matrixTotalEffect,
  type SCMParameters,
} from "@/engine/scm";
import {
  convergenceSeries,
  generateSimulationData,
  generateSimulationDataAsync,
  runSimulation,
  sampleMoments,
} from "@/engine/sim";
import { olsEstimand, olsStandardError } from "@/engine/stats";
import { truncateCovariance } from "@/engine/truncation";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

interface GoldenCase {
  fixture: string;
  seed: number;
  edgeCoefficient: number;
  firstNodeValues: number[];
  firstCovarianceRow: number[];
}

const goldenPath = fileURLToPath(
  new URL("../../fixtures/tier1/goldens/scm-goldens.json", import.meta.url),
);
const goldens = JSON.parse(readFileSync(goldenPath, "utf8")) as { cases: GoldenCase[] };

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

describe("WU-3.5–3.6 deterministic simulation", () => {
  it("matches all three pinned-runtime golden seed fixtures", () => {
    for (const golden of goldens.cases) {
      const graph = fixture(golden.fixture).graph;
      const parameters = halfParameters(graph);
      for (const key of Object.keys(parameters.edgeCoefficients)) {
        parameters.edgeCoefficients[key] = golden.edgeCoefficient;
      }
      const data = generateSimulationData(buildScmModel(graph, parameters), {
        seed: golden.seed,
        n: 100,
      });
      const moments = sampleMoments(data);
      expect([...data.columns.get(data.nodeIds[0])!.slice(0, 4)], golden.fixture).toEqual(
        golden.firstNodeValues,
      );
      expect(moments.covariance[0].slice(0, 3), golden.fixture).toEqual(golden.firstCovarianceRow);
    }
  });

  it("is bit-identical for the same seed and preserves its order in the chunked runner", async () => {
    const graph = fixture("04-m-bias.json").graph;
    const model = buildScmModel(graph, halfParameters(graph));
    const options = { seed: 0x600d, n: 1001 };
    const first = generateSimulationData(model, options);
    const second = generateSimulationData(model, options);
    const asyncData = await generateSimulationDataAsync(model, options, 128);
    for (const id of model.nodeIds) {
      expect([...first.columns.get(id)!]).toEqual([...second.columns.get(id)!]);
      expect([...first.columns.get(id)!]).toEqual([...asyncData.columns.get(id)!]);
    }
  });

  it("records log-spaced checkpoints and marks insufficient selected samples", () => {
    const graph = fixture("07-berkson-selection.json").graph;
    const model = buildScmModel(graph, halfParameters(graph));
    const data = generateSimulationData(model, {
      seed: 7,
      n: 100,
      selection: { nodeId: "s", quantile: 0.99 },
    });
    const series = convergenceSeries(data, {
      kind: "ols",
      exposureId: "x",
      outcomeId: "y",
      conditionedIds: [],
      totalEffect: 0,
    });
    expect(series.at(-1)?.generatedRows).toBe(100);
    expect(series.at(-1)?.keptRows).toBeLessThan(50);
    expect(series.at(-1)?.estimate).toBeNull();
  });

  it("matches the selection closed form within the realized 4·SE demonstration tolerance", () => {
    const graph = fixture("07-berkson-selection.json").graph;
    const parameters = halfParameters(graph);
    const options = { seed: 0x703, n: 100_000, selection: { nodeId: "s", quantile: 0.6 } };
    const run = runSimulation(graph, parameters, "x", "y", options);
    const totalEffect = matrixTotalEffect(run.model, "x", "y");
    const truncated = truncateCovariance(run.model, options.selection);
    const plim = olsEstimand(truncated, "x", "y", [], totalEffect).estimand;
    const estimate = olsEstimand(run.sample, "x", "y", [], totalEffect).estimand;
    const standardError = olsStandardError(run.sample, "x", "y", [], run.sample.sampleSize);
    expect(Math.abs(estimate - plim)).toBeLessThanOrEqual(4 * standardError);
  });
});
