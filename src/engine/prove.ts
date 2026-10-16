import { validateGraph } from "@/engine/graph";
import { enumerateAdjustmentSets, type AdjustmentResult } from "@/engine/adjust";
import { classifyPaths, type PathClassificationResult } from "@/engine/classify";
import { dagToCpdag, type CpdagResult } from "@/engine/cpdag";
import {
  enumerateFrontdoorMediators,
  enumerateFrontdoorSets,
  type FrontdoorResult,
  type FrontdoorSetResult,
} from "@/engine/frontdoor";
import {
  enumerateImpliedConditionalIndependencies,
  type ConditionalIndependence,
} from "@/engine/implications";
import { enumerateConditionalInstruments, type ConditionalInstrument } from "@/engine/iv";
import { enumerateDirectedPaths, enumerateSimplePaths } from "@/engine/paths";
import type { Graph } from "@/engine/graph";
import type { SelectionContext } from "@/engine/dsep";

type IdentificationVerdict =
  | "design-incomplete"
  | "zero-total-effect"
  | "adjustment"
  | "frontdoor"
  | "instrument"
  | "unsupported";

export interface ProveReport {
  verdict: IdentificationVerdict;
  adjustment: AdjustmentResult | null;
  paths: PathClassificationResult | null;
  frontdoor: FrontdoorResult | null;
  frontdoorSets: FrontdoorSetResult | null;
  instruments: ConditionalInstrument[];
  implications: ConditionalIndependence[];
  directedPathCount: number;
  anyPathCount: number;
  /** Markov equivalence class of the drawn DAG: which arrows are data-forced vs assumptions (§3.15). */
  cpdag: CpdagResult;
}

export function proveGraph(
  graph: Graph,
  conditioned: ReadonlySet<string>,
  selection?: SelectionContext,
): ProveReport {
  const exposureId = graph.roles.exposureId;
  const outcomeId = graph.roles.outcomeId;
  if (!exposureId || !outcomeId) {
    return {
      verdict: "design-incomplete",
      adjustment: null,
      paths: null,
      frontdoor: null,
      frontdoorSets: null,
      instruments: [],
      implications: [],
      directedPathCount: 0,
      anyPathCount: 0,
      cpdag: dagToCpdag(graph),
    };
  }
  const directedPathCount = enumerateDirectedPaths(graph, exposureId, outcomeId).filter(
    (path) => path.length > 1,
  ).length;
  const anyPathCount = enumerateSimplePaths(graph, exposureId, outcomeId).filter(
    (path) => path.nodeIds.length > 1,
  ).length;
  const adjustment = enumerateAdjustmentSets(graph, exposureId, outcomeId);
  const frontdoor = enumerateFrontdoorMediators(graph, exposureId, outcomeId);
  const frontdoorSets = enumerateFrontdoorSets(graph, exposureId, outcomeId);
  const instruments = enumerateConditionalInstruments(graph, exposureId, outcomeId);
  const paths = classifyPaths(graph, exposureId, outcomeId, conditioned, selection);
  const implications = enumerateImpliedConditionalIndependencies(graph, selection);
  const frontdoorAvailable =
    frontdoor.mediatorIds.length > 0 || frontdoorSets.minimalSets.length > 0;
  const verdict: IdentificationVerdict =
    directedPathCount === 0
      ? "zero-total-effect"
      : adjustment.minimalSets.length > 0
        ? "adjustment"
        : frontdoorAvailable
          ? "frontdoor"
          : instruments.length > 0
            ? "instrument"
            : "unsupported";
  return {
    verdict,
    adjustment,
    paths,
    frontdoor,
    frontdoorSets,
    instruments,
    implications,
    directedPathCount,
    anyPathCount,
    cpdag: dagToCpdag(graph),
  };
}

export interface SingleEdgeVariant {
  change: { kind: "delete" | "add"; from: string; to: string };
  graph: Graph;
}

export function singleEdgeVariants(graph: Graph): SingleEdgeVariant[] {
  const order = (a: { from: string; to: string }, b: { from: string; to: string }) =>
    a.from.localeCompare(b.from) || a.to.localeCompare(b.to);
  const deletions: SingleEdgeVariant[] = [...graph.edges].sort(order).map((edge) => ({
    change: { kind: "delete", ...edge },
    graph: { ...graph, edges: graph.edges.filter((item) => item !== edge) },
  }));
  const ids = graph.nodes.map((node) => node.id).sort();
  const additions: SingleEdgeVariant[] = [];
  for (const from of ids)
    for (const to of ids) {
      if (from === to || graph.edges.some((edge) => edge.from === from && edge.to === to)) continue;
      try {
        const candidate = validateGraph({ ...graph, edges: [...graph.edges, { from, to }] });
        additions.push({ change: { kind: "add", from, to }, graph: candidate });
      } catch {
        /* Cycles and structurally unsupported additions are not admissible. */
      }
    }
  return [...deletions, ...additions];
}

export function graphicalConclusion(report: ProveReport): string {
  return JSON.stringify({
    verdict: report.verdict,
    sets: (report.adjustment?.minimalSets ?? [])
      .map((ids) => [...ids].sort())
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}

export async function analyzeSingleEdgeVariants(
  graph: Graph,
  conditioning: ReadonlySet<string>,
  selection?: SelectionContext,
  signal?: AbortSignal,
  onProgress?: (count: number, total: number) => void,
): Promise<{
  total: number;
  inspected: number;
  incomplete: boolean;
  entries: Array<
    SingleEdgeVariant & { report: ProveReport | null; changed: boolean; refusal: string | null }
  >;
}> {
  const variants = singleEdgeVariants(graph);
  const base = proveGraph(graph, conditioning, selection);
  const entries: Array<
    SingleEdgeVariant & { report: ProveReport | null; changed: boolean; refusal: string | null }
  > = [];
  for (const variant of variants.slice(0, 128)) {
    if (signal?.aborted) throw new DOMException("Edge analysis cancelled.", "AbortError");
    try {
      const report = proveGraph(variant.graph, conditioning, selection);
      entries.push({
        ...variant,
        report,
        changed: graphicalConclusion(report) !== graphicalConclusion(base),
        refusal:
          report.verdict === "design-incomplete"
            ? "Observed exposure and outcome are required."
            : null,
      });
    } catch (error) {
      entries.push({
        ...variant,
        report: null,
        changed: false,
        refusal: error instanceof Error ? error.message : "Variant refused.",
      });
    }
    onProgress?.(entries.length, variants.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (signal?.aborted) throw new DOMException("Edge analysis cancelled.", "AbortError");
  return {
    total: variants.length,
    inspected: entries.length,
    incomplete: entries.length < variants.length,
    entries,
  };
}
