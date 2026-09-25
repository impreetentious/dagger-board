import { type Graph, hasEdge } from "@/engine/graph";

/**
 * §3.15 — Markov equivalence class of the drawn DAG (CPDAG / essential graph).
 *
 * Two DAGs are Markov-equivalent iff they share a skeleton and the same set of
 * unshielded colliders (Verma–Pearl 1990). The CPDAG has a **compelled** edge
 * `a → b` wherever every equivalent DAG orients it that way, and an
 * **undirected** (reversible) edge `a — b` wherever the orientation is not
 * determined by the conditional-independence structure — i.e. reversing it
 * yields an equally-valid DAG. For a design instrument this is exactly the
 * "which arrows are assumptions?" readout: compelled edges are forced by the
 * data-testable independencies; reversible edges are pure modelling choices.
 *
 * Scope (v1): the equivalence class is computed over the DAG **as drawn**, across
 * all node kinds. Observable-margin equivalence with latents marginalised out is
 * a MAG/PAG (FCI) problem and is deliberately out of scope (§3.15). The input
 * is always an acyclic directed graph (the editor enforces acyclicity), so the
 * pattern-completion below never has to break a cycle.
 *
 * Algorithm: orient unshielded colliders, then propagate with Meek's rules
 * R1–R3 to a fixpoint (R1–R3 complete the pattern of a DAG into its CPDAG;
 * R4 is only needed for background-knowledge orientation, which v1 does not have).
 * Verified against DAGitty's `GraphTransformer.dagToCpdag` in the Tier-2 corpus.
 */

interface CpdagEdge {
  from: string;
  to: string;
}

interface UndirectedEdge {
  /** endpoint with the smaller creation `idx` (canonical, orientation-free) */
  a: string;
  b: string;
}

export interface CpdagResult {
  /** edges directed the same way in every Markov-equivalent DAG (data-forced) */
  compelled: CpdagEdge[];
  /** skeleton edges whose orientation is a modelling assumption, not data-forced */
  reversible: UndirectedEdge[];
}

function skeletonKey(u: string, v: string): string {
  return u < v ? `${u}\0${v}` : `${v}\0${u}`;
}

function idxOf(graph: Graph, id: string): number {
  return graph.nodes.find((node) => node.id === id)?.idx ?? Number.MAX_SAFE_INTEGER;
}

function adjacentInSkeleton(graph: Graph, u: string, v: string): boolean {
  return hasEdge(graph, u, v) || hasEdge(graph, v, u);
}

/**
 * Unshielded colliders `a → c ← b` with `a`, `b` non-adjacent. These are the
 * only orientations invariant across the whole equivalence class before Meek
 * propagation, and every equivalent DAG shares exactly this collider set.
 */
function unshieldedColliders(graph: Graph): Array<{ a: string; c: string; b: string }> {
  const colliders: Array<{ a: string; c: string; b: string }> = [];
  for (const node of graph.nodes) {
    const parents = graph.edges
      .filter((edge) => edge.to === node.id)
      .map((edge) => edge.from)
      .sort((left, right) => idxOf(graph, left) - idxOf(graph, right));
    for (let i = 0; i < parents.length; i += 1) {
      for (let j = i + 1; j < parents.length; j += 1) {
        const a = parents[i]!;
        const b = parents[j]!;
        if (!adjacentInSkeleton(graph, a, b)) {
          colliders.push({ a, c: node.id, b });
        }
      }
    }
  }
  return colliders;
}

