import { checkAdjustmentSet, adjustmentCandidateIds } from "@/engine/adjust";
import { enumerateFrontdoorMediators, enumerateFrontdoorSets } from "@/engine/frontdoor";
import { observedNodeIds, type Graph } from "@/engine/graph";
import { enumerateConditionalInstruments } from "@/engine/iv";
import { compareNodeSets, isSubset, sortedNodeIds, subsetsBySize } from "@/engine/sets";
import { buildScmModel, matrixTotalEffect, type SCMParameters } from "@/engine/scm";
import {
  frontdoorSetEstimand,
  ivEstimand,
  ivTestStandardError,
  olsEstimand,
  olsStandardError,
  powerPreview,
} from "@/engine/stats";
import {
  truncateCovariance,
  truncateCovarianceSequential,
  type SelectionRule,
} from "@/engine/truncation";

export interface DesignRow {
  id: string;
  kind: "naive" | "adjustment" | "iv" | "frontdoor";
  conditioningIds: string[];
  instrumentId?: string;
  mediatorIds?: string[];
  identified: boolean;
  estimand: number | null;
  populationBias: number | null;
  standardError: number | null;
  power: number | null;
  smallSelectedSample: boolean;
  ivStatus?: "defined" | "weak" | "undefined";
  seLabel?: "ols-asymptotic" | "iv-asymptotic" | "unavailable";
}

export interface DesignReport {
  rows: DesignRow[];
  totalEffect: number;
  effectiveN: number;
  selectionActive: boolean;
  frontdoorMediatorIds: string[];
  frontdoorSets: string[][];
  bestRowId: string | null;
  selectionApproximation: "exact" | "sequential-gaussian" | "none";
  selectionRuleCount: number;
}

export type DesignSelectionInput = SelectionRule | readonly SelectionRule[] | undefined;

function normalizeSelectionInput(input: DesignSelectionInput): SelectionRule[] {
  if (!input) return [];
  return Array.isArray(input) ? [...input] : [input as SelectionRule];
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
  selection: DesignSelectionInput,
  sampleSize: number,
): DesignReport {
  const exposureId = graph.roles.exposureId;
  const outcomeId = graph.roles.outcomeId;
  if (!exposureId || !outcomeId) throw new Error("Design requires observed X and Y.");
  const model = buildScmModel(graph, parameters);
  const rules = normalizeSelectionInput(selection);
  const truncation =
    rules.length === 0
      ? undefined
      : rules.length === 1
        ? truncateCovariance(model, rules[0])
        : truncateCovarianceSequential(model, rules);
  const truncationEffectiveFraction =
    truncation === undefined
      ? 1
      : "effectiveFraction" in truncation
        ? (truncation as { effectiveFraction: number }).effectiveFraction
        : 1;
  const covariance = truncation ?? model;
  const effectiveN = sampleSize * truncationEffectiveFraction;
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
      seLabel: standardError === null ? "unavailable" : "ols-asymptotic",
    });
  };
  olsRow("naive", []);
  for (const ids of adjustmentSets.filter((ids) => ids.length > 0)) olsRow("adjustment", ids);

  for (const instrument of enumerateConditionalInstruments(graph, exposureId, outcomeId)) {
    if (!measured[instrument.instrumentId]) continue;
    for (const conditionedIds of instrument.conditioningSets) {
      if (!conditionedIds.every((id) => measured[id])) continue;
      const estimate = ivEstimand(covariance, instrument.instrumentId, exposureId, outcomeId, conditionedIds, totalEffect);
      const definedForSe = estimate.status !== "undefined" && !(truncation && effectiveN < 50);
      const standardError = definedForSe
        ? ivTestStandardError(covariance, instrument.instrumentId, exposureId, outcomeId, conditionedIds, effectiveN)
        : null;
      const smallSelectedSample = Boolean(truncation && effectiveN < 50);
      rows.push({
        id: `iv:${instrument.instrumentId}:${conditionedIds.join(",")}`,
        kind: "iv",
        conditioningIds: conditionedIds,
        instrumentId: instrument.instrumentId,
        identified: true,
        estimand: estimate.estimand,
        populationBias: estimate.populationBias,
        standardError,
        power:
          standardError === null || estimate.estimand === null
            ? null
            : powerPreview(estimate.estimand, standardError),
        smallSelectedSample,
        ivStatus: estimate.status,
        seLabel: standardError === null ? "unavailable" : "iv-asymptotic",
      });
    }
  }

  const frontdoorSets = enumerateFrontdoorSets(graph, exposureId, outcomeId).minimalSets.filter(
    (entry) => entry.mediatorIds.every((id) => measured[id]),
  );
  for (const entry of frontdoorSets) {
    try {
      const estimand = frontdoorSetEstimand(covariance, exposureId, entry.mediatorIds, outcomeId);
      rows.push({
        id: `frontdoor:${entry.mediatorIds.join(",")}`,
        kind: "frontdoor",
        conditioningIds: [],
        mediatorIds: [...entry.mediatorIds],
        identified: true,
        estimand,
        populationBias: estimand - totalEffect,
        standardError: null,
        power: null,
        smallSelectedSample: Boolean(truncation && effectiveN < 50),
        seLabel: "unavailable",
      });
    } catch {
      // Frontdoor estimand is ill-defined for this parameterization; skip the row.
    }
  }

  rows.sort(comparator(graph));
  const first = rows[0];
  const bestRowId = first && first.populationBias !== null && Math.abs(first.populationBias) <= 1e-9 ? first.id : null;
  const selectionApproximation: DesignReport["selectionApproximation"] =
    rules.length === 0
      ? "none"
      : rules.length === 1
        ? "exact"
        : "sequential-gaussian";
  return {
    rows,
    totalEffect,
    effectiveN,
    selectionActive: rules.length > 0,
    frontdoorMediatorIds: enumerateFrontdoorMediators(graph, exposureId, outcomeId).mediatorIds,
    frontdoorSets: frontdoorSets.map((entry) => [...entry.mediatorIds]),
    bestRowId,
    selectionApproximation,
    selectionRuleCount: rules.length,
  };
}

