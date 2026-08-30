import { dSeparatedBayesBall } from "@/engine/dsep";
import { descendantsOf, observedNodeIds, type Graph, withoutEdges } from "@/engine/graph";
import { compareNodeSets, isSubset, sortedNodeIds, subsetsBySize } from "@/engine/sets";

/**
 * v1 kept a single conservative criterion (Z, W ∉ De(X)) so the total-effect
 * Wald identity `Σ_{ZY·W} = TE · Σ_{ZX·W}` holds by construction. Item 10 of
 * §2.6 asked to relax this toward Brito & Pearl's ancestral-instrument family.
 * A working prototype under this file admitted (Z, W) pairs — including
 * fixture #16 — that broke the multiplicative identity because Z ∈ De(X)
 * changes the observed covariance in a way the mutilated-graph d-separation
 * check does not compensate for. The relaxation therefore lands as an
 * explicit criterion parameter surface (opt-in, no default change) while the
 * *effective* rule below stays conservative: switching to `"literature"` today
 * enforces the same non-descendance barrier and returns the same enumeration,
 * with the parameter reserved for the correctness-preserving version once the
 * ancestral-instrument mutilation is coded end-to-end. See V-02 (relaxation
 * note) in docs/notes/identification.md.
 */
export type IvCriterion = "conservative" | "literature";

export interface InstrumentCheck {
  valid: boolean;
  nonDescendant: boolean;
  relevant: boolean;
  exogenous: boolean;
}

export interface ConditionalInstrument {
  instrumentId: string;
  conditioningSets: string[][];
  criterion: IvCriterion;
}

export function graphWithoutExposureOutgoingEdges(graph: Graph, exposureId: string): Graph {
  return withoutEdges(graph, (edge) => edge.from === exposureId);
}

export function checkConditionalInstrument(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
  instrumentId: string,
  conditioning: ReadonlySet<string>,
  _criterion: IvCriterion = "conservative",
): InstrumentCheck {
  void _criterion;
  const observed = new Set(observedNodeIds(graph));
  const descendants = descendantsOf(graph, [exposureId]);
  const allowedInstrument =
    observed.has(instrumentId) && instrumentId !== exposureId && instrumentId !== outcomeId;
  const allowedConditioning = [...conditioning].every(
    (id) => observed.has(id) && id !== exposureId && id !== outcomeId && id !== instrumentId,
  );
  const nonDescendant =
    allowedInstrument &&
    allowedConditioning &&
    !descendants.has(instrumentId) &&
    [...conditioning].every((id) => !descendants.has(id));
  const relevant =
    nonDescendant && !dSeparatedBayesBall(graph, instrumentId, exposureId, conditioning);
  const exogenous =
    nonDescendant &&
    dSeparatedBayesBall(
      graphWithoutExposureOutgoingEdges(graph, exposureId),
      instrumentId,
      outcomeId,
      conditioning,
    );
  return { valid: nonDescendant && relevant && exogenous, nonDescendant, relevant, exogenous };
}

export function enumerateConditionalInstruments(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
  criterion: IvCriterion = "conservative",
): ConditionalInstrument[] {
  const observed = observedNodeIds(graph);
  const instruments: ConditionalInstrument[] = [];
  for (const instrumentId of observed.filter((id) => id !== exposureId && id !== outcomeId)) {
    const candidates = sortedNodeIds(
      graph,
      observed.filter((id) => id !== exposureId && id !== outcomeId && id !== instrumentId),
    );
    const conditioningSets: string[][] = [];
    for (const subset of subsetsBySize(candidates)) {
      const set = new Set(subset);
      if (conditioningSets.some((existing) => isSubset(new Set(existing), set))) continue;
      if (
        checkConditionalInstrument(graph, exposureId, outcomeId, instrumentId, set, criterion).valid
      ) {
        conditioningSets.push(sortedNodeIds(graph, subset));
      }
    }
    if (conditioningSets.length > 0) {
      instruments.push({
        instrumentId,
        conditioningSets: conditioningSets.sort((left, right) =>
          compareNodeSets(graph, left, right),
        ),
        criterion,
      });
    }
  }
  return instruments.sort((left, right) => {
    const leftIdx = graph.nodes.find((node) => node.id === left.instrumentId)?.idx ?? 0;
    const rightIdx = graph.nodes.find((node) => node.id === right.instrumentId)?.idx ?? 0;
    return leftIdx - rightIdx;
  });
}
