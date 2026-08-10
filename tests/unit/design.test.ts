import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateDesign } from "@/engine/design";
import { defaultScmParameters } from "@/engine/scm";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

function fixture(file: string) {
  const path = fileURLToPath(new URL(`../../fixtures/tier1/${file}`, import.meta.url));
  return Tier1FixtureSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

function allMeasured(graph: ReturnType<typeof fixture>["graph"]) {
  return Object.fromEntries(
    graph.nodes.filter((node) => node.kind === "observed").map((node) => [node.id, true]),
  );
}

describe("WU-6.2 design table", () => {
  it("uses exact selection covariance, expected effective n, and a parented selection node", () => {
    const item = fixture("07-berkson-selection.json");
    const report = evaluateDesign(
      item.graph,
      item.parameters ?? defaultScmParameters(item.graph),
      allMeasured(item.graph),
      { nodeId: "s", quantile: 0.5 },
      1000,
    );
    expect(report.selectionActive).toBe(true);
    expect(report.effectiveN).toBeCloseTo(500, 12);
    expect(report.rows[0].kind).toBe("naive");
    expect(report.rows[0].populationBias).toBeLessThan(0);
  });

  it("sorts zero-bias rows first and only crowns a zero-bias row", () => {
    const item = fixture("04-m-bias.json");
    const report = evaluateDesign(
      item.graph,
      item.parameters ?? defaultScmParameters(item.graph),
      allMeasured(item.graph),
      undefined,
      1000,
    );
    expect(report.rows[0].populationBias).toBeCloseTo(0, 12);
    expect(report.bestRowId).toBe(report.rows[0].id);
    expect(report.rows.some((row) => row.conditioningIds.includes("m"))).toBe(false);
  });
});
