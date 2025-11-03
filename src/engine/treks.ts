import { nodeById, type Graph } from "@/engine/graph";
import { enumerateDirectedPaths, enumerateTreks } from "@/engine/paths";
import { zeros, type Matrix } from "@/engine/matrix";

export type CoefficientLookup = (from: string, to: string) => number;
export type ErrorVarianceLookup = (nodeId: string) => number;

export function pathCoefficient(path: readonly string[], coefficient: CoefficientLookup): number {
  let product = 1;
  for (let index = 0; index < path.length - 1; index += 1) {
    product *= coefficient(path[index], path[index + 1]);
  }
  return product;
}

/**
 * Ordered trek pairs are intentionally retained. For u === v, left/right path
 * pairs A,B and B,A are distinct cross terms in the variance.
 */
export function trekCovariance(
  graph: Graph,
  leftId: string,
  rightId: string,
  coefficient: CoefficientLookup,
  errorVariance: ErrorVarianceLookup,
): number {
  nodeById(graph, leftId);
  nodeById(graph, rightId);
  return enumerateTreks(graph, leftId, rightId).reduce(
    (sum, trek) =>
      sum +
      errorVariance(trek.sourceId) *
        pathCoefficient(trek.leftPath, coefficient) *
        pathCoefficient(trek.rightPath, coefficient),
    0,
  );
}

export function trekCovarianceMatrix(
  graph: Graph,
  nodeIds: readonly string[],
  coefficient: CoefficientLookup,
  errorVariance: ErrorVarianceLookup,
): Matrix {
  const covariance = zeros(nodeIds.length);
  for (let row = 0; row < nodeIds.length; row += 1) {
    for (let column = row; column < nodeIds.length; column += 1) {
      const value = trekCovariance(graph, nodeIds[row], nodeIds[column], coefficient, errorVariance);
      covariance[row][column] = value;
      covariance[column][row] = value;
    }
  }
  return covariance;
}

export function directedPathTotalEffect(
  graph: Graph,
  exposureId: string,
  outcomeId: string,
  coefficient: CoefficientLookup,
): number {
  return enumerateDirectedPaths(graph, exposureId, outcomeId).reduce(
    (sum, path) => sum + pathCoefficient(path, coefficient),
    0,
  );
}
