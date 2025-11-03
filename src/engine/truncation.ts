import { isPositiveSemidefinite, symmetricEigenvalues } from "@/engine/matrix";
import type { CovarianceContext } from "@/engine/stats";

const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

function polevl(x: number, coefficients: readonly number[]): number {
  return coefficients.reduce((value, coefficient) => value * x + coefficient, 0);
}

function p1evl(x: number, coefficients: readonly number[]): number {
  let value = x + coefficients[0];
  for (let index = 1; index < coefficients.length; index += 1) value = value * x + coefficients[index];
  return value;
}

// Cody/Cephes-style rational coefficients. The resulting normal CDF is accurate
// well beyond the contract's 1e-6 Φ-dependent tolerance over its UI range.
const ERF_T = [
  9.604973739870516,
  90.02601972038427,
  2232.005345946843,
  7003.325141128051,
  55592.301301039496,
];
const ERF_U = [
  33.56171416475031,
  521.3579497801527,
  4594.323829709801,
  22629.000061389092,
  49267.39426086359,
];
const ERFC_P = [
  2.461969814735305e-10,
  0.5641895648310688,
  7.463210564422699,
  48.63719709856814,
  196.5208329560771,
  526.4451949954774,
  934.5285271719576,
  1027.5518868951572,
  557.5353353693993,
];
const ERFC_Q = [
  13.2281951154745,
  86.70721408859897,
  354.9377788878199,
  975.7085017432055,
  1823.9091668790973,
  2246.33760818711,
  1656.6630919416135,
  557.5353408177277,
];
const ERFC_R = [
  0.5641895835477551,
  1.275366707599781,
  5.019050422511805,
  6.160210979930536,
  7.409742699504489,
  2.9788666537210024,
];
const ERFC_S = [
  2.260528632201173,
  9.396035249380014,
  12.048953980809666,
  17.08144507475659,
  9.608968090632859,
  3.369076451000815,
];

export function erf(value: number): number {
  if (!Number.isFinite(value)) return Math.sign(value);
  const magnitude = Math.abs(value);
  if (magnitude > 1) return 1 - erfc(value);
  const squared = value * value;
  return (value * polevl(squared, ERF_T)) / p1evl(squared, ERF_U);
}

export function erfc(value: number): number {
  if (Number.isNaN(value)) return Number.NaN;
  const magnitude = Math.abs(value);
  if (magnitude < 1) return 1 - erf(value);
  const exponential = Math.exp(-value * value);
  if (exponential === 0) return value < 0 ? 2 : 0;
  const numerator = magnitude < 8 ? polevl(magnitude, ERFC_P) : polevl(magnitude, ERFC_R);
  const denominator = magnitude < 8 ? p1evl(magnitude, ERFC_Q) : p1evl(magnitude, ERFC_S);
  const result = (exponential * numerator) / denominator;
  return value < 0 ? 2 - result : result;
}

export function normalPdf(value: number): number {
  return Math.exp(-0.5 * value * value) / SQRT_TWO_PI;
}

export function normalCdf(value: number): number {
  return 0.5 * erfc(-value / Math.SQRT2);
}

export function normalSurvival(value: number): number {
  return 0.5 * erfc(value / Math.SQRT2);
}

const ACKLAM_A = [
  -39.69683028665376,
  220.9460984245205,
  -275.9285104469687,
  138.357751867269,
  -30.66479806614716,
  2.506628277459239,
];
const ACKLAM_B = [
  -54.47609879822406,
  161.5858368580409,
  -155.6989798598866,
  66.80131188771972,
  -13.28068155288572,
];
const ACKLAM_C = [
  -0.007784894002430293,
  -0.3223964580411365,
  -2.400758277161838,
  -2.549732539343734,
  4.374664141464968,
  2.938163982698783,
];
const ACKLAM_D = [
  0.007784695709041462,
  0.3224671290700398,
  2.445134137142996,
  3.754408661907416,
];
const ACKLAM_LOW = 0.02425;
const ACKLAM_HIGH = 1 - ACKLAM_LOW;

function rationalPolynomial(value: number, numerator: readonly number[], denominator: readonly number[]): number {
  return polevl(value, numerator) / (polevl(value, denominator) * value + 1);
}

/** Acklam's three-region inverse normal with a single Halley refinement. */
export function normalInverse(probability: number): number {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    throw new RangeError("Normal quantile requires a probability strictly between zero and one.");
  }
  let result: number;
  if (probability < ACKLAM_LOW) {
    const root = Math.sqrt(-2 * Math.log(probability));
    result = rationalPolynomial(root, ACKLAM_C, ACKLAM_D);
  } else if (probability > ACKLAM_HIGH) {
    const root = Math.sqrt(-2 * Math.log(1 - probability));
    result = -rationalPolynomial(root, ACKLAM_C, ACKLAM_D);
  } else {
    const centered = probability - 0.5;
    const squared = centered * centered;
    result = (polevl(squared, ACKLAM_A) * centered) / (polevl(squared, ACKLAM_B) * squared + 1);
  }
  const error = normalCdf(result) - probability;
  const correction = error / normalPdf(result);
  return result - correction / (1 + (result * correction) / 2);
}

export interface SelectionRule {
  nodeId: string;
  quantile: number;
}

export interface TruncationResult extends CovarianceContext {
  threshold: number;
  alpha: number;
  inverseMills: number;
  delta: number;
  marginalSd: number;
  effectiveFraction: number;
  eigenvalues: number[];
}

export function truncateCovariance(
  context: CovarianceContext,
  rule: SelectionRule,
): TruncationResult {
  if (!Number.isFinite(rule.quantile) || rule.quantile < 0.01 || rule.quantile > 0.99) {
    throw new RangeError("Selection quantile must be in [0.01, 0.99].");
  }
  const selectionIndex = context.indexById.get(rule.nodeId);
  if (selectionIndex === undefined) throw new Error("Selection node is missing from the covariance.");
  const selectionVariance = context.covariance[selectionIndex][selectionIndex];
  if (!Number.isFinite(selectionVariance) || selectionVariance <= 0) {
    throw new Error("Selection node has no positive marginal variance.");
  }
  const marginalSd = Math.sqrt(selectionVariance);
  const alpha = normalInverse(rule.quantile);
  const survival = normalSurvival(alpha);
  const inverseMills = normalPdf(alpha) / survival;
  const delta = inverseMills * (inverseMills - alpha);
  if (!Number.isFinite(delta) || delta <= 0 || delta >= 1) {
    throw new Error("Selection truncation produced an invalid attenuation factor.");
  }
  const gamma = context.covariance.map((row) => row[selectionIndex] / marginalSd);
  const covariance = context.covariance.map((row, rowIndex) =>
    row.map((value, columnIndex) => value - delta * gamma[rowIndex] * gamma[columnIndex]),
  );
  const eigenvalues = symmetricEigenvalues(covariance);
  if (!isPositiveSemidefinite(covariance)) {
    throw new Error("Truncated covariance failed its PSD assertion.");
  }
  return {
    covariance,
    indexById: new Map(context.indexById),
    threshold: marginalSd * alpha,
    alpha,
    inverseMills,
    delta,
    marginalSd,
    effectiveFraction: survival,
    eigenvalues,
  };
}