export function dagToCpdag(graph: Graph): CpdagResult {
  // Skeleton as canonical unordered pairs.
  const skeleton = new Map<string, { u: string; v: string }>();
  for (const edge of graph.edges) {
    skeleton.set(skeletonKey(edge.from, edge.to), { u: edge.from, v: edge.to });
  }

  // `directed` holds oriented edges as "from\0to"; `undirectedKeys` the rest.
  const directed = new Set<string>();
  const directedKey = (from: string, to: string) => `${from}\0${to}`;
  const orient = (from: string, to: string) => {
    directed.add(directedKey(from, to));
  };
  const isDirected = (from: string, to: string) => directed.has(directedKey(from, to));
  const isUndirected = (u: string, v: string) =>
    skeleton.has(skeletonKey(u, v)) && !isDirected(u, v) && !isDirected(v, u);

  // Seed with unshielded colliders (invariant orientations).
  for (const { a, c, b } of unshieldedColliders(graph)) {
    orient(a, c);
    orient(b, c);
  }

  const nodeIds = graph.nodes.map((node) => node.id);

  // Meek's rules R1–R3 to a fixpoint.
  let changed = true;
  while (changed) {
    changed = false;

    // R1: a → b and b — c with a, c non-adjacent  ⇒  b → c (else new collider at b).
    for (const [, { u, v }] of skeleton) {
      for (const [from, to] of [
        [u, v],
        [v, u],
      ] as const) {
        if (!isUndirected(from, to)) continue;
        // `from — to` undirected; look for a → from with a not adjacent to `to`.
        for (const a of nodeIds) {
          if (a === from || a === to) continue;
          if (isDirected(a, from) && !adjacentInSkeleton(graph, a, to)) {
            orient(from, to);
            changed = true;
            break;
          }
        }
      }
    }

    // R2: a → c → b and a — b  ⇒  a → b (else a cycle a → c → b → a).
    for (const [, { u, v }] of skeleton) {
      for (const [a, b] of [
        [u, v],
        [v, u],
      ] as const) {
        if (!isUndirected(a, b)) continue;
        for (const c of nodeIds) {
          if (c === a || c === b) continue;
          if (isDirected(a, c) && isDirected(c, b)) {
            orient(a, b);
            changed = true;
            break;
          }
        }
      }
    }

    // R3: a — b, a — c, a — d, c → b, d → b, c, d non-adjacent  ⇒  a → b.
    for (const [, { u, v }] of skeleton) {
      for (const [a, b] of [
        [u, v],
        [v, u],
      ] as const) {
        if (!isUndirected(a, b)) continue;
        const commonToB = nodeIds.filter(
          (w) => w !== a && w !== b && isUndirected(a, w) && isDirected(w, b),
        );
        let oriented = false;
        for (let i = 0; i < commonToB.length && !oriented; i += 1) {
          for (let j = i + 1; j < commonToB.length; j += 1) {
            const c = commonToB[i]!;
            const d = commonToB[j]!;
            if (!adjacentInSkeleton(graph, c, d)) {
              orient(a, b);
              changed = true;
              oriented = true;
              break;
            }
          }
        }
      }
    }
  }

  // Assemble: compelled = directed skeleton edges (DAG direction); the rest reversible.
  const compelled: CpdagEdge[] = [];
  const reversible: UndirectedEdge[] = [];
  for (const [, { u, v }] of skeleton) {
    if (isDirected(u, v)) compelled.push({ from: u, to: v });
    else if (isDirected(v, u)) compelled.push({ from: v, to: u });
    else {
      const [a, b] = idxOf(graph, u) <= idxOf(graph, v) ? [u, v] : [v, u];
      reversible.push({ a, b });
    }
  }

  compelled.sort(
    (left, right) =>
      idxOf(graph, left.from) - idxOf(graph, right.from) ||
      idxOf(graph, left.to) - idxOf(graph, right.to),
  );
  reversible.sort(
    (left, right) =>
      idxOf(graph, left.a) - idxOf(graph, right.a) || idxOf(graph, left.b) - idxOf(graph, right.b),
  );

  return { compelled, reversible };
}

/** Hard cap on enumerated members; 2^12 covers any graph within the 24-edge bound
 *  whose reversible-edge count stays reasonable. Exceeding it returns `truncated`. */
const EQUIVALENCE_CLASS_CAP = 4096;

export interface EquivalenceClass {
  /** each member is the full compelled+oriented-reversible directed edge set */
  dags: CpdagEdge[][];
  /** true if the class was larger than `EQUIVALENCE_CLASS_CAP` and cut short */
  truncated: boolean;
}

function isAcyclic(nodeIds: string[], edges: CpdagEdge[]): boolean {
  const indeg = new Map(nodeIds.map((id) => [id, 0]));
  const out = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const edge of edges) {
    indeg.set(edge.to, (indeg.get(edge.to) ?? 0) + 1);
    out.get(edge.from)!.push(edge.to);
  }
  const queue = nodeIds.filter((id) => (indeg.get(id) ?? 0) === 0);
  let seen = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    seen += 1;
    for (const next of out.get(id) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  return seen === nodeIds.length;
}

function colliderSignature(nodeIds: string[], edges: CpdagEdge[]): string {
  const adj = new Set(edges.flatMap((e) => [`${e.from} ${e.to}`, `${e.to} ${e.from}`]));
  const parentsOf = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const edge of edges) parentsOf.get(edge.to)!.push(edge.from);
  const sig: string[] = [];
  for (const id of nodeIds) {
    const parents = [...parentsOf.get(id)!].sort();
    for (let i = 0; i < parents.length; i += 1) {
      for (let j = i + 1; j < parents.length; j += 1) {
        if (!adj.has(`${parents[i]} ${parents[j]}`)) sig.push(`${parents[i]} ${id} ${parents[j]}`);
      }
    }
  }
  return sig.sort().join("|");
}

/**
 * Every DAG in the drawn graph's Markov equivalence class: the compelled edges
 * fixed, each reversible edge oriented either way, keeping the result acyclic
 * with an unchanged unshielded-collider set. Bounded by {@link EQUIVALENCE_CLASS_CAP}.
 */
export function equivalenceClassDags(graph: Graph): EquivalenceClass {
  const { compelled, reversible } = dagToCpdag(graph);
  const nodeIds = graph.nodes.map((node) => node.id);
  const target = colliderSignature(nodeIds, graph.edges);
  const dags: CpdagEdge[][] = [];
  let truncated = false;

  const total = 1 << reversible.length;
  for (let mask = 0; mask < total; mask += 1) {
    if (dags.length >= EQUIVALENCE_CLASS_CAP) {
      truncated = true;
      break;
    }
    const oriented: CpdagEdge[] = reversible.map((edge, i) =>
      (mask >> i) & 1 ? { from: edge.b, to: edge.a } : { from: edge.a, to: edge.b },
    );
    const candidate = [...compelled, ...oriented];
    if (isAcyclic(nodeIds, candidate) && colliderSignature(nodeIds, candidate) === target) {
      candidate.sort(
        (left, right) =>
          idxOf(graph, left.from) - idxOf(graph, right.from) ||
          idxOf(graph, left.to) - idxOf(graph, right.to),
      );
      dags.push(candidate);
    }
  }
  return { dags, truncated };
}
