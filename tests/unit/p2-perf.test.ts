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

it("meets the P2 full-Prove performance budget", () => {
  const start = performance.now();
  classifyPaths(fixture.graph, "x", "y", new Set());
  enumerateAdjustmentSets(fixture.graph, "x", "y");
  enumerateFrontdoorMediators(fixture.graph, "x", "y");
  enumerateConditionalInstruments(fixture.graph, "x", "y");
  enumerateImpliedConditionalIndependencies(fixture.graph);
  const elapsed = performance.now() - start;

  if (process.env.PERF_LOG === "1")
    process.stdout.write(`P2_PERF prove_ms=${elapsed.toFixed(4)}\n`);
  expect(elapsed).toBeLessThan(250);
});
