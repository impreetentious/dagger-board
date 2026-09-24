import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { proveGraph } from "@/engine/prove";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

function fixture(file: string) {
  const path = fileURLToPath(new URL(`../../fixtures/tier1/${file}`, import.meta.url));
  return Tier1FixtureSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

describe("Prove aggregation", () => {
  it("reports the degenerate zero-total-effect and supported strategy states", () => {
    const mBias = proveGraph(fixture("04-m-bias.json").graph, new Set());
    expect(mBias.verdict).toBe("zero-total-effect");
    const frontdoor = proveGraph(fixture("11-frontdoor.json").graph, new Set());
    expect(frontdoor.verdict).toBe("frontdoor");
    const instrument = proveGraph(fixture("09-iv.json").graph, new Set());
    expect(instrument.verdict).toBe("instrument");
  });

  it("keeps path labels and forbidden-conditioning warnings as engine outputs", () => {
    const report = proveGraph(fixture("06-mediator-overcontrol.json").graph, new Set(["m"]));
    expect(report.paths?.paths.some((path) => path.primaryLabel === "causal-blocked")).toBe(true);
    expect(report.paths?.warnings[0]?.nodeIds).toContain("m");
  });
});
