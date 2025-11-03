import { enumerateAdjustmentSets, type AdjustmentResult } from "@/engine/adjust";
import { classifyPaths, type PathClassificationResult } from "@/engine/classify";
import { enumerateFrontdoorMediators, type FrontdoorResult } from "@/engine/frontdoor";
import { enumerateImpliedConditionalIndependencies, type ConditionalIndependence } from "@/engine/implications";
import { enumerateConditionalInstruments, type ConditionalInstrument } from "@/engine/iv";
import { enumerateDirectedPaths, enumerateSimplePaths } from "@/engine/paths";
import type { Graph } from "@/engine/graph";
import type { SelectionContext } from "@/engine/dsep";

export type IdentificationVerdict =
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
  instruments: ConditionalInstrument[];
  implications: ConditionalIndependence[];
  directedPathCount: number;
  anyPathCount: number;
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
      instruments: [],
      implications: [],
      directedPathCount: 0,
      anyPathCount: 0,
    };
  }
  const directedPathCount = enumerateDirectedPaths(graph, exposureId, outcomeId).filter((path) => path.length > 1).length;
  const anyPathCount = enumerateSimplePaths(graph, exposureId, outcomeId).filter((path) => path.nodeIds.length > 1).length;
  const adjustment = enumerateAdjustmentSets(graph, exposureId, outcomeId);
  const frontdoor = enumerateFrontdoorMediators(graph, exposureId, outcomeId);
  const instruments = enumerateConditionalInstruments(graph, exposureId, outcomeId);
  const paths = classifyPaths(graph, exposureId, outcomeId, conditioned, selection);
  const implications = enumerateImpliedConditionalIndependencies(graph, selection);
  const verdict: IdentificationVerdict =
    directedPathCount === 0
      ? "zero-total-effect"
      : adjustment.minimalSets.length > 0
        ? "adjustment"
        : frontdoor.mediatorIds.length > 0
          ? "frontdoor"
          : instruments.length > 0
            ? "instrument"
            : "unsupported";
  return { verdict, adjustment, paths, frontdoor, instruments, implications, directedPathCount, anyPathCount };
}
