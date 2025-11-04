import { inverse, type Matrix } from "@/engine/matrix";
import { normalCdf } from "@/engine/truncation";

export interface CovarianceContext {
  covariance: Matrix;
  indexById: ReadonlyMap<string, number>;
}

export interface OlsEstimate {
  estimand: number;
  numerator: number;
  denominator: number;
  populationBias: number;
}

export interface IvEstimate {
  status: "defined" | "weak" | "undefined";
  estimand: number | null;
  numerator: number;
  denominator: number;
  firstStageCorrelation: number;
  populationBias: number | null;
}

export const IV_UNDEFINED_CORRELATION = 1e-8;
export const IV_WEAK_CORRELATION = 0.01;

function indexFor(context: CovarianceContext, id: string): number {
  const index = context.indexById.get(id);
  if (index === undefined) throw new Error(`Covariance requested for missing node ${id}.`);
  return index;
}

export function covarianceEntry(context: CovarianceContext, left: string, right: string): number {
  return context.covariance[indexFor(context, left)][indexFor(context, right)];
}

/** Scalar Schur complement, with an empty conditioning set as the raw covariance. */
export function partialCovariance(
  context: CovarianceContext,
  left: string,
  right: string,
  conditionedIds: readonly string[] = [],
): number {
  const conditioned = [...new Set(conditionedIds)];
  if (conditioned.length === 0) return covarianceEntry(context, left, right);
  const sigmaZZ = conditioned.map((rowId) =>
    conditioned.map((columnId) => covarianceEntry(context, rowId, columnId)),
  );
  const sigmaLeftZ = [conditioned.map((id) => covarianceEntry(context, left, id))];
  const sigmaZRight = conditioned.map((id) => [covarianceEntry(context, id, right)]);
  const correction = multiplyScalar(
    multiplyMatrix(multiplyMatrix(sigmaLeftZ, inverse(sigmaZZ)), sigmaZRight),
  );
  return covarianceEntry(context, left, right) - correction;
}

function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  const result = Array.from({ length: left.length }, () => Array<number>(right[0].length).fill(0));
  for (let row = 0; row < left.length; row += 1) {
    for (let shared = 0; shared < right.length; shared += 1) {
      for (let column = 0; column < right[0].length; column += 1) {
        result[row][column] += left[row][shared] * right[shared][column];
      }
    }
  }
  return result;
}

function multiplyScalar(matrix: Matrix): number {
  return matrix[0][0];
}

export function conditionalVariance(
  context: CovarianceContext,
  id: string,
  conditionedIds: readonly string[] = [],
): number {
  return partialCovariance(context, id, id, conditionedIds);
}

export function olsEstimand(
  context: CovarianceContext,
  exposureId: string,
  outcomeId: string,
  conditionedIds: readonly string[],
  totalEffect: number,
): OlsEstimate {
  const numerator = partialCovariance(context, exposureId, outcomeId, conditionedIds);
  const denominator = conditionalVariance(context, exposureId, conditionedIds);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error("OLS is undefined because the conditional exposure variance is non-positive.");
  }
  const estimand = numerator / denominator;
  return { estimand, numerator, denominator, populationBias: estimand - totalEffect };
}

export function ivEstimand(
  context: CovarianceContext,
  instrumentId: string,
  exposureId: string,
  outcomeId: string,
  conditionedIds: readonly string[],
  totalEffect: number,
): IvEstimate {
  const numerator = partialCovariance(context, instrumentId, outcomeId, conditionedIds);
  const denominator = partialCovariance(context, instrumentId, exposureId, conditionedIds);
  const instrumentVariance = conditionalVariance(context, instrumentId, conditionedIds);
  const exposureVariance = conditionalVariance(context, exposureId, conditionedIds);
  const correlation = denominator / Math.sqrt(instrumentVariance * exposureVariance);
  if (!Number.isFinite(correlation) || Math.abs(correlation) < IV_UNDEFINED_CORRELATION) {
    return {
      status: "undefined",
      estimand: null,
      numerator,
      denominator,
      firstStageCorrelation: correlation,
      populationBias: null,
    };
  }
  const estimand = numerator / denominator;
  return {
    status: Math.abs(correlation) < IV_WEAK_CORRELATION ? "weak" : "defined",
    estimand,
    numerator,
    denominator,
    firstStageCorrelation: correlation,
    populationBias: estimand - totalEffect,
  };
}

export function ivMultiplicativeIdentity(
  context: CovarianceContext,
  instrumentId: string,
  exposureId: string,
  outcomeId: string,
  conditionedIds: readonly string[],
  totalEffect: number,
): number {
  return (
    partialCovariance(context, instrumentId, outcomeId, conditionedIds) -
    totalEffect * partialCovariance(context, instrumentId, exposureId, conditionedIds)
  );
}

export function frontdoorEstimand(
  context: CovarianceContext,
  exposureId: string,
  mediatorId: string,
  outcomeId: string,
): number {
  const firstStage =
    covarianceEntry(context, exposureId, mediatorId) /
    covarianceEntry(context, exposureId, exposureId);
  const secondStage =
    partialCovariance(context, mediatorId, outcomeId, [exposureId]) /
    conditionalVariance(context, mediatorId, [exposureId]);
  return firstStage * secondStage;
}

export function olsStandardError(
  context: CovarianceContext,
  exposureId: string,
  outcomeId: string,
  conditionedIds: readonly string[],
  sampleSize: number,
): number {
  if (sampleSize <= 0) throw new Error("A positive sample size is required.");
  const residualVariance = conditionalVariance(context, outcomeId, [exposureId, ...conditionedIds]);
  const exposureVariance = conditionalVariance(context, exposureId, conditionedIds);
  if (residualVariance < 0 || exposureVariance <= 0) throw new Error("OLS SE is undefined.");
  return Math.sqrt(residualVariance / (sampleSize * exposureVariance));
}

/** Test-only homoskedastic SE for a just-identified conditional-IV row. */
export function ivTestStandardError(
  context: CovarianceContext,
  instrumentId: string,
  exposureId: string,
  outcomeId: string,
  conditionedIds: readonly string[],
  sampleSize: number,
): number | null {
  const estimate = ivEstimand(context, instrumentId, exposureId, outcomeId, conditionedIds, 0);
  if (estimate.estimand === null || sampleSize <= 0) return null;
  const beta = estimate.estimand;
  const sigmaU =
    conditionalVariance(context, outcomeId, conditionedIds) -
    2 * beta * partialCovariance(context, exposureId, outcomeId, conditionedIds) +
    beta * beta * conditionalVariance(context, exposureId, conditionedIds);
  const instrumentVariance = conditionalVariance(context, instrumentId, conditionedIds);
  if (sigmaU < 0 || instrumentVariance <= 0) return null;
  return Math.sqrt((sigmaU * instrumentVariance) / (sampleSize * estimate.denominator ** 2));
}

export function powerPreview(estimand: number, standardError: number): number {
  if (!Number.isFinite(standardError) || standardError <= 0) return 0;
  const signal = Math.abs(estimand) / standardError;
  const critical = 1.959963984540054;
  return normalCdf(-critical + signal) + normalCdf(-critical - signal);
}
