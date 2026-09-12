import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { evaluateDesign, measuredDefaults } from "@/engine/design";
import { defaultScmParameters } from "@/engine/scm";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

const fixturePath = fileURLToPath(
  new URL("../../fixtures/tier1/14-adversarial-perf.json", import.meta.url),
);
const fixture = Tier1FixtureSchema.parse(JSON.parse(readFileSync(fixturePath, "utf8")));
const parameters = defaultScmParameters(fixture.graph);
for (const key of Object.keys(parameters.edgeCoefficients)) parameters.edgeCoefficients[key] = 0.25;
const measured = measuredDefaults(fixture.graph);

function designOnce(): number {
  const start = performance.now();
  const report = evaluateDesign(fixture.graph, parameters, measured, undefined, 10_000);
  expect(report.rows.length).toBeGreaterThan(0);
  return performance.now() - start;
}

it("meets the P6 Design-table performance budget", () => {
  // As with P2, discard one warm-up and gate the median of five independent runs.
  designOnce();
  const runs = Array.from({ length: 5 }, () => designOnce()).sort((left, right) => left - right);
  const median = runs[2];

  if (process.env.PERF_LOG === "1") {
    process.stdout.write(
      `P6_PERF design_ms=${median.toFixed(4)} runs=${runs.map((run) => run.toFixed(4)).join(",")}\n`,
    );
  }
  expect(median).toBeLessThan(750);
});
