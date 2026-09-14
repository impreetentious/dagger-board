import { observedNodeIds, type Graph } from "@/engine/graph";
import {
  conditionalVariance,
  olsEstimand,
  partialCovariance,
  type CovarianceContext,
} from "@/engine/stats";

/**
 * The sensitivity surface — robustness to the confounder that was never drawn.
 *
 * Every verdict this instrument gives is conditional on the DAG being complete, and that is
 * the standard objection to the whole workflow: *what about the confounder you didn't draw?*
 * Until now the honest answer was silence. This module makes the silence quantitative.
 *
 * The frame is Cinelli & Hazlett (2020, JRSS-B; the `sensemakr` package): an omitted
 * confounder's bias on an OLS coefficient is pinned down entirely by two partial R² values —
 * how much of the exposure it explains, and how much of the outcome. In a linear model that
 * relationship is exact, not an approximation, which is why it belongs here: this engine's SCM
 * is linear-Gaussian by construction, so what is an approximation-laden afterthought on top of
 * fitted regressions is closed form on top of Σ.
 *
 * Two things are different from `sensemakr`'s usual use, and both are the point:
 *
 * - It runs **before data**. There is no `se`, no `df`, no t-statistic; every quantity below is
 *   a population value read off Σ. So the significance-based robustness value (`RV_{q,α}`) has
 *   no meaning here and is deliberately absent rather than faked with an assumed n.
 * - Benchmarks are **exact rather than bounded**. `sensemakr` bounds a hypothetical confounder
 *   against an observed covariate because it cannot see the counterfactual. This engine can:
 *   dropping a covariate from the adjustment set is a covariance computation, so the benchmark
 *   is the bias that node would actually cause, not a bound on it.
 */

export interface SensitivityBenchmark {
  nodeId: string;
  /** R²_{X ~ W | Z∖W} — how much of the exposure this node explains, net of the rest of Z. */
  exposureShare: number;
  /** R²_{Y ~ W | X, Z∖W} — how much of the outcome it explains, net of X and the rest of Z. */
  outcomeShare: number;
  /** In the adjustment set today, so its bias is a counterfactual we can compute exactly. */
  adjusted: boolean;
  /** The estimand if this node were unmeasured. Exact; null when it is not in Z. */
  estimandWithout: number | null;
  /** True when a confounder exactly this strong would drive the estimate past zero. */
  overturns: boolean;
  /** How many times this strength an undrawn confounder would need to be to overturn it. */
  multipleToOverturn: number | null;
}

export interface ContourLevel {
  /** The adjusted estimate this curve traces. */
  value: number;
  /** Exact points on the iso-curve, in (exposure share, outcome share) coordinates. */
  points: Array<{ x: number; y: number }>;
}

export interface SensitivityReport {
  conditioningIds: string[];
  /** β(Z) — what the chosen design estimates in the population. */
  estimand: number;
  totalEffect: number;
  /** β(Z) − TE. Zero on a valid design; the confounder below is on top of this. */
  populationBias: number;
  /**
   * `√(Σ_{YY·X,Z} / Σ_{XX·Z})` — the exchange rate between confounder strength and bias, and
   * the population counterpart of `se·√df` in the finite-sample formulation.
   */
  biasScale: number;
  /**
   * The strength, as a partial R² with **both** exposure and outcome, that an undrawn
   * confounder would need in order to bring the estimate to zero. Read it as: "a confounder
   * would have to explain this share of both X and Y, net of everything drawn, before the
   * conclusion dies."
   */
  robustnessValue: number;
  /** The same, for driving the estimate past zero to the mirror of its current value. */
  robustnessValueSignFlip: number;
  contour: ContourLevel[];
  benchmarks: SensitivityBenchmark[];
  /** True when the estimand is already zero, so no confounder strength is needed to kill it. */
  degenerate: boolean;
}

const CONTOUR_SAMPLES = 96;
const EPSILON = 1e-12;

/**
 * Bias from a confounder of the given strength, in the direction that works against the
 * estimate: `|bias| = BF · √( R²_Y · R²_D / (1 − R²_D) )`.
 */
export function confounderBias(
  biasScale: number,
  exposureShare: number,
  outcomeShare: number,
): number {
  if (exposureShare >= 1) return Number.POSITIVE_INFINITY;
  if (exposureShare <= 0 || outcomeShare <= 0) return 0;
  return biasScale * Math.sqrt((outcomeShare * exposureShare) / (1 - exposureShare));
}

/**
 * `RV_q = ½(√(f⁴ + 4f²) − f²)` with `f = q·|β| / BF`: the point where the iso-bias curve for a
 * `q·100%` reduction crosses the diagonal `R²_D = R²_Y`. Solving `RV²/(1−RV) = f²` for RV.
 */
export function robustnessValue(estimand: number, biasScale: number, q = 1): number {
  if (!Number.isFinite(biasScale) || biasScale <= 0) return 0;
  const f = (q * Math.abs(estimand)) / biasScale;
  if (f <= 0) return 0;
  const fSquared = f * f;
  return 0.5 * (Math.sqrt(fSquared * fSquared + 4 * fSquared) - fSquared);
}

