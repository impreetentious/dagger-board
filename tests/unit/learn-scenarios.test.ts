import { describe, expect, it } from "vitest";
import { LEARN_TIER1_FIXTURES } from "@/content/examples";
import {
  openInLabSnapshot,
  LEARN_SCENARIOS,
  LEARN_SLUGS,
  scenarioBySlug,
} from "@/content/learn/scenarios";

describe("Learn scenario schema", () => {
  it("ships all six canonical traps", () => {
    expect(LEARN_SCENARIOS).toHaveLength(6);
    expect(LEARN_SLUGS).toEqual([
      "confounding",
      "overcontrol",
      "collider-trap",
      "m-bias",
      "selection-bias",
      "measurement-error",
    ]);
  });

  it("ordinals are 1..6, unique and consecutive", () => {
    const ordinals = LEARN_SCENARIOS.map((scenario) => scenario.ordinal).sort();
    expect(ordinals).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("scenarioBySlug returns the right entry and undefined for misses", () => {
    expect(scenarioBySlug("m-bias")?.title).toBe("M-bias");
    expect(scenarioBySlug("does-not-exist")).toBeUndefined();
  });

  it("every scenario advertises a correct choice and offers ≥2 choices", () => {
    for (const scenario of LEARN_SCENARIOS) {
      expect(scenario.choices.length, scenario.slug).toBeGreaterThanOrEqual(2);
      expect(scenario.choices.filter((choice) => choice.correct).length, scenario.slug).toBe(1);
    }
  });

  it("opens every lesson with the graph from its own Tier-1 fixture", () => {
    const fixtures = LEARN_TIER1_FIXTURES as Record<string, { graph: { nodes: { id: string }[] } }>;
    for (const scenario of LEARN_SCENARIOS) {
      const snapshot = openInLabSnapshot(scenario);
      const fixture = fixtures[scenario.fixtureId];
      expect(snapshot, scenario.slug).not.toBeNull();
      expect(fixture, scenario.fixtureId).toBeDefined();
      expect(snapshot?.graph.nodes.map((node) => node.id).sort()).toEqual(
        fixture?.graph.nodes.map((node) => node.id).sort(),
      );
    }
  });

  it("measurement-error carries its secondary reference", () => {
    const scenario = scenarioBySlug("measurement-error");
    expect(scenario?.secondaryReference?.label).toMatch(/latent/i);
  });
});
