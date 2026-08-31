import { hasEdge, type Graph } from "@/engine/graph";
import { enumerateDirectedPaths } from "@/engine/paths";
import { edgeCoefficient, type SCMParameters } from "@/engine/scm";
import { pathCoefficient, type CoefficientLookup } from "@/engine/treks";

/**
 * Direct and path-specific effects (item 3 of §2.6). §3 was total-effect-only
 * per D-09; this module adds three exact readings that stay inside the
 * linear-Gaussian oracle and do not touch identification.
 *
 * 1. **Direct edge coefficient** — the structural weight on the edge X → Y,
 *    or 0 if no such edge exists.
 * 2. **Controlled direct effect** through a mediator block M ⊆ V ∖ {X, Y} —
 *    the sum over directed X → Y paths that visit no node in M of their
 *    edge-coefficient product. Wright's decomposition of TE by path guarantees
 *    that CDE(M) + `mediatedEffect(M)` = TE, so removing every mediator recovers
 *    the direct-edge coefficient and removing the empty block recovers TE.
 * 3. **Path-specific decomposition** — the array of directed X → Y paths with
 *    their individual contributions, so a UI can attribute TE per path.
 */

export interface PathContribution {
  nodeIds: string[];
  contribution: number;
}

export interface EffectDecomposition {
  totalEffect: number;
  directEdgeCoefficient: number;
  paths: PathContribution[];
}

function coefficientLookup(parameters: SCMParameters): CoefficientLookup {
  return (from, to) => edgeCoefficient(parameters, from, to);
}

export function directEdgeCoefficient(
  graph: Graph,
  parameters: SCMParameters,
  exposureId: string,
  outcomeId: string,
): number {
  if (!hasEdge(graph, exposureId, outcomeId)) return 0;
  return edgeCoefficient(parameters, exposureId, outcomeId);
}

export function controlledDirectEffect(
  graph: Graph,
  parameters: SCMParameters,
  exposureId: string,
  outcomeId: string,
  blockedMediatorIds: readonly string[],
): number {
  const blocked = new Set(blockedMediatorIds);
  if (blocked.has(exposureId) || blocked.has(outcomeId)) {
    throw new Error("Blocked mediator set cannot contain the exposure or outcome.");
  }
  const coefficient = coefficientLookup(parameters);
  return enumerateDirectedPaths(graph, exposureId, outcomeId)
    .filter((path) => path.length > 1 && path.slice(1, -1).every((id) => !blocked.has(id)))
    .reduce((sum, path) => sum + pathCoefficient(path, coefficient), 0);
}

export function pathSpecificEffects(
  graph: Graph,
  parameters: SCMParameters,
  exposureId: string,
  outcomeId: string,
): EffectDecomposition {
  const coefficient = coefficientLookup(parameters);
  const paths: PathContribution[] = enumerateDirectedPaths(graph, exposureId, outcomeId)
    .filter((path) => path.length > 1)
    .map((path) => ({ nodeIds: [...path], contribution: pathCoefficient(path, coefficient) }));
  const totalEffect = paths.reduce((sum, entry) => sum + entry.contribution, 0);
  return {
    totalEffect,
    directEdgeCoefficient: directEdgeCoefficient(graph, parameters, exposureId, outcomeId),
    paths,
  };
}
