import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { buildScmModel, defaultScmParameters } from "@/engine/scm";
import { generateSimulationDataAsync, sampleMoments } from "@/engine/sim";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

const fixturePath = fileURLToPath(
  new URL("../../fixtures/tier1/14-adversarial-perf.json", import.meta.url),
);
const fixture = Tier1FixtureSchema.parse(JSON.parse(readFileSync(fixturePath, "utf8")));

it("meets the P3 100k × 12 chunked simulation budget", async () => {
  const parameters = defaultScmParameters(fixture.graph);
  for (const key of Object.keys(parameters.edgeCoefficients))
    parameters.edgeCoefficients[key] = 0.25;
  const model = buildScmModel(fixture.graph, parameters);
  const start = performance.now();
  const data = await generateSimulationDataAsync(model, { seed: 0x3003, n: 100_000 });
  const moments = sampleMoments(data);
  const elapsed = performance.now() - start;
  if (process.env.PERF_LOG === "1") process.stdout.write(`P3_PERF sim_ms=${elapsed.toFixed(4)}\n`);
  expect(moments.sampleSize).toBe(100_000);
  expect(elapsed).toBeLessThan(1500);
});
