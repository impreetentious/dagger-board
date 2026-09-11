import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { diffDesignReports, evaluateDesign } from "@/engine/design";
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

  it("warns when the Design conditioning playground includes a causal-path descendant", () => {
    const item = fixture("06-mediator-overcontrol.json");
    const report = evaluateDesign(
      item.graph,
      item.parameters ?? defaultScmParameters(item.graph),
      allMeasured(item.graph),
      undefined,
      1000,
      ["m"],
    );
    expect(report.forbiddenConditioningNodeIds).toEqual(["m"]);
  });

  it("diffs two design reports symmetrically for A/B side-by-side", () => {
    const item = fixture("04-m-bias.json");
    const parameters = item.parameters ?? defaultScmParameters(item.graph);
    const base = evaluateDesign(item.graph, parameters, allMeasured(item.graph), undefined, 1000);
    const dropped = { ...allMeasured(item.graph), m: false };
    const other = evaluateDesign(item.graph, parameters, dropped, undefined, 1000);
    const diff = diffDesignReports(base, other);
    expect(diff.length).toBeGreaterThan(0);
    for (const entry of diff) {
      if (entry.side === "both") {
        expect(entry.biasDelta).not.toBeNull();
      } else {
        expect(entry.biasDelta).toBeNull();
      }
    }
    expect(
      diffDesignReports(other, base)
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(diff.map((entry) => entry.id).sort());
  });

  it("threads multiple sequential selection filters through the design table", () => {
    const item = fixture("07-berkson-selection.json");
    const single = evaluateDesign(
      item.graph,
      item.parameters ?? defaultScmParameters(item.graph),
      allMeasured(item.graph),
      { nodeId: "s", quantile: 0.5 },
      1000,
    );
    const same = evaluateDesign(
      item.graph,
      item.parameters ?? defaultScmParameters(item.graph),
      allMeasured(item.graph),
      [{ nodeId: "s", quantile: 0.5 }],
      1000,
    );
    expect(same.selectionApproximation).toBe("exact");
    expect(same.selectionRuleCount).toBe(1);
    expect(same.rows[0].populationBias).toBeCloseTo(single.rows[0].populationBias ?? 0, 12);
  });

  it("surfaces the set-valued frontdoor row and an asymptotic IV SE alongside OLS", () => {
    const setFd = fixture("19-set-frontdoor.json");
    const report = evaluateDesign(
      setFd.graph,
      setFd.parameters ?? defaultScmParameters(setFd.graph),
      allMeasured(setFd.graph),
      undefined,
      10000,
    );
    const frontdoorRow = report.rows.find((row) => row.kind === "frontdoor");
    expect(frontdoorRow?.mediatorIds).toEqual(["m1", "m2"]);
    expect(frontdoorRow?.estimand).toBeCloseTo(0.5, 12);
    expect(report.frontdoorSets).toEqual([["m1", "m2"]]);

    const iv = fixture("09-iv.json");
    const ivReport = evaluateDesign(
      iv.graph,
      iv.parameters ?? defaultScmParameters(iv.graph),
      allMeasured(iv.graph),
      undefined,
      10000,
    );
    const ivRow = ivReport.rows.find((row) => row.kind === "iv");
    expect(ivRow?.standardError).not.toBeNull();
    expect(ivRow?.power ?? 0).toBeGreaterThan(0);
    expect(ivRow?.seLabel).toBe("iv-asymptotic");
  });
});
