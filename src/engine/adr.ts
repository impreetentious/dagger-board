import { hasEdge, type Graph, type GraphNode } from "@/engine/graph";
import { attenuateCovariance, type ReliabilityMap } from "@/engine/measurement";
import { proveGraph, type ProveReport } from "@/engine/prove";
import { buildScmModel, matrixTotalEffect, type SCMParameters } from "@/engine/scm";
import { evaluateSensitivity, sensitivitySummary } from "@/engine/sensitivity";
import { truncateCovariance } from "@/engine/truncation";
import type { SelectionContext } from "@/engine/dsep";
import type { SelectionRule } from "@/engine/truncation";

export interface AdrInputs {
  graph: Graph;
  conditioning: ReadonlySet<string>;
  selection: SelectionRule | null;
  seed: number | null;
  n: number | null;
  timestamp: string;
  appVersion: string;
  svg?: string;
  /**
   * Supplying a parameterization adds the robustness line. It is optional so that a record
   * built without one is byte-identical to what it always was — a design record should not
   * silently acquire a number the design did not declare.
   */
  parameters?: SCMParameters;
  reliability?: ReliabilityMap;
}

export interface AbsentEdge {
  u: string;
  v: string;
}

export interface AdrSelectionSummary {
  nodeId: string;
  nodeName: string;
  quantile: number;
}

export interface AdrDocument {
  v: 1;
  appVersion: string;
  timestamp: string;
  exposureId: string | null;
  outcomeId: string | null;
  nodes: Array<{ id: string; name: string; kind: GraphNode["kind"]; idx: number }>;
  edges: Array<{ from: string; to: string }>;
  absentEdges: AbsentEdge[];
  independentErrors: true;
  selection: AdrSelectionSummary | null;
  identificationVerdict: ProveReport["verdict"];
  adjustmentSets: string[][];
  frontdoorMediatorIds: string[];
  instruments: Array<{ instrumentId: string; conditioningSets: string[][] }>;
  implications: Array<{ leftId: string; rightId: string; separatorIds: string[] }>;
  threats: Array<{ pathIds: string[]; label: string }>;
  /** Present only when the record was built with a parameterization to read Σ from. */
  robustness?: {
    estimand: number;
    robustnessValue: number;
    robustnessValueSignFlip: number;
    statement: string;
  };
  seed: number | null;
  n: number | null;
  svg: string;
}

export function assumedAbsentEdges(graph: Graph): AbsentEdge[] {
  const nodes = [...graph.nodes].sort((left, right) => left.idx - right.idx);
  const absent: AbsentEdge[] = [];
  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      const u = nodes[a];
      const v = nodes[b];
      if (hasEdge(graph, u.id, v.id) || hasEdge(graph, v.id, u.id)) continue;
      absent.push({ u: u.id, v: v.id });
    }
  }
  return absent;
}

function selectionContext(inputs: AdrInputs): SelectionContext | undefined {
  return inputs.selection ? { nodeId: inputs.selection.nodeId } : undefined;
}

export function buildAdrDocument(inputs: AdrInputs): AdrDocument {
  const { graph, conditioning, selection } = inputs;
  const selectionCtx = selectionContext(inputs);
  const report = proveGraph(graph, conditioning, selectionCtx);
  const openBiasingPaths = (report.paths?.paths ?? [])
    .filter((path) => !path.isCausal && path.evaluation.isOpen)
    .map((path) => ({ pathIds: path.nodeIds, label: path.primaryLabel }));
  const selectionSummary: AdrSelectionSummary | null = selection
    ? {
        nodeId: selection.nodeId,
        nodeName:
          graph.nodes.find((node) => node.id === selection.nodeId)?.name ?? selection.nodeId,
        quantile: selection.quantile,
      }
    : null;
  const robustness = buildRobustness(inputs);
  return {
    v: 1,
    appVersion: inputs.appVersion,
    timestamp: inputs.timestamp,
    exposureId: graph.roles.exposureId ?? null,
    outcomeId: graph.roles.outcomeId ?? null,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      idx: node.idx,
    })),
    edges: graph.edges.map((edge) => ({ from: edge.from, to: edge.to })),
    absentEdges: assumedAbsentEdges(graph),
    independentErrors: true,
    selection: selectionSummary,
    identificationVerdict: report.verdict,
    adjustmentSets: report.adjustment?.minimalSets ?? [],
    frontdoorMediatorIds: report.frontdoor?.mediatorIds ?? [],
    instruments: report.instruments.map((instrument) => ({
      instrumentId: instrument.instrumentId,
      conditioningSets: instrument.conditioningSets,
    })),
    implications: report.implications.map((implication) => ({
      leftId: implication.leftId,
      rightId: implication.rightId,
      separatorIds: implication.separatorIds,
    })),
    threats: openBiasingPaths,
    ...(robustness ? { robustness } : {}),
    seed: inputs.seed,
    n: inputs.n,
    svg: inputs.svg ?? "",
  };
}

/**
 * The record's robustness line. Every other line in an ADR says what the design assumes; this
 * one says how wrong those assumptions could be before the conclusion changes — which is the
 * question a reviewer asks about the assumed-absent list on the line above it.
 */
function buildRobustness(inputs: AdrInputs): AdrDocument["robustness"] {
  const { graph, parameters, selection, conditioning, reliability } = inputs;
  const exposureId = graph.roles.exposureId;
  const outcomeId = graph.roles.outcomeId;
  if (!parameters || !exposureId || !outcomeId) return undefined;
  try {
    const model = buildScmModel(graph, parameters);
    if (model.illConditioned) return undefined;
    const selected = selection ? truncateCovariance(model, selection) : model;
    const context = attenuateCovariance(
      { covariance: selected.covariance, indexById: model.indexById },
      reliability,
    );
    const report = evaluateSensitivity({
      graph,
      context,
      exposureId,
      outcomeId,
      conditioningIds: [...conditioning],
      totalEffect: matrixTotalEffect(model, exposureId, outcomeId),
    });
    return {
      estimand: report.estimand,
      robustnessValue: report.robustnessValue,
      robustnessValueSignFlip: report.robustnessValueSignFlip,
      statement: sensitivitySummary(report),
    };
  } catch {
    return undefined;
  }
}
