import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { dSeparatedBayesBall } from "@/engine/dsep";
import { enumerateSimplePaths } from "@/engine/paths";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

const fixtureDirectory = fileURLToPath(new URL("../../fixtures/tier1/", import.meta.url));
const fixture = readdirSync(fixtureDirectory)
  .filter((file) => file.endsWith(".json"))
  .map((file) =>
    Tier1FixtureSchema.parse(JSON.parse(readFileSync(`${fixtureDirectory}/${file}`, "utf8"))),
  )
  .find((candidate) => candidate.id === "adversarial-perf");

if (!fixture) throw new Error("Missing fixture #14.");

it("meets d-separation and path-enumeration budgets", () => {
  const startDsep = performance.now();
  for (let index = 0; index < 500; index += 1) {
    dSeparatedBayesBall(fixture.graph, "x", "y", new Set());
  }
  const dsepMs = (performance.now() - startDsep) / 500;

  const startPaths = performance.now();
  const paths = enumerateSimplePaths(fixture.graph, "x", "y");
  const pathsMs = performance.now() - startPaths;

  if (process.env.PERF_LOG === "1") {
    process.stdout.write(
      `GRAPH_PERF dsep_ms=${dsepMs.toFixed(4)} paths_ms=${pathsMs.toFixed(4)} paths=${paths.length}\n`,
    );
  }

  expect(dsepMs).toBeLessThan(5);
  expect(pathsMs).toBeLessThan(150);
});
