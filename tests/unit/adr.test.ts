import { LEARN_FIXTURE_SNAPSHOTS } from "@/content/examples";
import { mathematicalSnapshotJson, snapshotJson } from "@/lib/codec";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assumedAbsentEdges, buildAdrDocument, readAdrDocument } from "@/engine/adr";
import { Tier1FixtureSchema } from "../../fixtures/tier1/schema";

function fixture(file: string) {
  const path = fileURLToPath(new URL(`../../fixtures/tier1/${file}`, import.meta.url));
  return Tier1FixtureSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

describe("ADR document", () => {
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
      timestamp: "2026-07-29T00:00:00.000Z",
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
    expect(doc.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("captures a selection-active summary when a rule is set", () => {
    const item = fixture("07-berkson-selection.json").graph;
    const doc = buildAdrDocument({
      graph: item,
      conditioning: new Set(),
      selection: { nodeId: "s", quantile: 0.5 },
      seed: 314159,
      n: 10_000,
      timestamp: "2026-07-29T00:00:00.000Z",
      appVersion: "0.9.0",
    });
    expect(doc.selection).toEqual({ nodeId: "s", nodeName: "S", quantile: 0.5 });
  });
});

describe("reproducible ADR input provenance", () => {
  it("recomputes a selected, conditioned, non-default SCM with measurement error", () => {
    const base = structuredClone(LEARN_FIXTURE_SNAPSHOTS["berkson-selection"]);
    base.graph.nodes.push({
      id: "z",
      idx: 10,
      name: "Z",
      kind: "observed",
      position: { x: 0, y: 0 },
    });
    base.parameters.errorSds.z = 1;
    base.reliability.z = 1;
    base.measured.z = true;
    base.conditioning = ["z"];
    base.seed = 47;
    base.n = 1200;
    base.reliability.x = 0.8;
    const key = Object.keys(base.parameters.edgeCoefficients)[0]!;
    base.parameters.edgeCoefficients[key] = 0.7;
    const inputs = {
      graph: base.graph,
      conditioning: new Set(base.conditioning),
      selection: base.selection,
      seed: base.seed,
      n: base.n,
      timestamp: "2026-10-03T00:00:00.000Z",
      appVersion: "0.17.4",
      labSnapshot: base,
    };
    const original = buildAdrDocument(inputs);
    const imported = readAdrDocument(
      JSON.stringify({
        ...original,
        identificationVerdict: "fabricated",
        robustness: {
          estimand: 99,
          robustnessValue: 99,
          robustnessValueSignFlip: 99,
          statement: "fabricated",
        },
      }),
    );
    expect(imported.kind).toBe("reproducible");
    if (imported.kind !== "reproducible") return;
    expect(imported.snapshot).toEqual(base);
    expect(imported.document.identificationVerdict).toBe(original.identificationVerdict);
    expect(imported.document.robustness).toEqual(original.robustness);
    const moved = structuredClone(base);
    moved.graph.nodes[0]!.position = { x: -100, y: 400 };
    expect(mathematicalSnapshotJson(moved)).toBe(mathematicalSnapshotJson(base));
    expect(snapshotJson(moved)).not.toBe(snapshotJson(base));
    moved.seed += 1;
    expect(mathematicalSnapshotJson(moved)).not.toBe(mathematicalSnapshotJson(base));
  });
  it("keeps old summary-only documents separate and refuses invalid mathematical references", () => {
    const graph = fixture("01-chain.json").graph;
    const legacy = buildAdrDocument({
      graph,
      conditioning: new Set(),
      selection: null,
      seed: 47,
      n: 1200,
      timestamp: "old",
      appVersion: "old",
    });
    expect(readAdrDocument(JSON.stringify(legacy)).kind).toBe("legacy");
    const snapshot = structuredClone(LEARN_FIXTURE_SNAPSHOTS["berkson-selection"]);
    for (const patch of [
      { conditioning: ["missing"] },
      {
        parameters: {
          ...snapshot.parameters,
          errorSds: { ...snapshot.parameters.errorSds, missing: 1 },
        },
      },
      { parameters: { ...snapshot.parameters, edgeCoefficients: {} } },
      { selection: { nodeId: "x", quantile: 0.5 } },
      { reliability: { missing: 0.5 } },
    ]) {
      expect(() =>
        readAdrDocument(JSON.stringify({ ...legacy, labSnapshot: { ...snapshot, ...patch } })),
      ).toThrow();
    }
  });
});
