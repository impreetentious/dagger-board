import { evaluatePath } from "@/engine/dsep";
import { hasEdge, observedNodeIds, type Graph } from "@/engine/graph";
import { enumerateDirectedPaths, enumerateSimplePaths } from "@/engine/paths";
import { compareNodeSets, isSubset, sortedNodeIds, subsetsBySize } from "@/engine/sets";

export interface FrontdoorResult {
  mediatorIds: string[];
  reason: "identified" | "no-directed-path" | "no-singleton-frontdoor";
}

export interface FrontdoorSet {
  mediatorIds: string[];
}

export interface FrontdoorSetResult {
  minimalSets: FrontdoorSet[];
  singletonMediatorIds: string[];
  reason: "identified" | "no-directed-path" | "no-set";
}

function hasOpenBackdoorPath(
  graph: Graph,
  from: string,
  to: string,
  conditioned: ReadonlySet<string>,
): boolean {
  return enumerateSimplePaths(graph, from, to).some(
    (path) =>
      path.nodeIds.length > 1 &&
      hasEdge(graph, path.nodeIds[1], from) &&
      evaluatePath(graph, path.nodeIds, conditioned).isOpen,
  );
}

export function enumerateFrontdoorMediators(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
): FrontdoorResult {
  const directedPaths = enumerateDirectedPaths(graph, exposureId, outcomeId);
  if (directedPaths.length === 0 || directedPaths.every((path) => path.length === 1)) {
    return { mediatorIds: [], reason: "no-directed-path" };
  }

  const mediatorIds = observedNodeIds(graph)
    .filter((id) => id !== exposureId && id !== outcomeId)
    .filter((mediatorId) => {
      const interceptsEveryPath = directedPaths.every((path) => path.includes(mediatorId));
      if (!interceptsEveryPath) return false;
      if (hasOpenBackdoorPath(graph, exposureId, mediatorId, new Set())) return false;
      return !hasOpenBackdoorPath(graph, mediatorId, outcomeId, new Set([exposureId]));
    });

  return {
    mediatorIds: sortedNodeIds(graph, mediatorIds),
    reason: mediatorIds.length > 0 ? "identified" : "no-singleton-frontdoor",
  };
}

/**
 * Set-valued frontdoor per Pearl (2009), Definition 3.3.3. A set Z of
 * observed non-role nodes satisfies the criterion iff:
 *   (1) Z intercepts every directed path X → … → Y (some Z_i on every path);
 *   (2) no unblocked back-door path from X to any Z_i under empty conditioning;
 *   (3) every back-door path from any Z_i to Y is blocked by {X}.
 * v1.x enumerates every subset within the graph bound (§3.1), keeps
 * inclusion-minimal witnesses, and returns them ordered by (size, lex idx).
 * V-08 in docs/notes/identification.md records the source verification.
 */
export function enumerateFrontdoorSets(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
): FrontdoorSetResult {
  const directedPaths = enumerateDirectedPaths(graph, exposureId, outcomeId).filter(
    (path) => path.length > 1,
  );
  if (directedPaths.length === 0) {
    return { minimalSets: [], singletonMediatorIds: [], reason: "no-directed-path" };
  }

  const candidates = sortedNodeIds(
    graph,
    observedNodeIds(graph).filter((id) => id !== exposureId && id !== outcomeId),
  );

  const minimal: FrontdoorSet[] = [];
  for (const subset of subsetsBySize(candidates)) {
    if (subset.length === 0) continue;
    const setZ = new Set(subset);
    if (minimal.some((existing) => isSubset(new Set(existing.mediatorIds), setZ))) continue;
    if (!satisfiesFrontdoorSet(graph, exposureId, outcomeId, subset, directedPaths)) continue;
    minimal.push({ mediatorIds: sortedNodeIds(graph, subset) });
  }
  minimal.sort((left, right) => compareNodeSets(graph, left.mediatorIds, right.mediatorIds));

  const singletonMediatorIds = minimal
    .filter((entry) => entry.mediatorIds.length === 1)
    .map((entry) => entry.mediatorIds[0]);

  return {
    minimalSets: minimal,
    singletonMediatorIds,
    reason: minimal.length > 0 ? "identified" : "no-set",
  };
}

function satisfiesFrontdoorSet(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
  candidateIds: readonly string[],
  directedPaths: readonly (readonly string[])[],
): boolean {
  const setZ = new Set(candidateIds);
  if (!directedPaths.every((path) => path.some((id) => setZ.has(id)))) return false;
  const conditioningWithX = new Set([exposureId]);
  for (const mediatorId of candidateIds) {
    if (hasOpenBackdoorPath(graph, exposureId, mediatorId, new Set())) return false;
    if (hasOpenBackdoorPath(graph, mediatorId, outcomeId, conditioningWithX)) return false;
  }
  return true;
}

export function checkFrontdoorSet(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
  candidate: ReadonlySet<string>,
): boolean {
  const directedPaths = enumerateDirectedPaths(graph, exposureId, outcomeId).filter(
    (path) => path.length > 1,
  );
  if (directedPaths.length === 0) return false;
  return satisfiesFrontdoorSet(
    graph,
    exposureId,
    outcomeId,
    [...candidate],
    directedPaths,
  );
}
