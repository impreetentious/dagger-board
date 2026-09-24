import { describe, expect, it } from "vitest";
import corpus from "../../fixtures/tier2/dagitty-corpus.json";
import { enumerateAdjustmentSets } from "@/engine/adjust";
import { dSeparatedBayesBall } from "@/engine/dsep";
import { GraphSchema } from "@/engine/graph";
import { checkConditionalInstrument } from "@/engine/iv";

type CorpusDifference = {
  kind: string;
  reason: string;
  instrument?: string;
  conditioning?: string[];
};

function compareSets(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return left.length - right.length;
  return left.join("\u0000").localeCompare(right.join("\u0000"));
}

describe("Tier-2 DAGitty oracle corpus", () => {
  it("pins source provenance and adjustment-set parity where semantics coincide", () => {
    expect(corpus.provenance.commit).toBe("7a657776dc8f5e5ba4e323edb028e2c2aaf29327");
    expect(corpus.provenance.license).toBe("GPL-2.0-or-later");

    for (const entry of corpus.entries) {
      const graph = GraphSchema.parse(entry.graph);
      const exposureId = graph.roles.exposureId;
      const outcomeId = graph.roles.outcomeId;
      if (!exposureId || !outcomeId) throw new Error("Corpus entry has no exposure/outcome.");
      if (graph.nodes.some((node) => node.kind === "selection")) {
        expect(
          entry.criterionDifferences.some((difference) => difference.kind === "adjustment"),
          entry.id,
        ).toBe(true);
        continue;
      }
      const ours = enumerateAdjustmentSets(graph, exposureId, outcomeId).minimalSets.sort(
        compareSets,
      );
      const theirs = entry.adjustmentSets.map((set) => [...set].sort()).sort(compareSets);
      expect(ours, entry.id).toEqual(theirs);
    }
  });

  it("directly verifies every DAGitty implication with the local d-separation oracle", () => {
    for (const entry of corpus.entries) {
      const graph = GraphSchema.parse(entry.graph);
      const selectionNode = graph.nodes.find((node) => node.kind === "selection");
      for (const implication of entry.implications) {
        for (const set of implication.sets) {
          expect(
            dSeparatedBayesBall(
              graph,
              implication.u,
              implication.v,
              new Set(set),
              selectionNode ? { nodeId: selectionNode.id } : undefined,
            ),
            `${entry.id}: ${implication.u} independent of ${implication.v}`,
          ).toBe(true);
        }
      }
    }
  });

  it("validates every oracle instrument under the conservative total-effect criterion", () => {
    const documentedDifferences = new Set(
      corpus.entries.flatMap((entry) =>
        entry.criterionDifferences
          .map((difference) => difference as CorpusDifference)
          .filter(
            (difference) =>
              difference.kind === "instrument" &&
              Boolean(difference.instrument) &&
              Boolean(difference.conditioning),
          )
          .map(
            (difference) =>
              `${entry.id}\u0000${difference.instrument ?? ""}\u0000${difference.conditioning?.join(",") ?? ""}`,
          ),
      ),
    );
    for (const entry of corpus.entries) {
      const graph = GraphSchema.parse(entry.graph);
      const exposureId = graph.roles.exposureId;
      const outcomeId = graph.roles.outcomeId;
      if (!exposureId || !outcomeId) throw new Error("Corpus entry has no exposure/outcome.");
      for (const instrument of entry.instruments) {
        const check = checkConditionalInstrument(
          graph,
          exposureId,
          outcomeId,
          instrument.instrument,
          new Set(instrument.conditioning),
        );
        if (!check.valid) {
          const key = `${entry.id}\u0000${instrument.instrument}\u0000${instrument.conditioning.join(",")}`;
          expect(documentedDifferences.has(key), key).toBe(true);
        }
      }
    }
  });
});