/**
 * The exact locus of confounders that would move the estimate to `value`. Rearranging the bias
 * formula gives `R²_Y = ((β − value)/BF)² · (1 − R²_D)/R²_D`, so the curve is drawn from its own
 * closed form rather than traced numerically across a sampled grid.
 */
function isoCurve(estimand: number, biasScale: number, value: number): ContourLevel {
  const gap = Math.abs(estimand - value);
  const scaled = (gap / biasScale) ** 2;
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 1; index <= CONTOUR_SAMPLES; index += 1) {
    const x = index / (CONTOUR_SAMPLES + 1);
    const y = (scaled * (1 - x)) / x;
    if (y > 1) continue;
    points.push({ x, y });
  }
  return { value, points };
}

function partialR2(
  context: CovarianceContext,
  left: string,
  right: string,
  conditionedIds: readonly string[],
): number {
  const covariance = partialCovariance(context, left, right, conditionedIds);
  const leftVariance = conditionalVariance(context, left, conditionedIds);
  const rightVariance = conditionalVariance(context, right, conditionedIds);
  if (leftVariance <= EPSILON || rightVariance <= EPSILON) return 0;
  const value = (covariance * covariance) / (leftVariance * rightVariance);
  return Math.min(1, Math.max(0, value));
}

export interface SensitivityInput {
  graph: Graph;
  context: CovarianceContext;
  exposureId: string;
  outcomeId: string;
  conditioningIds: readonly string[];
  totalEffect: number;
  /** Adjusted-estimate levels to trace. Defaults to zero plus two intermediate reductions. */
  levels?: readonly number[];
}

export function evaluateSensitivity(input: SensitivityInput): SensitivityReport {
  const { graph, context, exposureId, outcomeId, totalEffect } = input;
  const conditioningIds = [...new Set(input.conditioningIds)];
  const ols = olsEstimand(context, exposureId, outcomeId, conditioningIds, totalEffect);
  const residualVariance = conditionalVariance(context, outcomeId, [
    exposureId,
    ...conditioningIds,
  ]);
  const exposureVariance = conditionalVariance(context, exposureId, conditioningIds);
  const biasScale =
    exposureVariance > EPSILON && residualVariance >= 0
      ? Math.sqrt(residualVariance / exposureVariance)
      : 0;

  const degenerate = Math.abs(ols.estimand) <= EPSILON || biasScale <= EPSILON;
  const rv = degenerate ? 0 : robustnessValue(ols.estimand, biasScale, 1);
  const rvFlip = degenerate ? 0 : robustnessValue(ols.estimand, biasScale, 2);

  // Halved, zeroed, reversed — the three readings a reviewer actually argues about.
  const levels = input.levels ?? (degenerate ? [0] : [ols.estimand / 2, 0, -ols.estimand]);
  const contour = degenerate ? [] : levels.map((value) => isoCurve(ols.estimand, biasScale, value));

  const conditioningSet = new Set(conditioningIds);
  const benchmarks: SensitivityBenchmark[] = observedNodeIds(graph)
    .filter((id) => id !== exposureId && id !== outcomeId)
    .map((nodeId) => {
      const rest = conditioningIds.filter((id) => id !== nodeId);
      const exposureShare = partialR2(context, exposureId, nodeId, rest);
      const outcomeShare = partialR2(context, outcomeId, nodeId, [exposureId, ...rest]);
      const adjusted = conditioningSet.has(nodeId);
      let estimandWithout: number | null = null;
      if (adjusted) {
        try {
          estimandWithout = olsEstimand(context, exposureId, outcomeId, rest, totalEffect).estimand;
        } catch {
          estimandWithout = null;
        }
      }
      const bias = confounderBias(biasScale, exposureShare, outcomeShare);
      const strength = Math.min(exposureShare, outcomeShare);
      return {
        nodeId,
        exposureShare,
        outcomeShare,
        adjusted,
        estimandWithout,
        overturns: !degenerate && bias >= Math.abs(ols.estimand),
        multipleToOverturn:
          degenerate || strength <= EPSILON ? null : Math.max(1e-6, rv / strength),
      };
    });

  return {
    conditioningIds,
    estimand: ols.estimand,
    totalEffect,
    populationBias: ols.populationBias,
    biasScale,
    robustnessValue: rv,
    robustnessValueSignFlip: rvFlip,
    contour,
    benchmarks,
    degenerate,
  };
}

/** One line for the Analysis Design Record — the sentence the verdict alone cannot say. */
export function sensitivitySummary(report: SensitivityReport): string {
  if (report.degenerate) {
    return "The estimate is already zero under this design, so no confounder strength is required to overturn it.";
  }
  const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
  return `An unmeasured confounder would have to explain ${percent(report.robustnessValue)} of the exposure and ${percent(report.robustnessValue)} of the outcome — each net of everything already drawn — to bring this estimate to zero, and ${percent(report.robustnessValueSignFlip)} of each to reverse its sign.`;
}
