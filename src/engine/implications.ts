import { dSeparatedBayesBall, type SelectionContext } from "@/engine/dsep";
import { hasEdge, observedNodeIds, type Graph } from "@/engine/graph";
import { compareNodeSets, isSubset, sortedNodeIds, subsetsBySize } from "@/engine/sets";

export interface ConditionalIndependence {
  leftId: string;
  rightId: string;
  separatorIds: string[];
}

export function enumerateImpliedConditionalIndependencies(
  graph: Graph,
  selection?: SelectionContext,
): ConditionalIndependence[] {
  const observed = sortedNodeIds(graph, observedNodeIds(graph));
  const results: ConditionalIndependence[] = [];
  for (let leftIndex = 0; leftIndex < observed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < observed.length; rightIndex += 1) {
      const leftId = observed[leftIndex];
      const rightId = observed[rightIndex];
      if (hasEdge(graph, leftId, rightId) || hasEdge(graph, rightId, leftId)) continue;
      const candidates = observed.filter((id) => id !== leftId && id !== rightId);
      const minimalSets: string[][] = [];
      for (const subset of subsetsBySize(candidates)) {
        const set = new Set(subset);
        if (minimalSets.some((existing) => isSubset(new Set(existing), set))) continue;
        if (dSeparatedBayesBall(graph, leftId, rightId, set, selection)) {
          minimalSets.push(sortedNodeIds(graph, subset));
        }
      }
      for (const separatorIds of minimalSets.sort((left, right) =>
        compareNodeSets(graph, left, right),
      )) {
        results.push({ leftId, rightId, separatorIds });
      }
    }
  }
  return results;
}
