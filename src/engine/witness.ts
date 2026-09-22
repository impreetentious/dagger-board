import { observedNodeIds, type Graph } from "@/engine/graph";
import {
  buildScmModel,
  covarianceAt,
  edgeParameterKey,
  matrixTotalEffect,
  normalizeScmParameters,
  EDGE_COEFFICIENT_MAX,
  EDGE_COEFFICIENT_MIN,
  ERROR_SD_MAX,
  ERROR_SD_MIN,
  type SCMParameters,
} from "@/engine/scm";

/**
 * Non-identification, demonstrated instead of asserted.
 *
 * When Prove reaches "not identified by this instrument's strategies", the verdict is a claim
 * about every possible dataset — and a claim of that size deserves better than being taken on
 * faith. A **witness pair** is the proof: two parameterizations of the same drawn DAG that
 * agree on every observable covariance, and disagree about the effect of X on Y. Same
 * observable world, two different truths. No estimator that reads only the observables can
 * tell them apart, which is exactly what non-identification means.
 *
 * The search is deterministic — bounded coordinate descent from the user's own
 * parameterization, no randomness anywhere — and nothing is ever reported unverified: a
 * candidate becomes a witness only after the engine confirms that its observable covariance
 * matches to tolerance and its total effect does not. A search that fails says so.
 */

interface WitnessSide {
  parameters: SCMParameters;
  totalEffect: number;
}

export interface WitnessPair {
  status: "found" | "not-found";
  /** The user's own parameterization. */
  left: WitnessSide | null;
  /** The impostor: same observable covariance, different effect. */
  right: WitnessSide | null;
  observedIds: string[];
  /** Largest absolute disagreement across observable covariance entries. The proof of "same". */
  observedCovarianceGap: number;
  /** |TE(left) − TE(right)|. The proof of "different". */
  effectGap: number;
  /** Which parameters the impostor moved, largest move first. */
  movedParameters: Array<{
    key: string;
    kind: "coefficient" | "errorSd";
    from: number;
    to: number;
  }>;
  reason: string;
}

/** A witness must match the observable moments this closely to count as the same world. */
export const WITNESS_COVARIANCE_TOLERANCE = 1e-7;
/** …and separate the effects by at least this much to be worth showing anyone. */
export const WITNESS_EFFECT_SEPARATION = 0.05;

const MAX_PASSES = 60;
const START_STEP = 0.5;
const MIN_STEP = 1e-9;
const EFFECT_WEIGHT = 1e4;

interface Slot {
  key: string;
  kind: "coefficient" | "errorSd";
  min: number;
  max: number;
}

function slotsFor(graph: Graph): Slot[] {
  const slots: Slot[] = graph.edges.map((edge) => ({
    key: edgeParameterKey(edge.from, edge.to),
    kind: "coefficient" as const,
    min: EDGE_COEFFICIENT_MIN,
    max: EDGE_COEFFICIENT_MAX,
  }));
  for (const node of graph.nodes) {
    slots.push({ key: node.id, kind: "errorSd", min: ERROR_SD_MIN, max: ERROR_SD_MAX });
  }
  return slots;
}

function readSlot(parameters: SCMParameters, slot: Slot): number {
  return slot.kind === "coefficient"
    ? (parameters.edgeCoefficients[slot.key] ?? 0)
    : (parameters.errorSds[slot.key] ?? 1);
}

function writeSlot(parameters: SCMParameters, slot: Slot, value: number): SCMParameters {
  const clamped = Math.min(slot.max, Math.max(slot.min, value));
  return slot.kind === "coefficient"
    ? {
        ...parameters,
        edgeCoefficients: { ...parameters.edgeCoefficients, [slot.key]: clamped },
      }
    : { ...parameters, errorSds: { ...parameters.errorSds, [slot.key]: clamped } };
}

interface Evaluation {
  covarianceGap: number;
  totalEffect: number;
  cost: number;
  usable: boolean;
}

function evaluate(
  graph: Graph,
  parameters: SCMParameters,
  reference: ReadonlyMap<string, number>,
  observed: readonly string[],
  exposureId: string,
  outcomeId: string,
  effectTarget: number,
): Evaluation {
  let model;
  try {
    model = buildScmModel(graph, parameters);
  } catch {
    return { covarianceGap: Infinity, totalEffect: Number.NaN, cost: Infinity, usable: false };
  }
  if (model.illConditioned) {
    return { covarianceGap: Infinity, totalEffect: Number.NaN, cost: Infinity, usable: false };
  }
  let squared = 0;
  let worst = 0;
  for (let i = 0; i < observed.length; i += 1) {
    for (let j = i; j < observed.length; j += 1) {
      const key = `${observed[i]}|${observed[j]}`;
      const target = reference.get(key) ?? 0;
      const actual = covarianceAt(model, observed[i], observed[j]);
      const difference = actual - target;
      squared += difference * difference;
      worst = Math.max(worst, Math.abs(difference));
    }
  }
  const totalEffect = matrixTotalEffect(model, exposureId, outcomeId);
  const effectMiss = totalEffect - effectTarget;
  return {
    covarianceGap: worst,
    totalEffect,
    cost: squared + EFFECT_WEIGHT * effectMiss * effectMiss,
    usable: true,
  };
}

