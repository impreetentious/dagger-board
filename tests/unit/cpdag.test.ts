import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dagToCpdag, equivalenceClassDags } from "@/engine/cpdag";
import { canonicalizeGraph, type Graph, type GraphEdge } from "@/engine/graph";

function graphOf(ids: string[], edges: Array<[string, string]>): Graph {
  return canonicalizeGraph({
    v: 1,
    nodes: ids.map((id, idx) => ({ id, idx, name: id.toUpperCase(), kind: "observed" as const })),
    edges: edges.map(([from, to]) => ({ from, to })),
    roles: {},
  });
}

const key = (from: string, to: string) => `${from}->${to}`;
const undirectedKey = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);

describe("dagToCpdag — hand-verified contract cases (§3.15)", () => {
  it("a chain X→M→Y has no compelled edges (both directions are equivalent)", () => {
    const { compelled, reversible } = dagToCpdag(
      graphOf(
        ["x", "m", "y"],
        [
          ["x", "m"],
          ["m", "y"],
        ],
      ),
    );
    expect(compelled).toEqual([]);
    expect(reversible.map((e) => undirectedKey(e.a, e.b)).sort()).toEqual(["m-x", "m-y"]);
  });

  it("a fork X←Z→Y (no collider) is fully reversible", () => {
    const { compelled, reversible } = dagToCpdag(
      graphOf(
        ["z", "x", "y"],
        [
          ["z", "x"],
          ["z", "y"],
        ],
      ),
    );
    expect(compelled).toEqual([]);
    expect(reversible.map((e) => undirectedKey(e.a, e.b)).sort()).toEqual(["x-z", "y-z"]);
  });

  it("an unshielded collider X→C←Y is fully compelled", () => {
    const { compelled, reversible } = dagToCpdag(
      graphOf(
        ["x", "y", "c"],
        [
          ["x", "c"],
          ["y", "c"],
        ],
      ),
    );
    expect(reversible).toEqual([]);
    expect(compelled.map((e) => key(e.from, e.to)).sort()).toEqual(["x->c", "y->c"]);
  });

  it("Meek R1 propagates: X→C←Y plus C→D compels C→D", () => {
    const { compelled, reversible } = dagToCpdag(
      graphOf(
        ["x", "y", "c", "d"],
        [
          ["x", "c"],
          ["y", "c"],
          ["c", "d"],
        ],
      ),
    );
    expect(reversible).toEqual([]);
    expect(compelled.map((e) => key(e.from, e.to)).sort()).toEqual(["c->d", "x->c", "y->c"]);
  });

  it("a shielded triangle X→Y→Z, X→Z has no v-structure and stays reversible", () => {
    const { compelled } = dagToCpdag(
      graphOf(
        ["x", "y", "z"],
        [
          ["x", "y"],
          ["y", "z"],
          ["x", "z"],
        ],
      ),
    );
    expect(compelled).toEqual([]);
  });
});

describe("equivalenceClassDags (§3.15)", () => {
  it("a chain X—M—Y has exactly three member DAGs (no orientation is a collider)", () => {
    const { dags, truncated } = equivalenceClassDags(
      graphOf(
        ["x", "m", "y"],
        [
          ["x", "m"],
          ["m", "y"],
        ],
      ),
    );
    expect(truncated).toBe(false);
    expect(dags.length).toBe(3); // X→M→Y, X←M→Y, X←M←Y — never X→M←Y
  });

  it("a compelled collider X→C←Y has exactly one member (itself)", () => {
    const { dags } = equivalenceClassDags(
      graphOf(
        ["x", "y", "c"],
        [
          ["x", "c"],
          ["y", "c"],
        ],
      ),
    );
    expect(dags.length).toBe(1);
  });

  it("every enumerated member re-derives the same CPDAG (round-trip)", () => {
    const rng = mulberry32(0x51ce);
    for (let trial = 0; trial < 40; trial += 1) {
      const graph = randomDag(rng, 3 + Math.floor(rng() * 4));
      if (graph.edges.length === 0) continue;
      const base = dagToCpdag(graph);
      const baseKey = JSON.stringify(base);
      for (const member of equivalenceClassDags(graph).dags) {
        const memberGraph = graphOf(
          graph.nodes.map((n) => n.id),
          member.map((e) => [e.from, e.to]),
        );
        expect(JSON.stringify(dagToCpdag(memberGraph))).toBe(baseKey);
      }
    }
  });
});

/**
 * Parity against DAGitty's essential-graph algorithm (`GraphTransformer.dagToCpdag`,
 * strongly-protected-edge undirection). The vendored GPL source is used at test
 * time only, exactly as `fixtures/tools/generate-dagitty.mjs` uses it for the
 * Tier-2 corpus. This is the oracle for §3.15.
 */
const require = createRequire(import.meta.url);
const { GraphParser, GraphTransformer } = require(
  resolve(process.cwd(), "fixtures/tools/dagitty/dagitty-node.js"),
);

function dagittyCpdag(graph: Graph): { compelled: Set<string>; reversible: Set<string> } {
  const decls = graph.nodes.map((node) => node.id);
  const edges = graph.edges.map((edge) => `${edge.from} -> ${edge.to}`);
  const model = `dag { ${[...decls, ...edges].join("; ")} }`;
  const pdag = GraphTransformer.dagToCpdag(GraphParser.parseGuess(model));
  const compelled = new Set<string>();
  const reversible = new Set<string>();
  for (const edge of pdag.getEdges()) {
    // Edgetype: 1 = Directed, 2 = Undirected in the vendored source.
    if (edge.directed === 1) compelled.add(key(edge.v1.id, edge.v2.id));
    else reversible.add(undirectedKey(edge.v1.id, edge.v2.id));
  }
  return { compelled, reversible };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDag(rng: () => number, n: number): Graph {
  const ids = Array.from({ length: n }, (_, i) => `n${i}`);
  const edges: GraphEdge[] = [];
  // Only i < j edges → acyclic by construction; density ~0.45.
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (rng() < 0.45) edges.push({ from: ids[i]!, to: ids[j]! });
    }
  }
  return graphOf(
    ids,
    edges.map((e) => [e.from, e.to]),
  );
}

describe("dagToCpdag — DAGitty parity oracle (§3.15)", () => {
  it("matches DAGitty on 300 seeded random DAGs (3–8 nodes)", () => {
    const rng = mulberry32(0x0da66);
    for (let trial = 0; trial < 300; trial += 1) {
      const n = 3 + Math.floor(rng() * 6);
      const graph = randomDag(rng, n);
      if (graph.edges.length === 0) continue;
      const mine = dagToCpdag(graph);
      const oracle = dagittyCpdag(graph);
      const mineCompelled = new Set(mine.compelled.map((e) => key(e.from, e.to)));
      const mineReversible = new Set(mine.reversible.map((e) => undirectedKey(e.a, e.b)));
      expect(mineCompelled, `compelled mismatch on ${JSON.stringify(graph.edges)}`).toEqual(
        oracle.compelled,
      );
      expect(mineReversible, `reversible mismatch on ${JSON.stringify(graph.edges)}`).toEqual(
        oracle.reversible,
      );
    }
  });
});