export function measuredDefaults(graph: Graph): Record<string, boolean> {
  return Object.fromEntries(observedNodeIds(graph).map((id) => [id, true]));
}

export interface DesignRowDiff {
  id: string;
  side: "left-only" | "right-only" | "both";
  leftBias: number | null;
  rightBias: number | null;
  leftStandardError: number | null;
  rightStandardError: number | null;
  biasDelta: number | null;
  standardErrorDelta: number | null;
}

/** Pure comparison utility for the Design A/B side-by-side (item 7 of §2.6). */
export function diffDesignReports(left: DesignReport, right: DesignReport): DesignRowDiff[] {
  const leftById = new Map(left.rows.map((row) => [row.id, row]));
  const rightById = new Map(right.rows.map((row) => [row.id, row]));
  const ids = new Set<string>([...leftById.keys(), ...rightById.keys()]);
  const output: DesignRowDiff[] = [];
  for (const id of ids) {
    const leftRow = leftById.get(id) ?? null;
    const rightRow = rightById.get(id) ?? null;
    const side: DesignRowDiff["side"] =
      leftRow && rightRow ? "both" : leftRow ? "left-only" : "right-only";
    const leftBias = leftRow?.populationBias ?? null;
    const rightBias = rightRow?.populationBias ?? null;
    const leftStandardError = leftRow?.standardError ?? null;
    const rightStandardError = rightRow?.standardError ?? null;
    output.push({
      id,
      side,
      leftBias,
      rightBias,
      leftStandardError,
      rightStandardError,
      biasDelta:
        leftBias === null || rightBias === null ? null : rightBias - leftBias,
      standardErrorDelta:
        leftStandardError === null || rightStandardError === null
          ? null
          : rightStandardError - leftStandardError,
    });
  }
  output.sort((leftEntry, rightEntry) => leftEntry.id.localeCompare(rightEntry.id));
  return output;
}
