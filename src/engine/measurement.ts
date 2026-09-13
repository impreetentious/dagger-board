import { observedNodeIds, type Graph } from "@/engine/graph";
import type { Matrix } from "@/engine/matrix";
import type { CovarianceContext } from "@/engine/stats";

/**
 * Measurement error, as a design-time knob.
 *
 * "Our covariate is a noisy proxy" is the single most common defect in the observational
 * analyses this instrument's audience reviews, and until now the product could *teach* it —
 * the Learn scenario has always been there — but Design could not *express* it. A verdict that
 * assumes every drawn node is measured perfectly is answering an easier question than the one
 * being asked.
 *
 * The model is the standard classical one, and in a linear-Gaussian SCM it is exact rather
 * than approximate. A mismeasured node is the true node plus independent noise:
 *
 *     v* = v + e ,  e ⊥ everything ,  Var(e) = Σ_vv · (1 − λ) / λ
 *
 * where **reliability** `λ = Var(v) / Var(v*) ∈ (0, 1]` is the share of the observed variance
 * that is signal — the psychometrician's definition, and the one a reviewer will recognise.
 * Because the noise is independent of everything else, the entire consequence is one number
 * added to that node's *diagonal* entry of Σ. Every covariance with any other variable is
 * untouched. So the whole propagation is a diagonal edit, and every estimand, bias, standard
 * error, and power number downstream follows from re-reading the same closed forms on the
 * attenuated matrix.
 *
 * Two consequences worth stating because they are the lesson:
 *
 * - A mismeasured **exposure** attenuates its own coefficient toward zero: the denominator
 *   grows while the numerator does not.
 * - A mismeasured **confounder** only *partly* deconfounds. Adjusting for a noisy proxy removes
 *   the share of the confounding the proxy can see, and leaves the rest — which is why "we
 *   controlled for it" is not the same sentence as "it is controlled for".
 *
 * The true total effect is a structural quantity and is *not* attenuated: mismeasuring a
 * variable changes what an estimator recovers, never what is true. That asymmetry is exactly
 * what makes the bias column meaningful.
 */

/** Reliability per node id; a missing entry means perfectly measured. */
export type ReliabilityMap = Readonly<Record<string, number>>;

export const RELIABILITY_MIN = 0.05;
export const RELIABILITY_MAX = 1;

export class MeasurementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeasurementError";
  }
}

export function reliabilityDefaults(graph: Graph): Record<string, number> {
  return Object.fromEntries(observedNodeIds(graph).map((id) => [id, 1]));
}

/** `Var(e) = Σ_vv · (1 − λ)/λ` — the noise variance a stated reliability implies. */
export function measurementNoiseVariance(trueVariance: number, reliability: number): number {
  if (!(reliability > 0) || reliability > RELIABILITY_MAX) {
    throw new MeasurementError("Reliability must lie in (0, 1].");
  }
  if (reliability === 1) return 0;
  return (trueVariance * (1 - reliability)) / reliability;
}

export function anyMismeasured(reliabilities: ReliabilityMap | undefined): boolean {
  if (!reliabilities) return false;
  return Object.values(reliabilities).some((value) => Number.isFinite(value) && value < 1);
}

/**
 * The observed covariance under the declared reliabilities. Only the diagonal moves, which is
 * the whole content of the classical model — and the reason this needs no new solver.
 */
export function attenuateCovariance(
  context: CovarianceContext,
  reliabilities: ReliabilityMap | undefined,
): CovarianceContext {
  if (!anyMismeasured(reliabilities)) return context;
  const next: Matrix = context.covariance.map((row) => [...row]);
  for (const [nodeId, reliability] of Object.entries(reliabilities ?? {})) {
    if (!Number.isFinite(reliability) || reliability >= 1) continue;
    const index = context.indexById.get(nodeId);
    if (index === undefined) continue;
    next[index][index] += measurementNoiseVariance(context.covariance[index][index], reliability);
  }
  return { covariance: next, indexById: context.indexById };
}

export interface AttenuationNote {
  nodeId: string;
  reliability: number;
  trueVariance: number;
  observedVariance: number;
  /** Var(e): how much of the observed variance is noise. */
  noiseVariance: number;
}

/** Per-node bookkeeping for the Design surface and the record — no hidden arithmetic. */
export function attenuationNotes(
  context: CovarianceContext,
  reliabilities: ReliabilityMap | undefined,
): AttenuationNote[] {
  if (!anyMismeasured(reliabilities)) return [];
  const notes: AttenuationNote[] = [];
  for (const [nodeId, reliability] of Object.entries(reliabilities ?? {})) {
    if (!Number.isFinite(reliability) || reliability >= 1) continue;
    const index = context.indexById.get(nodeId);
    if (index === undefined) continue;
    const trueVariance = context.covariance[index][index];
    const noiseVariance = measurementNoiseVariance(trueVariance, reliability);
    notes.push({
      nodeId,
      reliability,
      trueVariance,
      observedVariance: trueVariance + noiseVariance,
      noiseVariance,
    });
  }
  return notes.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
}
