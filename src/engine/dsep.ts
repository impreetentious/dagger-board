import { descendantsOf, hasEdge, nodeById, type Graph, type GraphNode } from "@/engine/graph";
import { enumerateSimplePaths } from "@/engine/paths";

export interface SelectionContext {
  nodeId: string;
}

interface ColliderWitness {
  colliderId: string;
  conditionedNodeIds: string[];
  openedByVirtualSelectionIndicator: boolean;
}

interface PathBlocker {
  nodeId: string;
  reason: "conditioned-noncollider" | "unconditioned-collider";
}

export interface PathEvaluation {
  isOpen: boolean;
  blockers: PathBlocker[];
  colliders: ColliderWitness[];
}

interface Topology {
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
}

const topologyCache = new WeakMap<Graph, Topology>();

function topologyFor(graph: Graph): Topology {
  const cached = topologyCache.get(graph);
  if (cached) return cached;
  const indices = new Map(graph.nodes.map((node) => [node.id, node.idx]));
  const parents = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  const children = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    parents.get(edge.to)?.push(edge.from);
    children.get(edge.from)?.push(edge.to);
  }
  for (const neighbors of [...parents.values(), ...children.values()]) {
    neighbors.sort((left, right) => (indices.get(left) ?? 0) - (indices.get(right) ?? 0));
  }
  const topology = { parents, children };
  topologyCache.set(graph, topology);
  return topology;
}

function ancestorIds(topology: Topology, ids: Iterable<string>): Set<string> {
  const ancestors = new Set<string>();
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.pop();
    if (!id || ancestors.has(id)) continue;
    ancestors.add(id);
    for (const parent of topology.parents.get(id) ?? []) queue.push(parent);
  }
  return ancestors;
}

function virtualIndicatorId(selection: SelectionContext): string {
  return `__selection_indicator__${selection.nodeId}`;
}

function augmentedForSelection(graph: Graph, selection?: SelectionContext): Graph {
  if (!selection) return graph;
  nodeById(graph, selection.nodeId);
  const indicator: GraphNode = {
    id: virtualIndicatorId(selection),
    idx: Math.max(-1, ...graph.nodes.map((node) => node.idx)) + 1,
    name: "Selection indicator",
    kind: "selection",
  };
  return {
    ...graph,
    nodes: [...graph.nodes, indicator],
    edges: [...graph.edges, { from: selection.nodeId, to: indicator.id }],
  };
}

function effectiveConditioned(
  conditioned: ReadonlySet<string>,
  selection?: SelectionContext,
): Set<string> {
  const result = new Set(conditioned);
  if (selection) result.add(virtualIndicatorId(selection));
  return result;
}

export function isCollider(graph: Graph, path: readonly string[], index: number): boolean {
  if (index <= 0 || index >= path.length - 1) return false;
  const previous = path[index - 1];
  const current = path[index];
  const next = path[index + 1];
  return hasEdge(graph, previous, current) && hasEdge(graph, next, current);
}

function colliderWitness(
  graph: Graph,
  colliderId: string,
  conditioned: ReadonlySet<string>,
  selection?: SelectionContext,
): ColliderWitness {
  const descendants = descendantsOf(graph, [colliderId]);
  const conditionedNodeIds = [...conditioned].filter((id) => descendants.has(id));
  const openedByVirtualSelectionIndicator = Boolean(selection && descendants.has(selection.nodeId));
  return { colliderId, conditionedNodeIds, openedByVirtualSelectionIndicator };
}

export function evaluatePath(
  graph: Graph,
  path: readonly string[],
  conditioned: ReadonlySet<string>,
  selection?: SelectionContext,
): PathEvaluation {
  const blockers: PathBlocker[] = [];
  const colliders: ColliderWitness[] = [];
  for (let index = 1; index < path.length - 1; index += 1) {
    const id = path[index];
    if (isCollider(graph, path, index)) {
      const witness = colliderWitness(graph, id, conditioned, selection);
      colliders.push(witness);
      if (witness.conditionedNodeIds.length === 0 && !witness.openedByVirtualSelectionIndicator) {
        blockers.push({ nodeId: id, reason: "unconditioned-collider" });
      }
    } else if (conditioned.has(id)) {
      blockers.push({ nodeId: id, reason: "conditioned-noncollider" });
    }
  }
  return { isOpen: blockers.length === 0, blockers, colliders };
}

export function dSeparatedByPaths(
  graph: Graph,
  from: string,
  to: string,
  conditioned: ReadonlySet<string>,
  selection?: SelectionContext,
): boolean {
  return enumerateSimplePaths(graph, from, to).every(
    (path) => !evaluatePath(graph, path.nodeIds, conditioned, selection).isOpen,
  );
}

/**
 * Bayes-Ball reachability. Selection is represented only here as the internal
 * conditioned leaf required by §3.0; it never appears in the rendered graph.
 */
export function dSeparatedBayesBall(
  graph: Graph,
  from: string,
  to: string,
  conditioned: ReadonlySet<string>,
  selection?: SelectionContext,
): boolean {
  const queryGraph = augmentedForSelection(graph, selection);
  const observed = effectiveConditioned(conditioned, selection);
  const topology = topologyFor(queryGraph);
  const ancestorsOfObserved = ancestorIds(topology, observed);
  type Direction = "up" | "down";
  const queue: Array<{ id: string; direction: Direction }> = [
    { id: from, direction: "up" },
    { id: from, direction: "down" },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const state = queue.shift();
    if (!state) break;
    const key = `${state.id}\u0000${state.direction}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (state.id === to) return false;

    if (state.direction === "up" && !observed.has(state.id)) {
      for (const parent of topology.parents.get(state.id) ?? [])
        queue.push({ id: parent, direction: "up" });
      for (const child of topology.children.get(state.id) ?? [])
        queue.push({ id: child, direction: "down" });
    }

    if (state.direction === "down") {
      if (!observed.has(state.id)) {
        for (const child of topology.children.get(state.id) ?? [])
          queue.push({ id: child, direction: "down" });
      }
      if (ancestorsOfObserved.has(state.id)) {
        for (const parent of topology.parents.get(state.id) ?? [])
          queue.push({ id: parent, direction: "up" });
      }
    }
  }

  return true;
}
