import { dSeparatedBayesBall } from "@/engine/dsep";
import { descendantsOf, observedNodeIds, type Graph, withoutEdges } from "@/engine/graph";
import { compareNodeSets, isSubset, sortedNodeIds, subsetsBySize } from "@/engine/sets";

/**
 * Conditional instruments for the **total** effect (§3.6). The sound criterion
 * `({Z} ∪ W) ∩ De(X) = ∅` makes the `G_out(X)`
 * d-separation faithfully validate the Wald identity `Σ_{ZY·W} = TE · Σ_{ZX·W}`.
 *
 * There is no relaxed criterion here: relaxing the barrier toward Brito & Pearl /
 * van der Zander–Textor–Liśkiewicz ancestral
 * instruments admits descendants of X, which re-introduce a back-door term the
 * mutilated-graph check cannot see — `tests/unit/iv-soundness.test.ts` witnesses
 * it on fixture #16 (β_IV = 0.95 ≠ TE = 0.7). The sound ancestral relaxation
 * identifies the direct effect, while this module targets total effects. See
 * docs/notes/identification.md for the literature trace and counterexample.
 */

export interface InstrumentCheck {
  valid: boolean;
  nonDescendant: boolean;
  relevant: boolean;
  exogenous: boolean;
}

export interface ConditionalInstrument {
  instrumentId: string;
  conditioningSets: string[][];
}

function graphWithoutExposureOutgoingEdges(graph: Graph, exposureId: string): Graph {
  return withoutEdges(graph, (edge) => edge.from === exposureId);
}

export function checkConditionalInstrument(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
  instrumentId: string,
  conditioning: ReadonlySet<string>,
): InstrumentCheck {
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
      if (checkConditionalInstrument(graph, exposureId, outcomeId, instrumentId, set).valid) {
        conditioningSets.push(sortedNodeIds(graph, subset));
      }
    }
    if (conditioningSets.length > 0) {
      instruments.push({
        instrumentId,
        conditioningSets: conditioningSets.sort((left, right) =>
          compareNodeSets(graph, left, right),
        ),
      });
    }
  }
  return instruments.sort((left, right) => {
    const leftIdx = graph.nodes.find((node) => node.id === left.instrumentId)?.idx ?? 0;
    const rightIdx = graph.nodes.find((node) => node.id === right.instrumentId)?.idx ?? 0;
    return leftIdx - rightIdx;
  });
}
