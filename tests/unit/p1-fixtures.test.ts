import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyPaths } from "@/engine/classify";
import { dSeparatedBayesBall, dSeparatedByPaths } from "@/engine/dsep";
import { enumerateSimplePaths } from "@/engine/paths";
import { Tier1FixtureSchema, type Tier1Fixture } from "../../fixtures/tier1/schema";

const fixtureDirectory = fileURLToPath(new URL("../../fixtures/tier1/", import.meta.url));
const fixtures = readdirSync(fixtureDirectory)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) =>
    Tier1FixtureSchema.parse(JSON.parse(readFileSync(`${fixtureDirectory}/${file}`, "utf8"))),
  ) as Tier1Fixture[];

describe("P1 Tier-1 fixtures", () => {
  it("contains the complete 18-fixture canon", () => {
    expect(fixtures).toHaveLength(18);
    expect(fixtures.map((fixture) => fixture.id)).toContain("adversarial-perf");
  });

  for (const fixture of fixtures) {
    it(`${fixture.id} agrees between both d-separation implementations`, () => {
      const { graph } = fixture;
      for (const query of fixture.expectedP1.dSeparation) {
        const conditioned = new Set(query.conditioned);
        const selection = query.selectionNodeId ? { nodeId: query.selectionNodeId } : undefined;
        expect(dSeparatedBayesBall(graph, query.from, query.to, conditioned, selection)).toBe(
          query.separated,
        );
        expect(dSeparatedByPaths(graph, query.from, query.to, conditioned, selection)).toBe(
          query.separated,
        );
      }
    });

    it(`${fixture.id} reports its hand-derived path labels`, () => {
      const { graph } = fixture;
      const exposureId = graph.roles.exposureId;
      const outcomeId = graph.roles.outcomeId;
      if (!exposureId || !outcomeId) throw new Error("Tier-1 fixtures require roles.");
      for (const expectation of fixture.expectedP1.paths) {
        const result = classifyPaths(
          graph,
          exposureId,
          outcomeId,
          new Set(expectation.conditioned),
          expectation.selectionNodeId ? { nodeId: expectation.selectionNodeId } : undefined,
        );
        expect(result.paths.map((path) => path.primaryLabel)).toEqual(expectation.primaryLabels);
      }
    });
  }

  it("preserves the multi-descendant collider witness set", () => {
    const fixture = fixtures.find((candidate) => candidate.id === "multi-descendant-collider");
    if (!fixture) throw new Error("Missing fixture #18.");
    const result = classifyPaths(fixture.graph, "x", "y", new Set(["d1", "d2"]));
    expect(result.paths[0]?.colliderOpeningWitnesses).toEqual([
      { colliderId: "c", nodeIds: ["d1", "d2"] },
    ]);
  });

  it("keeps the cap fixture within the P1 path-enumeration budget", () => {
    const fixture = fixtures.find((candidate) => candidate.id === "adversarial-perf");
    if (!fixture) throw new Error("Missing fixture #14.");
    const start = performance.now();
    const paths = enumerateSimplePaths(fixture.graph, "x", "y");
    const elapsed = performance.now() - start;
    expect(paths.length).toBeGreaterThan(30);
    expect(elapsed).toBeLessThan(150);
  });
});
