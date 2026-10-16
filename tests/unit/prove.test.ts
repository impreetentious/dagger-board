import { validateGraph } from "@/engine/graph";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeSingleEdgeVariants, singleEdgeVariants, proveGraph } from "@/engine/prove";
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

describe("single-edge assumption analysis", () => {
  function drawing(collider = false) {
    const third = collider ? "c" : "z";
    return validateGraph({
      v: 1,
      nodes: ["x", "y", third, "w"].map((id, idx) => ({
        id,
        idx,
        name: id.toUpperCase(),
        kind: "observed",
      })),
      edges: collider
        ? [
            { from: "x", to: "y" },
            { from: "x", to: "c" },
            { from: "y", to: "c" },
          ]
        : [
            { from: "x", to: "y" },
            { from: "z", to: "x" },
            { from: "z", to: "y" },
          ],
      roles: { exposureId: "x", outcomeId: "y" },
    });
  }
  it("derives confounder and collider adjustment consequences from their paths", async () => {
    for (const collider of [false, true]) {
      const graph = drawing(collider);
      expect(proveGraph(graph, new Set()).adjustment?.minimalSets).toEqual(
        collider ? [[]] : [["z"]],
      );
      const result = await analyzeSingleEdgeVariants(graph, new Set());
      const direct = result.entries.find(
        (entry) =>
          entry.change.kind === "delete" && entry.change.from === "x" && entry.change.to === "y",
      )!;
      expect(direct.report?.verdict).toBe("zero-total-effect");
      expect(direct.changed).toBe(true);
      if (!collider)
        expect(
          result.entries.find(
            (entry) =>
              entry.change.kind === "delete" &&
              entry.change.from === "z" &&
              entry.change.to === "x",
          )?.report?.adjustment?.minimalSets,
        ).toEqual([[]]);
      expect(
        singleEdgeVariants(graph).some(
          (entry) =>
            entry.change.kind === "add" && entry.change.from === "y" && entry.change.to === "x",
        ),
      ).toBe(false);
      expect(result.entries.some((entry) => !entry.changed && !entry.refusal)).toBe(true);
    }
  });
  it("discloses refusals, cancellation and the 128-variant cap", async () => {
    const incomplete = { ...drawing(), roles: {} };
    expect(
      (await analyzeSingleEdgeVariants(incomplete, new Set())).entries.every(
        (entry) => entry.refusal !== null,
      ),
    ).toBe(true);
    const graph = validateGraph({
      v: 1,
      nodes: Array.from({ length: 12 }, (_, idx) => ({
        id: `n${idx}`,
        idx,
        name: `N${idx}`,
        kind: "observed",
      })),
      edges: [],
      roles: {},
    });
    const result = await analyzeSingleEdgeVariants(graph, new Set());
    expect(result.total).toBe(132);
    expect(result.inspected).toBe(128);
    expect(result.incomplete).toBe(true);
    const controller = new AbortController();
    controller.abort();
    await expect(
      analyzeSingleEdgeVariants(graph, new Set(), undefined, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
