import { classifyPaths, properCausalPathNodeIds } from "@/engine/classify";
import { dSeparatedBayesBall, evaluatePath } from "@/engine/dsep";
import {
  ancestorsOf,
  descendantsOf,
  observedNodeIds,
  type Graph,
  withoutEdges,
} from "@/engine/graph";
import { enumerateDirectedPaths, enumerateSimplePaths } from "@/engine/paths";
import { compareNodeSets, isSubset, sortedNodeIds, subsetsBySize } from "@/engine/sets";

export interface AdjustmentValidity {
  valid: boolean;
  forbiddenNodeIds: string[];
  invalidCandidateNodeIds: string[];
  dSeparatedInProperBackdoorGraph: boolean;
}

export interface AdjustmentResult {
  minimalSets: string[][];
  minimumSizeSets: string[][];
  emptySetValid: boolean;
  canonicalSet: string[];
  canonicalSetValid: boolean;
  noSetWitnessPaths: string[][];
}

export function forbiddenNodeIds(graph: Graph, exposureId: string, outcomeId: string): Set<string> {
  const causalNodes = properCausalPathNodeIds(graph, exposureId, outcomeId);
  const forbidden = descendantsOf(graph, causalNodes);
  forbidden.add(exposureId);
  return forbidden;
}

export function properBackdoorGraph(graph: Graph, exposureId: string, outcomeId: string): Graph {
  const firstCausalChildren = new Set(
    enumerateDirectedPaths(graph, exposureId, outcomeId)
      .filter((path) => path.length > 1)
      .map((path) => path[1]),
  );
  return withoutEdges(
    graph,
    (edge) => edge.from === exposureId && firstCausalChildren.has(edge.to),
  );
}

export function adjustmentCandidateIds(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
): string[] {
  const forbidden = forbiddenNodeIds(graph, exposureId, outcomeId);
  return sortedNodeIds(
    graph,
    observedNodeIds(graph).filter(
      (id) => id !== exposureId && id !== outcomeId && !forbidden.has(id),
    ),
  );
}

export function canonicalAdjustmentSet(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
): string[] {
  const forbidden = forbiddenNodeIds(graph, exposureId, outcomeId);
  const ancestors = ancestorsOf(graph, [exposureId, outcomeId]);
  return sortedNodeIds(
    graph,
    [...ancestors].filter((id) => {
      const node = graph.nodes.find((candidate) => candidate.id === id);
      return Boolean(
        node &&
          node.kind === "observed" &&
          id !== exposureId &&
          id !== outcomeId &&
          !forbidden.has(id),
      );
    }),
  );
}

export function checkAdjustmentSet(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
  candidate: ReadonlySet<string>,
): AdjustmentValidity {
  const forbidden = forbiddenNodeIds(graph, exposureId, outcomeId);
  const allowed = new Set(adjustmentCandidateIds(graph, exposureId, outcomeId));
  const invalidCandidateNodeIds = [...candidate].filter((id) => !allowed.has(id));
  const forbiddenNodeIdsInCandidate = [...candidate].filter((id) => forbidden.has(id));
  const pbd = properBackdoorGraph(graph, exposureId, outcomeId);
  const dSeparatedInProperBackdoorGraph = dSeparatedBayesBall(
    pbd,
    exposureId,
    outcomeId,
    candidate,
  );
  return {
    valid:
      invalidCandidateNodeIds.length === 0 &&
      forbiddenNodeIdsInCandidate.length === 0 &&
      dSeparatedInProperBackdoorGraph,
    forbiddenNodeIds: sortedNodeIds(graph, forbiddenNodeIdsInCandidate),
    invalidCandidateNodeIds: sortedNodeIds(graph, invalidCandidateNodeIds),
    dSeparatedInProperBackdoorGraph,
  };
}

export function enumerateAdjustmentSets(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
): AdjustmentResult {
  const candidates = adjustmentCandidateIds(graph, exposureId, outcomeId);
  const minimalSets: string[][] = [];
  for (const subset of subsetsBySize(candidates)) {
    const set = new Set(subset);
    if (minimalSets.some((existing) => isSubset(new Set(existing), set))) continue;
    if (checkAdjustmentSet(graph, exposureId, outcomeId, set).valid) {
      minimalSets.push(sortedNodeIds(graph, subset));
    }
  }
  minimalSets.sort((left, right) => compareNodeSets(graph, left, right));
  const minimumSize = minimalSets[0]?.length;
  const minimumSizeSets =
    minimumSize === undefined ? [] : minimalSets.filter((set) => set.length === minimumSize);
  const canonicalSet = canonicalAdjustmentSet(graph, exposureId, outcomeId);
  const canonicalSetValid = checkAdjustmentSet(
    graph,
    exposureId,
    outcomeId,
    new Set(canonicalSet),
  ).valid;
  const pbd = properBackdoorGraph(graph, exposureId, outcomeId);
  const noSetWitnessPaths =
    minimalSets.length > 0
      ? []
      : enumerateSimplePaths(pbd, exposureId, outcomeId)
          .filter((path) => evaluatePath(pbd, path.nodeIds, new Set(canonicalSet)).isOpen)
          .map((path) => path.nodeIds);

  return {
    minimalSets,
    minimumSizeSets,
    emptySetValid: minimalSets.some((set) => set.length === 0),
    canonicalSet,
    canonicalSetValid,
    noSetWitnessPaths,
  };
}

export function adjustmentPathReport(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
  candidate: ReadonlySet<string>,
) {
  return classifyPaths(graph, exposureId, outcomeId, candidate);
}
