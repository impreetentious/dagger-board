import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  defaultScmParameters,
  matrixTotalEffect,
  buildScmModel,
  type SCMParameters,
} from "@/engine/scm";
import { olsEstimand } from "@/engine/stats";
import { runSimulationInWorker } from "@/lib/sim-worker-client";
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

describe("simulation-worker client fallback", () => {
  it("falls back to the main-thread async runner when Web Workers are unavailable", async () => {
    const item = fixture("01-chain.json");
    const parameters = halfParameters(item.graph);
    const run = await runSimulationInWorker(item.graph, parameters, "x", "y", {
      seed: 42,
      n: 2000,
    });
    const totalEffect = matrixTotalEffect(buildScmModel(item.graph, parameters), "x", "y");
    const sample = olsEstimand(run.sample, "x", "y", [], totalEffect);
    expect(sample.estimand).toBeCloseTo(totalEffect, 1);
  });

  // A worker that never posts a message would otherwise leave the run promise
  // pending forever, freezing the Simulate button on "Running…".
  it("rejects instead of hanging when the worker itself fails", async () => {
    const item = fixture("01-chain.json");
    class FailingWorker extends EventTarget {
      constructor() {
        super();
        queueMicrotask(() => this.dispatchEvent(new Event("error")));
      }
      postMessage() {}
      terminate() {}
    }
    const original = Reflect.get(globalThis, "Worker");
    Reflect.set(globalThis, "Worker", FailingWorker);
    try {
      await expect(
        runSimulationInWorker(item.graph, halfParameters(item.graph), "x", "y", {
          seed: 42,
          n: 200,
        }),
      ).rejects.toThrow(/worker/i);
    } finally {
      if (original === undefined) Reflect.deleteProperty(globalThis, "Worker");
      else Reflect.set(globalThis, "Worker", original);
    }
  });
});
