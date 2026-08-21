import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assumedAbsentEdges, buildAdrDocument } from "@/engine/adr";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

function fixture(file: string) {
  const path = fileURLToPath(new URL(`../../fixtures/tier1/${file}`, import.meta.url));
  return Tier1FixtureSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

describe("WU-8.1 ADR document", () => {
  it("enumerates the assumed-absent list deterministically by (min idx, max idx)", () => {
    const chain = fixture("01-chain.json").graph;
    const absent = assumedAbsentEdges(chain);
    expect(absent).toEqual([{ u: "x", v: "y" }]);
  });

  it("builds an ADR payload for the M-bias canon graph", () => {
    const item = fixture("04-m-bias.json").graph;
    const doc = buildAdrDocument({
      graph: item,
      conditioning: new Set(),
      selection: null,
      seed: 314159,
      n: 10_000,
      timestamp: "static-export",
      appVersion: "0.9.0",
    });
    expect(doc.v).toBe(1);
    expect(doc.exposureId).toBe("x");
    expect(doc.outcomeId).toBe("y");
    expect(doc.independentErrors).toBe(true);
    expect(doc.absentEdges).toEqual([
      { u: "u1", v: "u2" },
      { u: "u1", v: "y" },
      { u: "u2", v: "x" },
      { u: "x", v: "m" },
      { u: "x", v: "y" },
      { u: "m", v: "y" },
    ]);
    expect(doc.identificationVerdict).toBe("zero-total-effect");
  });

  it("captures a selection-active summary when a rule is set", () => {
    const item = fixture("07-berkson-selection.json").graph;
    const doc = buildAdrDocument({
      graph: item,
      conditioning: new Set(),
      selection: { nodeId: "s", quantile: 0.5 },
      seed: 314159,
      n: 10_000,
      timestamp: "static-export",
      appVersion: "0.9.0",
    });
    expect(doc.selection).toEqual({ nodeId: "s", nodeName: "S", quantile: 0.5 });
  });
});
