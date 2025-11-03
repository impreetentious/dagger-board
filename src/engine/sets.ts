import { nodeById, type Graph } from "@/engine/graph";

export function sortedNodeIds(graph: Pick<Graph, "nodes">, ids: Iterable<string>): string[] {
  return [...ids].sort((left, right) => nodeById(graph, left).idx - nodeById(graph, right).idx);
}

export function compareNodeSets(
  graph: Pick<Graph, "nodes">,
  left: readonly string[],
  right: readonly string[],
): number {
  if (left.length !== right.length) return left.length - right.length;
  const sortedLeft = sortedNodeIds(graph, left);
  const sortedRight = sortedNodeIds(graph, right);
  for (let index = 0; index < sortedLeft.length; index += 1) {
    const difference =
      nodeById(graph, sortedLeft[index]).idx - nodeById(graph, sortedRight[index]).idx;
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isSubset(subset: ReadonlySet<string>, superset: ReadonlySet<string>): boolean {
  return [...subset].every((id) => superset.has(id));
}

export function subsetsBySize<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  const choose = (start: number, remaining: number, current: T[]) => {
    if (remaining === 0) {
      result.push(current);
      return;
    }
    for (let index = start; index <= items.length - remaining; index += 1) {
      choose(index + 1, remaining - 1, [...current, items[index]]);
    }
  };
  for (let size = 0; size <= items.length; size += 1) choose(0, size, []);
  return result;
}
