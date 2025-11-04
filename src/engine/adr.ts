import { hasEdge, type Graph, type GraphNode } from "@/engine/graph";
import { proveGraph, type ProveReport } from "@/engine/prove";
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
  seed: number | null;
  n: number | null;
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
    seed: inputs.seed,
    n: inputs.n,
  };
}
