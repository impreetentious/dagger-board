import { checkAdjustmentSet, adjustmentCandidateIds } from "@/engine/adjust";
import { enumerateFrontdoorMediators } from "@/engine/frontdoor";
import { observedNodeIds, type Graph } from "@/engine/graph";
import { enumerateConditionalInstruments } from "@/engine/iv";
import { compareNodeSets, isSubset, sortedNodeIds, subsetsBySize } from "@/engine/sets";
import { buildScmModel, matrixTotalEffect, type SCMParameters } from "@/engine/scm";
import { ivEstimand, olsEstimand, olsStandardError, powerPreview } from "@/engine/stats";
import { truncateCovariance, type SelectionRule } from "@/engine/truncation";

export interface DesignRow {
  id: string;
  kind: "naive" | "adjustment" | "iv";
  conditioningIds: string[];
  instrumentId?: string;
  identified: boolean;
  estimand: number | null;
  populationBias: number | null;
  standardError: number | null;
  power: number | null;
  smallSelectedSample: boolean;
  ivStatus?: "defined" | "weak" | "undefined";
}

export interface DesignReport {
  rows: DesignRow[];
  totalEffect: number;
  effectiveN: number;
  selectionActive: boolean;
  frontdoorMediatorIds: string[];
  bestRowId: string | null;
}

export function enumerateMeasuredAdjustmentSets(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
  measured: Readonly<Record<string, boolean>>,
): string[][] {
  const candidates = adjustmentCandidateIds(graph, exposureId, outcomeId).filter(
    (id) => measured[id],
  );
  const minimal: string[][] = [];
  for (const subset of subsetsBySize(candidates)) {
    const set = new Set(subset);
    if (minimal.some((existing) => isSubset(new Set(existing), set))) continue;
    if (checkAdjustmentSet(graph, exposureId, outcomeId, set).valid)
      minimal.push(sortedNodeIds(graph, subset));
  }
  return minimal.sort((left, right) => compareNodeSets(graph, left, right));
}

function indexTuple(graph: Graph, ids: readonly string[]): number[] {
  return ids.map(
    (id) => graph.nodes.find((node) => node.id === id)?.idx ?? Number.MAX_SAFE_INTEGER,
  );
}

function comparator(graph: Graph) {
  return (left: DesignRow, right: DesignRow) => {
    const leftZero = left.populationBias !== null && Math.abs(left.populationBias) <= 1e-9;
    const rightZero = right.populationBias !== null && Math.abs(right.populationBias) <= 1e-9;
    if (leftZero !== rightZero) return leftZero ? -1 : 1;
    const leftBias = Math.abs(left.populationBias ?? Number.POSITIVE_INFINITY);
    const rightBias = Math.abs(right.populationBias ?? Number.POSITIVE_INFINITY);
    if (leftBias !== rightBias) return leftBias - rightBias;
    const leftSe = left.standardError ?? Number.POSITIVE_INFINITY;
    const rightSe = right.standardError ?? Number.POSITIVE_INFINITY;
    if (leftSe !== rightSe) return leftSe - rightSe;
    if (left.conditioningIds.length !== right.conditioningIds.length) {
      return left.conditioningIds.length - right.conditioningIds.length;
    }
    const leftIds = [...left.conditioningIds, ...(left.instrumentId ? [left.instrumentId] : [])];
    const rightIds = [
      ...right.conditioningIds,
      ...(right.instrumentId ? [right.instrumentId] : []),
    ];
    const leftTuple = indexTuple(graph, leftIds);
    const rightTuple = indexTuple(graph, rightIds);
    for (let index = 0; index < Math.max(leftTuple.length, rightTuple.length); index += 1) {
      const difference =
        (leftTuple[index] ?? Number.MAX_SAFE_INTEGER) -
        (rightTuple[index] ?? Number.MAX_SAFE_INTEGER);
      if (difference !== 0) return difference;
    }
    return 0;
  };
}

/** Exact design-table values; selection changes covariance values, never its certification scope. */
export function evaluateDesign(
  graph: Graph,
  parameters: SCMParameters,
  measured: Readonly<Record<string, boolean>>,
  selection: SelectionRule | undefined,
  sampleSize: number,
): DesignReport {
  const exposureId = graph.roles.exposureId;
  const outcomeId = graph.roles.outcomeId;
  if (!exposureId || !outcomeId) throw new Error("Design requires observed X and Y.");
  const model = buildScmModel(graph, parameters);
  const truncation = selection ? truncateCovariance(model, selection) : undefined;
  const covariance = truncation ?? model;
  const effectiveN = sampleSize * (truncation?.effectiveFraction ?? 1);
  const totalEffect = matrixTotalEffect(model, exposureId, outcomeId);
  const adjustmentSets = enumerateMeasuredAdjustmentSets(graph, exposureId, outcomeId, measured);
  const rows: DesignRow[] = [];
  const olsRow = (kind: "naive" | "adjustment", ids: string[]) => {
    const estimate = olsEstimand(covariance, exposureId, outcomeId, ids, totalEffect);
    const identified = checkAdjustmentSet(graph, exposureId, outcomeId, new Set(ids)).valid;
    const smallSelectedSample = Boolean(truncation && effectiveN < 50);
    const standardError = smallSelectedSample
      ? null
      : olsStandardError(covariance, exposureId, outcomeId, ids, effectiveN);
    rows.push({
      id: `${kind}:${ids.join(",")}`,
      kind,
      conditioningIds: ids,
      identified,
      estimand: estimate.estimand,
      populationBias: estimate.populationBias,
      standardError,
      power: standardError === null ? null : powerPreview(estimate.estimand, standardError),
      smallSelectedSample,
    });
  };
  olsRow("naive", []);
  for (const ids of adjustmentSets.filter((ids) => ids.length > 0)) olsRow("adjustment", ids);

  for (const instrument of enumerateConditionalInstruments(graph, exposureId, outcomeId)) {
    if (!measured[instrument.instrumentId]) continue;
    for (const conditionedIds of instrument.conditioningSets) {
      if (!conditionedIds.every((id) => measured[id])) continue;
      const estimate = ivEstimand(
        covariance,
        instrument.instrumentId,
        exposureId,
        outcomeId,
        conditionedIds,
        totalEffect,
      );
      rows.push({
        id: `iv:${instrument.instrumentId}:${conditionedIds.join(",")}`,
        kind: "iv",
        conditioningIds: conditionedIds,
        instrumentId: instrument.instrumentId,
        identified: true,
        estimand: estimate.estimand,
        populationBias: estimate.populationBias,
        standardError: null,
        power: null,
        smallSelectedSample: false,
        ivStatus: estimate.status,
      });
    }
  }
  rows.sort(comparator(graph));
  const first = rows[0];
  const bestRowId =
    first && first.populationBias !== null && Math.abs(first.populationBias) <= 1e-9
      ? first.id
      : null;
  return {
    rows,
    totalEffect,
    effectiveN,
    selectionActive: Boolean(selection),
    frontdoorMediatorIds: enumerateFrontdoorMediators(graph, exposureId, outcomeId).mediatorIds,
    bestRowId,
  };
}

export function measuredDefaults(graph: Graph): Record<string, boolean> {
  return Object.fromEntries(observedNodeIds(graph).map((id) => [id, true]));
}
