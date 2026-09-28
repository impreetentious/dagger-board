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

describe("codec and interoperability", () => {
  it("round-trips URL and JSON snapshots with idx and identical seeded draws", async () => {
    const original = EXAMPLE_SNAPSHOTS["m-bias"];
    const fragment = await encodeGraphFragment(original);
    expect(fragment.startsWith("#g=")).toBe(true);
    const decoded = await decodeGraphFragment(fragment);
    const jsonRoundTrip = pruneLabSnapshot(JSON.parse(snapshotJson(original)));
    expect(decoded.graph).toEqual(original.graph);
    expect(jsonRoundTrip.graph).toEqual(original.graph);
    expect(decoded.graph.nodes.map((node) => node.idx)).toEqual([0, 1, 2, 3, 4]);

    const first = generateSimulationData(buildScmModel(original.graph, original.parameters), {
      seed: 88,
      n: 100,
    });
    const second = generateSimulationData(buildScmModel(decoded.graph, decoded.parameters), {
      seed: 88,
      n: 100,
    });
    for (const id of first.nodeIds)
      expect([...first.columns.get(id)!]).toEqual([...second.columns.get(id)!]);
  });

  it("canonicalizes an input edge permutation before deterministic simulation", () => {
    const original = EXAMPLE_SNAPSHOTS["m-bias"];
    const permuted = pruneLabSnapshot({
      ...original,
      graph: { ...original.graph, edges: [...original.graph.edges].reverse() },
    });
    expect(permuted.graph.edges).toEqual(original.graph.edges);
    const first = generateSimulationData(buildScmModel(original.graph, original.parameters), {
      seed: 89,
      n: 100,
    });
    const second = generateSimulationData(buildScmModel(permuted.graph, permuted.parameters), {
      seed: 89,
      n: 100,
    });
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

  // Published DAGitty models are usually written with bare identifiers. Accepting
  // only the fully quoted form dropped every edge without saying so, which turns a
  // confounded model into "TE ≡ 0" instead of an error.
  it("imports unquoted, unspaced, and chained DAGitty edges", () => {
    const named = (result: ReturnType<typeof importDagittyText>) => {
      const nameById = new Map(result.snapshot.graph.nodes.map((node) => [node.id, node.name]));
      return result.snapshot.graph.edges
        .map((edge) => `${nameById.get(edge.from)}->${nameById.get(edge.to)}`)
        .sort();
    };

    const unquoted = importDagittyText(
      "dag { X [exposure]; Y [outcome]; U [latent]; U -> X; U -> Y; X -> Y }",
    );
    expect(named(unquoted)).toEqual(["U->X", "U->Y", "X->Y"]);
    expect(unquoted.warnings).toEqual([]);

    expect(named(importDagittyText("dag { X [exposure]; Y [outcome]; X->M; M->Y }"))).toEqual([
      "M->Y",
      "X->M",
    ]);
    expect(named(importDagittyText("dag { X [exposure]; Y [outcome]; X -> M -> Y }"))).toEqual([
      "M->Y",
      "X->M",
    ]);
    expect(named(importDagittyText('dag { "X" -> Y }'))).toEqual(["X->Y"]);
    expect(importDagittyText("dag { A <-> B }").snapshot.graph.edges).toHaveLength(2);

    // A quoted name may itself contain an arrow; it must not be split on one.
    const literal = importDagittyText('dag { "A -> B" -> "C" }');
    expect(literal.snapshot.graph.nodes.map((node) => node.name)).toEqual(["A -> B", "C"]);
    expect(literal.snapshot.graph.edges).toHaveLength(1);
  });

  it("reports statements it cannot read instead of dropping them", () => {
    const result = importDagittyText("dag { A -- B; C }");
    expect(result.snapshot.graph.edges).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes("unreadable"))).toBe(true);
  });

  // Import replaces the drawn model. The textarea starts empty and its button
  // sits next to it, so an import that reads nothing has to fail loudly rather
  // than hand back an empty graph and report success.
  it("refuses an import that reads no model instead of clearing the drawn one", () => {
    for (const text of ["", "   ", "dag { }"]) {
      expect(() => importDagittyText(text), JSON.stringify(text)).toThrow(/no DAGitty model/i);
    }
    expect(() => importDagittyText("hello world")).toThrow(/could be read/i);
  });

  it("never truncates an over-limit share fragment", async () => {
    const status = await graphFragmentStatus(EXAMPLE_SNAPSHOTS["m-bias"]);
    expect(status.shareable).toBe(true);
    expect(status.fragment.length).toBeLessThanOrEqual(2000);
  });
});
