import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkAdjustmentSet, enumerateAdjustmentSets, properBackdoorGraph } from "@/engine/adjust";
import { enumerateFrontdoorMediators } from "@/engine/frontdoor";
import { enumerateImpliedConditionalIndependencies } from "@/engine/implications";
import { checkConditionalInstrument, enumerateConditionalInstruments } from "@/engine/iv";
import { hasEdge } from "@/engine/graph";
import { Tier1FixtureSchema, type Tier1Fixture } from "../../fixtures/tier1/schema";

const fixtureDirectory = fileURLToPath(new URL("../../fixtures/tier1/", import.meta.url));
const fixtures = readdirSync(fixtureDirectory)
  .filter((file) => file.endsWith(".json"))
  .map((file) =>
    Tier1FixtureSchema.parse(JSON.parse(readFileSync(`${fixtureDirectory}/${file}`, "utf8"))),
  ) as Tier1Fixture[];

function fixture(id: string): Tier1Fixture {
  const found = fixtures.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing fixture: ${id}`);
  return found;
}

describe("adjustment", () => {
  it("enumerates the expected minimal sets and the generalized descendant case", () => {
    const chain = fixture("chain").graph;
    const fork = fixture("fork").graph;
    const none = fixture("no-adjustment").graph;
    const generalized = fixture("generalized-adjustment").graph;

    expect(enumerateAdjustmentSets(chain, "x", "y").minimalSets).toEqual([[]]);
    expect(enumerateAdjustmentSets(fork, "x", "y").minimalSets).toEqual([["u"]]);
    expect(enumerateAdjustmentSets(none, "x", "y").minimalSets).toEqual([]);
    expect(checkAdjustmentSet(generalized, "x", "y", new Set(["d"])).valid).toBe(true);
    expect(enumerateAdjustmentSets(generalized, "x", "y").minimalSets).toEqual([[]]);
  });

  it("cuts exactly the first edges of proper causal paths", () => {
    const graph = fixture("chain").graph;
    const pbd = properBackdoorGraph(graph, "x", "y");
    expect(hasEdge(pbd, "x", "m")).toBe(false);
    expect(hasEdge(pbd, "m", "y")).toBe(true);
  });
});

describe("frontdoor and conditional IV", () => {
  it("finds the singleton frontdoor mediator", () => {
    const graph = fixture("frontdoor").graph;
    expect(enumerateFrontdoorMediators(graph, "x", "y")).toEqual({
      mediatorIds: ["m"],
      reason: "identified",
    });
  });

  it("finds classic and conditional instruments while rejecting descendants", () => {
    const classic = fixture("iv").graph;
    const conditional = fixture("conditional-iv").graph;
    const descendant = fixture("iv-descendant-negative").graph;
    const repairedDescendant = fixture("iv-descendant-repair-negative").graph;

    expect(enumerateConditionalInstruments(classic, "x", "y")).toEqual([
      { instrumentId: "z", conditioningSets: [[]] },
    ]);
    expect(enumerateConditionalInstruments(conditional, "x", "y")).toContainEqual({
      instrumentId: "z",
      conditioningSets: [["w"]],
    });
    expect(checkConditionalInstrument(descendant, "x", "y", "z", new Set()).nonDescendant).toBe(
      false,
    );
    expect(checkConditionalInstrument(repairedDescendant, "x", "y", "z", new Set()).valid).toBe(
      false,
    );
  });
});

describe("testable implications", () => {
  it("enumerates all minimal observed separators and honors active selection", () => {
    const chain = fixture("chain").graph;
    const selected = fixture("berkson-selection").graph;
    expect(enumerateImpliedConditionalIndependencies(chain)).toEqual([
      { leftId: "x", rightId: "y", separatorIds: ["m"] },
    ]);
    expect(enumerateImpliedConditionalIndependencies(selected, { nodeId: "s" })).toEqual([]);
  });
});
