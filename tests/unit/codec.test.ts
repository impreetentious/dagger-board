import { describe, expect, it } from "vitest";
import { EXAMPLE_SNAPSHOTS } from "@/content/examples";
import { buildScmModel } from "@/engine/scm";
import { generateSimulationData } from "@/engine/sim";
import {
  decodeGraphFragment,
  encodeGraphFragment,
  graphFragmentStatus,
  pruneLabSnapshot,
  snapshotJson,
} from "@/lib/codec";
import { exportDagittyText, importDagittyText } from "@/lib/dagitty-io";

describe("WU-4.6 codec and interop", () => {
  it("round-trips URL and JSON snapshots with idx and identical seeded draws", async () => {
    const original = EXAMPLE_SNAPSHOTS["m-bias"];
    const fragment = await encodeGraphFragment(original);
    expect(fragment.startsWith("#g=")).toBe(true);
    const decoded = await decodeGraphFragment(fragment);
    const jsonRoundTrip = pruneLabSnapshot(JSON.parse(snapshotJson(original)));
    expect(decoded.graph).toEqual(original.graph);
    expect(jsonRoundTrip.graph).toEqual(original.graph);
    expect(decoded.graph.nodes.map((node) => node.idx)).toEqual([0, 1, 2, 3, 4]);

    const first = generateSimulationData(buildScmModel(original.graph, original.parameters), { seed: 88, n: 100 });
    const second = generateSimulationData(buildScmModel(decoded.graph, decoded.parameters), { seed: 88, n: 100 });
    for (const id of first.nodeIds) expect([...first.columns.get(id)!]).toEqual([...second.columns.get(id)!]);
  });

  it("canonicalizes an input edge permutation before deterministic simulation", () => {
    const original = EXAMPLE_SNAPSHOTS["m-bias"];
    const permuted = pruneLabSnapshot({ ...original, graph: { ...original.graph, edges: [...original.graph.edges].reverse() } });
    expect(permuted.graph.edges).toEqual(original.graph.edges);
    const first = generateSimulationData(buildScmModel(original.graph, original.parameters), { seed: 89, n: 100 });
    const second = generateSimulationData(buildScmModel(permuted.graph, permuted.parameters), { seed: 89, n: 100 });
    expect([...first.columns.get("x")!]).toEqual([...second.columns.get("x")!]);
  });

  it("follows the declared DAGitty mapping and expands bidirected input", () => {
    const snapshot = pruneLabSnapshot({
      ...EXAMPLE_SNAPSHOTS.chain,
      conditioning: ["m"],
      graph: {
        ...EXAMPLE_SNAPSHOTS.chain.graph,
        nodes: EXAMPLE_SNAPSHOTS.chain.graph.nodes.map((node) =>
          node.id === "m" ? { ...node, kind: "selection" as const } : node,
        ),
      },
    });
    const text = exportDagittyText(snapshot);
    const imported = importDagittyText(text);
    const roleNames = (model: typeof snapshot) => ({
      exposure: model.graph.nodes.find((node) => node.id === model.graph.roles.exposureId)?.name,
      outcome: model.graph.nodes.find((node) => node.id === model.graph.roles.outcomeId)?.name,
    });
    expect(roleNames(imported.snapshot)).toEqual(roleNames(snapshot));
    expect(imported.snapshot.graph.nodes.map((node) => node.kind)).toEqual(
      snapshot.graph.nodes.map((node) => node.kind),
    );
    expect(imported.snapshot.conditioning).toEqual([]);
    expect(imported.warnings.some((warning) => warning.includes("Selection kind"))).toBe(true);

    const bidirected = importDagittyText('dag { "A" <-> "B" }');
    expect(bidirected.snapshot.graph.nodes.some((node) => node.kind === "latent")).toBe(true);
    expect(bidirected.snapshot.graph.edges).toHaveLength(2);
  });

  it("never truncates an over-limit share fragment", async () => {
    const status = await graphFragmentStatus(EXAMPLE_SNAPSHOTS["m-bias"]);
    expect(status.shareable).toBe(true);
    expect(status.fragment.length).toBeLessThanOrEqual(2000);
  });
});
