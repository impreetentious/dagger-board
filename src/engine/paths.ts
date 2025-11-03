import { childrenOf, hasEdge, nodeById, type Graph } from "@/engine/graph";

export interface SimplePath {
  nodeIds: string[];
}

export interface Trek {
  sourceId: string;
  leftPath: string[];
  rightPath: string[];
}

function sortedNeighbors(graph: Graph, id: string): string[] {
  nodeById(graph, id);
  const neighbors = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.from === id) neighbors.add(edge.to);
    if (edge.to === id) neighbors.add(edge.from);
  }
  return [...neighbors].sort(
    (left, right) => nodeById(graph, left).idx - nodeById(graph, right).idx,
  );
}

export function enumerateSimplePaths(graph: Graph, from: string, to: string): SimplePath[] {
  nodeById(graph, from);
  nodeById(graph, to);
  if (from === to) return [{ nodeIds: [from] }];

  const result: SimplePath[] = [];
  const visit = (current: string, path: string[], seen: Set<string>) => {
    if (current === to) {
      result.push({ nodeIds: path });
      return;
    }
    for (const neighbor of sortedNeighbors(graph, current)) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      visit(neighbor, [...path, neighbor], seen);
      seen.delete(neighbor);
    }
  };

  visit(from, [from], new Set([from]));
  return result;
}

export function isDirectedPath(graph: Graph, nodeIds: string[]): boolean {
  return nodeIds.every(
    (id, index) => index === nodeIds.length - 1 || hasEdge(graph, id, nodeIds[index + 1]),
  );
}

export function enumerateDirectedPaths(graph: Graph, from: string, to: string): string[][] {
  nodeById(graph, from);
  nodeById(graph, to);
  if (from === to) return [[from]];
  const result: string[][] = [];
  const visit = (current: string, path: string[]) => {
    if (current === to) {
      result.push(path);
      return;
    }
    for (const child of childrenOf(graph, current)) {
      visit(child, [...path, child]);
    }
  };
  visit(from, [from]);
  return result;
}

export function enumerateTreks(graph: Graph, left: string, right: string): Trek[] {
  nodeById(graph, left);
  nodeById(graph, right);
  const treks: Trek[] = [];
  for (const source of graph.nodes) {
    const leftPaths = enumerateDirectedPaths(graph, source.id, left);
    const rightPaths = enumerateDirectedPaths(graph, source.id, right);
    for (const leftPath of leftPaths) {
      for (const rightPath of rightPaths) {
        treks.push({ sourceId: source.id, leftPath, rightPath });
      }
    }
  }
  return treks;
}
