import * as z from "zod/mini";

const MAX_NODES = 12;
const MAX_EDGES = 24;

const NodeKindSchema = z.enum(["observed", "latent", "selection"]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

const NodeSchema = z.object({
  id: z.string().check(z.minLength(1)),
  idx: z.number().check(z.int(), z.nonnegative()),
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(64)),
  kind: NodeKindSchema,
  position: z.optional(
    z.object({
      x: z.number(),
      y: z.number(),
    }),
  ),
});
export type GraphNode = z.infer<typeof NodeSchema>;

const EdgeSchema = z.object({
  from: z.string().check(z.minLength(1)),
  to: z.string().check(z.minLength(1)),
});
export type GraphEdge = z.infer<typeof EdgeSchema>;

const RolesSchema = z.object({
  exposureId: z.optional(z.string().check(z.minLength(1))),
  outcomeId: z.optional(z.string().check(z.minLength(1))),
});
export type GraphRoles = z.infer<typeof RolesSchema>;

const GraphShapeSchema = z.object({
  v: z.literal(1),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  roles: z._default(RolesSchema, {}),
});

export type Graph = z.infer<typeof GraphShapeSchema>;

export class GraphMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphMutationError";
  }
}

function indexedNodes(graph: Pick<Graph, "nodes">) {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function edgeComparator(nodesById: Map<string, GraphNode>) {
  return (left: GraphEdge, right: GraphEdge) => {
    const leftChild = nodesById.get(left.to)?.idx ?? Number.MAX_SAFE_INTEGER;
    const rightChild = nodesById.get(right.to)?.idx ?? Number.MAX_SAFE_INTEGER;
    if (leftChild !== rightChild) return leftChild - rightChild;

    const leftParent = nodesById.get(left.from)?.idx ?? Number.MAX_SAFE_INTEGER;
    const rightParent = nodesById.get(right.from)?.idx ?? Number.MAX_SAFE_INTEGER;
    return leftParent - rightParent;
  };
}

export function canonicalizeGraph(graph: Graph): Graph {
  const nodes = [...graph.nodes].sort((left, right) => left.idx - right.idx);
  const nodesById = indexedNodes({ nodes });
  return {
    ...graph,
    nodes,
    edges: [...graph.edges].sort(edgeComparator(nodesById)),
    roles: { ...graph.roles },
  };
}

function isAcyclic(graph: Pick<Graph, "nodes" | "edges">) {
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const children = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    children.get(edge.from)?.push(edge.to);
  }

  const nodesById = indexedNodes(graph);
  const ready = graph.nodes
    .filter((node) => indegree.get(node.id) === 0)
    .sort((left, right) => left.idx - right.idx)
    .map((node) => node.id);
  let visited = 0;

  while (ready.length > 0) {
    const id = ready.shift();
    if (!id) break;
    visited += 1;
    for (const childId of children.get(id) ?? []) {
      const nextDegree = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, nextDegree);
      if (nextDegree === 0) {
        ready.push(childId);
        ready.sort(
          (left, right) => (nodesById.get(left)?.idx ?? 0) - (nodesById.get(right)?.idx ?? 0),
        );
      }
    }
  }

  return visited === graph.nodes.length;
}

