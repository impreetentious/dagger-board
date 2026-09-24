import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { enumerateAdjustmentSets } from "@/engine/adjust";
import { classifyPaths } from "@/engine/classify";
import { enumerateFrontdoorMediators } from "@/engine/frontdoor";
import { enumerateImpliedConditionalIndependencies } from "@/engine/implications";
import { enumerateConditionalInstruments } from "@/engine/iv";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

const fixtureDirectory = fileURLToPath(new URL("../../fixtures/tier1/", import.meta.url));
const fixture = readdirSync(fixtureDirectory)
  .filter((file) => file.endsWith(".json"))
  .map((file) =>
    Tier1FixtureSchema.parse(JSON.parse(readFileSync(`${fixtureDirectory}/${file}`, "utf8"))),
  )
  .find((candidate) => candidate.id === "adversarial-perf");

if (!fixture) throw new Error("Missing fixture #14.");

const graph = fixture.graph;

function proveOnce(): number {
  const start = performance.now();
  classifyPaths(graph, "x", "y", new Set());
  enumerateAdjustmentSets(graph, "x", "y");
  enumerateFrontdoorMediators(graph, "x", "y");
  enumerateConditionalInstruments(graph, "x", "y");
  enumerateImpliedConditionalIndependencies(graph);
  return performance.now() - start;
}

it("meets the full-Prove performance budget", () => {
  // The gate is the median of five runs (docs/perf.md). One discarded warm-up
  // run keeps the first, unoptimised pass out of the sample.
  proveOnce();
  const runs = Array.from({ length: 5 }, () => proveOnce()).sort((a, b) => a - b);
  const median = runs[2];

  if (process.env.PERF_LOG === "1") {
    process.stdout.write(
      `PROVE_PERF prove_ms=${median.toFixed(4)} runs=${runs.map((run) => run.toFixed(4)).join(",")}\n`,
    );
  }
  expect(median).toBeLessThan(250);
});