/**
 * Bounded coordinate descent. Each pass walks every parameter and takes the better of a step
 * up or down at the current scale; when no parameter can improve, the step halves. It is a
 * plain hill-climb on purpose: the objective is smooth in the parameters, the search space is
 * small (§3.1's cap), and a deterministic method means the same graph always yields the same
 * witness — which matters more here than finding the *best* impostor, since any verified one
 * proves the point.
 */
function search(
  graph: Graph,
  start: SCMParameters,
  reference: ReadonlyMap<string, number>,
  observed: readonly string[],
  exposureId: string,
  outcomeId: string,
  effectTarget: number,
): { parameters: SCMParameters; evaluation: Evaluation } {
  const slots = slotsFor(graph);
  let current = start;
  let best = evaluate(graph, current, reference, observed, exposureId, outcomeId, effectTarget);
  let step = START_STEP;
  for (let pass = 0; pass < MAX_PASSES && step > MIN_STEP; pass += 1) {
    let improved = false;
    for (const slot of slots) {
      const value = readSlot(current, slot);
      for (const direction of [1, -1]) {
        const candidateParameters = writeSlot(current, slot, value + direction * step);
        if (readSlot(candidateParameters, slot) === value) continue;
        const candidate = evaluate(
          graph,
          candidateParameters,
          reference,
          observed,
          exposureId,
          outcomeId,
          effectTarget,
        );
        if (candidate.usable && candidate.cost < best.cost) {
          current = candidateParameters;
          best = candidate;
          improved = true;
          break;
        }
      }
    }
    if (!improved) step /= 2;
  }
  return { parameters: current, evaluation: best };
}

function movedParameters(
  graph: Graph,
  left: SCMParameters,
  right: SCMParameters,
): WitnessPair["movedParameters"] {
  return slotsFor(graph)
    .map((slot) => ({
      key: slot.key,
      kind: slot.kind,
      from: readSlot(left, slot),
      to: readSlot(right, slot),
    }))
    .filter((entry) => Math.abs(entry.from - entry.to) > 1e-6)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
}

export interface WitnessInput {
  graph: Graph;
  parameters: Partial<SCMParameters> | SCMParameters;
  /** Effects to aim the impostor at, in order. Defaults to zero, then either side of the truth. */
  targets?: readonly number[];
}

export function findWitnessPair(input: WitnessInput): WitnessPair {
  const { graph } = input;
  const exposureId = graph.roles.exposureId;
  const outcomeId = graph.roles.outcomeId;
  const observed = observedNodeIds(graph);
  const empty: WitnessPair = {
    status: "not-found",
    left: null,
    right: null,
    observedIds: observed,
    observedCovarianceGap: Number.NaN,
    effectGap: 0,
    movedParameters: [],
    reason: "",
  };
  if (!exposureId || !outcomeId) {
    return { ...empty, reason: "A witness needs an exposure and an outcome." };
  }

  const parameters = normalizeScmParameters(graph, input.parameters);
  let baseModel;
  try {
    baseModel = buildScmModel(graph, parameters);
  } catch {
    return { ...empty, reason: "The current parameterization does not build a model." };
  }
  if (baseModel.illConditioned) {
    return {
      ...empty,
      reason: "The current parameterization is degenerate, so there is nothing to hold fixed.",
    };
  }

  const reference = new Map<string, number>();
  for (let i = 0; i < observed.length; i += 1) {
    for (let j = i; j < observed.length; j += 1) {
      reference.set(
        `${observed[i]}|${observed[j]}`,
        covarianceAt(baseModel, observed[i], observed[j]),
      );
    }
  }
  const totalEffect = matrixTotalEffect(baseModel, exposureId, outcomeId);
  const left: WitnessSide = { parameters, totalEffect };

  const targets =
    input.targets ??
    (Math.abs(totalEffect) > WITNESS_EFFECT_SEPARATION
      ? [0, totalEffect + 0.5, totalEffect - 0.5, -totalEffect]
      : [totalEffect + 0.5, totalEffect - 0.5, totalEffect + 1]);

  for (const target of targets) {
    const attempt = search(graph, parameters, reference, observed, exposureId, outcomeId, target);
    const gap = attempt.evaluation.covarianceGap;
    const separation = Math.abs(attempt.evaluation.totalEffect - totalEffect);
    if (
      attempt.evaluation.usable &&
      gap <= WITNESS_COVARIANCE_TOLERANCE &&
      separation >= WITNESS_EFFECT_SEPARATION
    ) {
      return {
        status: "found",
        left,
        right: { parameters: attempt.parameters, totalEffect: attempt.evaluation.totalEffect },
        observedIds: observed,
        observedCovarianceGap: gap,
        effectGap: separation,
        movedParameters: movedParameters(graph, parameters, attempt.parameters),
        reason:
          "Every observable covariance matches to within the verification tolerance while the total effect does not — no estimator reading only these variables can tell the two apart.",
      };
    }
  }

  return {
    ...empty,
    left,
    reason:
      "No second parameterization within the model's own parameter bounds reproduced these observable moments with a materially different effect. That is not proof of identification — the search is bounded and local — but this graph and this parameterization did not yield a counterexample.",
  };
}
