import { descendantsOf, hasEdge, type Graph } from "@/engine/graph";
import {
  evaluatePath,
  isCollider,
  type PathEvaluation,
  type SelectionContext,
} from "@/engine/dsep";
import { enumerateDirectedPaths, enumerateSimplePaths, isDirectedPath } from "@/engine/paths";

export type PathLabel =
  | "causal-open"
  | "causal-blocked"
  | "selection-opened"
  | "collider-opened"
  | "confounding"
  | "noncausal-open"
  | "inert";

export interface ClassifiedPath {
  nodeIds: string[];
  isCausal: boolean;
  isBackdoor: boolean;
  evaluation: PathEvaluation;
  primaryLabel: PathLabel;
  labels: PathLabel[];
  overcontrolNodeIds: string[];
  colliderOpeningWitnesses: Array<{ colliderId: string; nodeIds: string[] }>;
}

export interface ForbiddenAdjustmentWarning {
  type: "forbidden-adjustment";
  nodeIds: string[];
}

export interface PathClassificationResult {
  paths: ClassifiedPath[];
  warnings: ForbiddenAdjustmentWarning[];
}

export function properCausalPathNodeIds(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
): Set<string> {
  const nodes = new Set<string>();
  for (const path of enumerateDirectedPaths(graph, exposureId, outcomeId)) {
    for (const id of path.slice(1)) nodes.add(id);
  }
  return nodes;
}

export function forbiddenAdjustmentNodeIds(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
): Set<string> {
  return descendantsOf(graph, properCausalPathNodeIds(graph, exposureId, outcomeId));
}

function openedColliderLabels(
  graph: Graph,
  nodeIds: string[],
  conditioned: ReadonlySet<string>,
  selection: SelectionContext | undefined,
  evaluation: PathEvaluation,
): Array<{ colliderId: string; nodeIds: string[] }> {
  const labels: Array<{ colliderId: string; nodeIds: string[] }> = [];
  for (const witness of evaluation.colliders) {
    const openingIds = witness.conditionedNodeIds;
    if (openingIds.length === 0) continue;
    const withoutWitnesses = new Set([...conditioned].filter((id) => !openingIds.includes(id)));
    if (!evaluatePath(graph, nodeIds, withoutWitnesses, selection).isOpen) {
      labels.push({ colliderId: witness.colliderId, nodeIds: openingIds });
    }
  }
  return labels;
}

export function classifyPaths(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
  conditioned: ReadonlySet<string>,
  selection?: SelectionContext,
): PathClassificationResult {
  const paths = enumerateSimplePaths(graph, exposureId, outcomeId).map(({ nodeIds }) => {
    const evaluation = evaluatePath(graph, nodeIds, conditioned, selection);
    const causal = isDirectedPath(graph, nodeIds);
    const backdoor = !causal && nodeIds.length > 1 && hasEdge(graph, nodeIds[1], exposureId);
    const hasCollider = nodeIds.some((_, index) => isCollider(graph, nodeIds, index));
    const selectionOpened = Boolean(
      selection &&
        evaluation.isOpen &&
        !evaluatePath(graph, nodeIds, conditioned, undefined).isOpen,
    );
    const colliderWitnesses = openedColliderLabels(
      graph,
      nodeIds,
      conditioned,
      selection,
      evaluation,
    );

    if (causal) {
      const overcontrolNodeIds = nodeIds.slice(1, -1).filter((id) => conditioned.has(id));
      return {
        nodeIds,
        isCausal: true,
        isBackdoor: false,
        evaluation,
        primaryLabel: evaluation.isOpen ? "causal-open" : "causal-blocked",
        labels: [evaluation.isOpen ? "causal-open" : "causal-blocked"],
        overcontrolNodeIds,
        colliderOpeningWitnesses: [],
      } satisfies ClassifiedPath;
    }

    if (!evaluation.isOpen) {
      return {
        nodeIds,
        isCausal: false,
        isBackdoor: backdoor,
        evaluation,
        primaryLabel: "inert",
        labels: ["inert"],
        overcontrolNodeIds: [],
        colliderOpeningWitnesses: [],
      } satisfies ClassifiedPath;
    }

    const labels: PathLabel[] = [];
    if (selectionOpened) labels.push("selection-opened");
    if (colliderWitnesses.length > 0) labels.push("collider-opened");
    if (backdoor && !hasCollider) labels.push("confounding");
    labels.push("noncausal-open");

    return {
      nodeIds,
      isCausal: false,
      isBackdoor: backdoor,
      evaluation,
      primaryLabel: labels[0],
      labels,
      overcontrolNodeIds: [],
      colliderOpeningWitnesses: colliderWitnesses,
    } satisfies ClassifiedPath;
  });

  const forbidden = forbiddenAdjustmentNodeIds(graph, exposureId, outcomeId);
  const offending = [...conditioned].filter((id) => forbidden.has(id));
  return {
    paths,
    warnings: offending.length === 0 ? [] : [{ type: "forbidden-adjustment", nodeIds: offending }],
  };
}