export const GraphSchema = GraphShapeSchema.check(
  z.superRefine((graph: Graph, context) => {
    if (graph.nodes.length > MAX_NODES) {
      context.addIssue({
        code: "custom",
        message: `A graph can contain at most ${MAX_NODES} nodes.`,
        path: ["nodes"],
      });
    }
    if (graph.edges.length > MAX_EDGES) {
      context.addIssue({
        code: "custom",
        message: `A graph can contain at most ${MAX_EDGES} edges.`,
        path: ["edges"],
      });
    }

    const ids = new Set<string>();
    const idxs = new Set<number>();
    const names = new Set<string>();
    for (const [index, node] of graph.nodes.entries()) {
      if (ids.has(node.id)) {
        context.addIssue({
          code: "custom",
          message: "Node ids must be unique.",
          path: ["nodes", index, "id"],
        });
      }
      ids.add(node.id);
      if (idxs.has(node.idx)) {
        context.addIssue({
          code: "custom",
          message: "Node idx values must be unique.",
          path: ["nodes", index, "idx"],
        });
      }
      idxs.add(node.idx);
      const normalizedName = node.name.toLocaleLowerCase();
      if (names.has(normalizedName)) {
        context.addIssue({
          code: "custom",
          message: "Display names must be unique, ignoring case.",
          path: ["nodes", index, "name"],
        });
      }
      names.add(normalizedName);
    }

    const seenEdges = new Set<string>();
    for (const [index, edge] of graph.edges.entries()) {
      if (!ids.has(edge.from) || !ids.has(edge.to)) {
        context.addIssue({
          code: "custom",
          message: "Every edge endpoint must exist.",
          path: ["edges", index],
        });
      }
      if (edge.from === edge.to) {
        context.addIssue({
          code: "custom",
          message: "Self edges are not allowed.",
          path: ["edges", index],
        });
      }
      const key = `${edge.from}\u0000${edge.to}`;
      if (seenEdges.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate edges are not allowed.",
          path: ["edges", index],
        });
      }
      seenEdges.add(key);
    }

    if (ids.size === graph.nodes.length && !isAcyclic(graph)) {
      context.addIssue({ code: "custom", message: "The graph must be acyclic.", path: ["edges"] });
    }

    const nodesById = indexedNodes(graph);
    const { exposureId, outcomeId } = graph.roles;
    if (exposureId && nodesById.get(exposureId)?.kind !== "observed") {
      context.addIssue({
        code: "custom",
        message: "The exposure must be observed.",
        path: ["roles", "exposureId"],
      });
    }
    if (outcomeId && nodesById.get(outcomeId)?.kind !== "observed") {
      context.addIssue({
        code: "custom",
        message: "The outcome must be observed.",
        path: ["roles", "outcomeId"],
      });
    }
    if (exposureId && outcomeId && exposureId === outcomeId) {
      context.addIssue({
        code: "custom",
        message: "Exposure and outcome must differ.",
        path: ["roles"],
      });
    }
  }),
);

export const EMPTY_GRAPH: Graph = { v: 1, nodes: [], edges: [], roles: {} };

export function validateGraph(graph: Graph): Graph {
  return GraphSchema.parse(canonicalizeGraph(graph));
}

export function nodeById(graph: Pick<Graph, "nodes">, id: string): GraphNode {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new GraphMutationError(`Unknown node: ${id}`);
  return node;
}

export function topologicalOrder(graph: Pick<Graph, "nodes" | "edges">): string[] {
  if (!isAcyclic(graph))
    throw new GraphMutationError("A topological order requires an acyclic graph.");
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const children = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    children.get(edge.from)?.push(edge.to);
  }
  const nodesById = indexedNodes(graph);
  const order: string[] = [];
  const ready = graph.nodes
    .filter((node) => indegree.get(node.id) === 0)
    .sort((left, right) => left.idx - right.idx)
    .map((node) => node.id);
  while (ready.length > 0) {
    const id = ready.shift();
    if (!id) break;
    order.push(id);
    for (const child of children.get(id) ?? []) {
      const nextDegree = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, nextDegree);
      if (nextDegree === 0) {
        ready.push(child);
        ready.sort(
          (left, right) => (nodesById.get(left)?.idx ?? 0) - (nodesById.get(right)?.idx ?? 0),
        );
      }
    }
  }
  return order;
}

function sortedIds(graph: Pick<Graph, "nodes">, ids: Iterable<string>): string[] {
  const nodesById = indexedNodes(graph);
  return [...ids].sort(
    (left, right) => (nodesById.get(left)?.idx ?? 0) - (nodesById.get(right)?.idx ?? 0),
  );
}

export function parentsOf(graph: Pick<Graph, "nodes" | "edges">, id: string): string[] {
  return sortedIds(
    graph,
    graph.edges.filter((edge) => edge.to === id).map((edge) => edge.from),
  );
}

