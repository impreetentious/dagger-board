import { evaluatePath } from "@/engine/dsep";
import { hasEdge, observedNodeIds, type Graph } from "@/engine/graph";
import { enumerateDirectedPaths, enumerateSimplePaths } from "@/engine/paths";
import { sortedNodeIds } from "@/engine/sets";

export interface FrontdoorResult {
  mediatorIds: string[];
  reason: "identified" | "no-directed-path" | "no-singleton-frontdoor";
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