export function childrenOf(graph: Pick<Graph, "nodes" | "edges">, id: string): string[] {
  return sortedIds(
    graph,
    graph.edges.filter((edge) => edge.from === id).map((edge) => edge.to),
  );
}

function closure(ids: Iterable<string>, next: (id: string) => string[]): Set<string> {
  const visited = new Set<string>();
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of next(id)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return visited;
}

export function ancestorsOf(
  graph: Pick<Graph, "nodes" | "edges">,
  ids: Iterable<string>,
): Set<string> {
  return closure(ids, (id) => parentsOf(graph, id));
}

export function descendantsOf(
  graph: Pick<Graph, "nodes" | "edges">,
  ids: Iterable<string>,
): Set<string> {
  return closure(ids, (id) => childrenOf(graph, id));
}

export function hasEdge(graph: Pick<Graph, "edges">, from: string, to: string): boolean {
  return graph.edges.some((edge) => edge.from === from && edge.to === to);
}

function hasDirectedPath(graph: Pick<Graph, "nodes" | "edges">, from: string, to: string): boolean {
  return descendantsOf(graph, [from]).has(to);
}

export function addNode(
  graph: Graph,
  input: Omit<GraphNode, "id" | "idx"> & { id?: string; idx?: number },
): Graph {
  if (graph.nodes.length >= MAX_NODES) {
    throw new GraphMutationError(`This instrument supports at most ${MAX_NODES} nodes.`);
  }
  const nextIdx = Math.max(-1, ...graph.nodes.map((node) => node.idx)) + 1;
  const existingIds = new Set(graph.nodes.map((node) => node.id));
  let generatedId = input.id ?? `node-${nextIdx}`;
  let suffix = nextIdx;
  while (existingIds.has(generatedId)) {
    suffix += 1;
    generatedId = `node-${suffix}`;
  }
  return validateGraph({
    ...graph,
    nodes: [...graph.nodes, { ...input, id: generatedId, idx: input.idx ?? nextIdx }],
  });
}

export function removeNode(graph: Graph, id: string): Graph {
  nodeById(graph, id);
  return validateGraph({
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== id),
    edges: graph.edges.filter((edge) => edge.from !== id && edge.to !== id),
    roles: {
      exposureId: graph.roles.exposureId === id ? undefined : graph.roles.exposureId,
      outcomeId: graph.roles.outcomeId === id ? undefined : graph.roles.outcomeId,
    },
  });
}

export function setNodeKind(graph: Graph, id: string, kind: NodeKind): Graph {
  if (graph.roles.exposureId === id || graph.roles.outcomeId === id) {
    throw new GraphMutationError("Unassign the exposure or outcome before changing its node kind.");
  }
  nodeById(graph, id);
  return validateGraph({
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === id ? { ...node, kind } : node)),
  });
}

export function setRoles(graph: Graph, roles: GraphRoles): Graph {
  return validateGraph({ ...graph, roles: { ...graph.roles, ...roles } });
}

export function addEdge(graph: Graph, edge: GraphEdge): Graph {
  if (graph.edges.length >= MAX_EDGES) {
    throw new GraphMutationError(`This instrument supports at most ${MAX_EDGES} edges.`);
  }
  nodeById(graph, edge.from);
  nodeById(graph, edge.to);
  if (edge.from === edge.to) throw new GraphMutationError("A node cannot cause itself.");
  if (hasEdge(graph, edge.from, edge.to)) throw new GraphMutationError("That edge already exists.");
  if (hasDirectedPath(graph, edge.to, edge.from)) {
    throw new GraphMutationError("That edge would introduce a directed cycle.");
  }
  return validateGraph({ ...graph, edges: [...graph.edges, edge] });
}

export function observedNodeIds(graph: Pick<Graph, "nodes">): string[] {
  return graph.nodes.filter((node) => node.kind === "observed").map((node) => node.id);
}

export function withoutEdges(graph: Graph, predicate: (edge: GraphEdge) => boolean): Graph {
  return validateGraph({ ...graph, edges: graph.edges.filter((edge) => !predicate(edge)) });
}
