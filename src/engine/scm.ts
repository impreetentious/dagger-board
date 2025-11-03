import { z } from "zod";
import { nodeById, type Graph } from "@/engine/graph";
import {
  diagonal,
  identity,
  inverse,
  isFiniteMatrix,
  matricesClose,
  multiply,
  symmetricEigenvalues,
  transpose,
  zeros,
  type Matrix,
} from "@/engine/matrix";
import {
  directedPathTotalEffect,
  trekCovarianceMatrix,
  type CoefficientLookup,
} from "@/engine/treks";

export const EDGE_COEFFICIENT_MIN = -2;
export const EDGE_COEFFICIENT_MAX = 2;
export const ERROR_SD_MIN = 0.05;
export const ERROR_SD_MAX = 3;
export const ILL_CONDITIONING_RATIO = 1e-9;

const FiniteNumberSchema = z.number().finite();

export const SCMParametersSchema = z.object({
  v: z.literal(1),
  edgeCoefficients: z.record(z.string(), FiniteNumberSchema).default({}),
  errorSds: z.record(z.string(), FiniteNumberSchema).default({}),
});

export type SCMParameters = z.infer<typeof SCMParametersSchema>;

export class ScmParameterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScmParameterError";
  }
}

export class ScmIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScmIntegrityError";
  }
}

export function edgeParameterKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

export function defaultScmParameters(graph: Graph): SCMParameters {
  return {
    v: 1,
    edgeCoefficients: Object.fromEntries(graph.edges.map((edge) => [edgeParameterKey(edge.from, edge.to), 1])),
    errorSds: Object.fromEntries(graph.nodes.map((node) => [node.id, 1])),
  };
}

/** Validates an IO-shaped parameter object and fills the contract defaults. */
export function normalizeScmParameters(
  graph: Graph,
  input: Partial<SCMParameters> | SCMParameters = {},
): SCMParameters {
  const parsed = SCMParametersSchema.parse({ v: 1, ...input });
  const knownEdges = new Set(graph.edges.map((edge) => edgeParameterKey(edge.from, edge.to)));
  const knownNodes = new Set(graph.nodes.map((node) => node.id));

  for (const key of Object.keys(parsed.edgeCoefficients)) {
    if (!knownEdges.has(key)) throw new ScmParameterError(`Parameter references a missing edge: ${key}.`);
  }
  for (const key of Object.keys(parsed.errorSds)) {
    if (!knownNodes.has(key)) throw new ScmParameterError(`Parameter references a missing node: ${key}.`);
  }

  const defaults = defaultScmParameters(graph);
  const edgeCoefficients = { ...defaults.edgeCoefficients, ...parsed.edgeCoefficients };
  const errorSds = { ...defaults.errorSds, ...parsed.errorSds };
  for (const [key, value] of Object.entries(edgeCoefficients)) {
    if (value < EDGE_COEFFICIENT_MIN || value > EDGE_COEFFICIENT_MAX) {
      throw new ScmParameterError(
        `Edge coefficient ${key} must be in [${EDGE_COEFFICIENT_MIN}, ${EDGE_COEFFICIENT_MAX}].`,
      );
    }
  }
  for (const [id, value] of Object.entries(errorSds)) {
    if (value < ERROR_SD_MIN || value > ERROR_SD_MAX) {
      throw new ScmParameterError(
        `Error SD for ${id} must be in [${ERROR_SD_MIN}, ${ERROR_SD_MAX}].`,
      );
    }
  }
  return { v: 1, edgeCoefficients, errorSds };
}

export function edgeCoefficient(
  parameters: SCMParameters,
  from: string,
  to: string,
): number {
  const coefficient = parameters.edgeCoefficients[edgeParameterKey(from, to)];
  if (coefficient === undefined) throw new ScmParameterError(`Missing coefficient for ${from} → ${to}.`);
  return coefficient;
}

export function errorVariance(parameters: SCMParameters, nodeId: string): number {
  const errorSd = parameters.errorSds[nodeId];
  if (errorSd === undefined) throw new ScmParameterError(`Missing error SD for ${nodeId}.`);
  return errorSd * errorSd;
}

export interface ScmModel {
  graph: Graph;
  parameters: SCMParameters;
  nodeIds: string[];
  indexById: Map<string, number>;
  coefficientMatrix: Matrix;
  propagationMatrix: Matrix;
  errorCovariance: Matrix;
  covariance: Matrix;
  eigenvalues: number[];
  illConditioned: boolean;
}

export function buildScmModel(
  graph: Graph,
  parameterInput: Partial<SCMParameters> | SCMParameters = {},
): ScmModel {
  const parameters = normalizeScmParameters(graph, parameterInput);
  const nodeIds = [...graph.nodes].sort((left, right) => left.idx - right.idx).map((node) => node.id);
  const indexById = new Map(nodeIds.map((id, index) => [id, index]));
  const coefficientMatrix = zeros(nodeIds.length);
  for (const edge of graph.edges) {
    const from = indexById.get(edge.from);
    const to = indexById.get(edge.to);
    if (from === undefined || to === undefined) throw new ScmParameterError("Graph index is invalid.");
    coefficientMatrix[from][to] = edgeCoefficient(parameters, edge.from, edge.to);
  }
  const system = identity(nodeIds.length);
  for (let row = 0; row < nodeIds.length; row += 1) {
    for (let column = 0; column < nodeIds.length; column += 1) {
      system[row][column] -= coefficientMatrix[column][row];
    }
  }
  const propagationMatrix = inverse(system);
  const errorCovariance = diagonal(nodeIds.map((id) => errorVariance(parameters, id)));
  const covariance = multiply(multiply(propagationMatrix, errorCovariance), transpose(propagationMatrix));
  const eigenvalues = isFiniteMatrix(covariance) ? symmetricEigenvalues(covariance) : [Number.NaN];
  const maxEigenvalue = Math.max(...eigenvalues);
  const minEigenvalue = Math.min(...eigenvalues);
  const illConditioned =
    !isFiniteMatrix(covariance) ||
    !Number.isFinite(minEigenvalue) ||
    !Number.isFinite(maxEigenvalue) ||
    minEigenvalue < ILL_CONDITIONING_RATIO * maxEigenvalue;
  return {
    graph,
    parameters,
    nodeIds,
    indexById,
    coefficientMatrix,
    propagationMatrix,
    errorCovariance,
    covariance,
    eigenvalues,
    illConditioned,
  };
}

export function covarianceAt(model: Pick<ScmModel, "indexById" | "covariance">, left: string, right: string): number {
  const leftIndex = model.indexById.get(left);
  const rightIndex = model.indexById.get(right);
  if (leftIndex === undefined || rightIndex === undefined) {
    throw new ScmParameterError("Covariance requested for a missing node.");
  }
  return model.covariance[leftIndex][rightIndex];
}

export function matrixTotalEffect(model: ScmModel, exposureId: string, outcomeId: string): number {
  nodeById(model.graph, exposureId);
  nodeById(model.graph, outcomeId);
  const exposureIndex = model.indexById.get(exposureId);
  const outcomeIndex = model.indexById.get(outcomeId);
  if (exposureIndex === undefined || outcomeIndex === undefined) {
    throw new ScmParameterError("Effect requested for a missing node.");
  }
  return model.propagationMatrix[outcomeIndex][exposureIndex];
}

export interface IntegrityAudit {
  covarianceTrek: Matrix;
  covarianceAgrees: boolean;
  totalEffectMatrix: number;
  totalEffectPaths: number;
  totalEffectAgrees: boolean;
  illConditioned: boolean;
  ok: boolean;
}

/** The deterministic self-audit used by production readouts. */
export function auditScmIntegrity(
  model: ScmModel,
  exposureId: string,
  outcomeId: string,
): IntegrityAudit {
  const coefficient: CoefficientLookup = (from, to) => edgeCoefficient(model.parameters, from, to);
  const covarianceTrek = trekCovarianceMatrix(
    model.graph,
    model.nodeIds,
    coefficient,
    (nodeId) => errorVariance(model.parameters, nodeId),
  );
  const totalEffectMatrix = matrixTotalEffect(model, exposureId, outcomeId);
  const totalEffectPaths = directedPathTotalEffect(
    model.graph,
    exposureId,
    outcomeId,
    coefficient,
  );
  const covarianceAgrees = matricesClose(model.covariance, covarianceTrek);
  const totalEffectAgrees = Math.abs(totalEffectMatrix - totalEffectPaths) <= 1e-9 * Math.max(1, Math.abs(totalEffectMatrix), Math.abs(totalEffectPaths));
  const ok = covarianceAgrees && totalEffectAgrees && !model.illConditioned;
  return {
    covarianceTrek,
    covarianceAgrees,
    totalEffectMatrix,
    totalEffectPaths,
    totalEffectAgrees,
    illConditioned: model.illConditioned,
    ok,
  };
}

export function assertScmIntegrity(
  model: ScmModel,
  exposureId: string,
  outcomeId: string,
): IntegrityAudit {
  const audit = auditScmIntegrity(model, exposureId, outcomeId);
  if (!audit.ok) {
    const causes = [
      !audit.covarianceAgrees ? "matrix and trek covariance disagree" : undefined,
      !audit.totalEffectAgrees ? "matrix and path total effects disagree" : undefined,
      audit.illConditioned ? "parameterization is ill-conditioned" : undefined,
    ]
      .filter(Boolean)
      .join("; ");
    throw new ScmIntegrityError(`Engine integrity check failed: ${causes}.`);
  }
  return audit;
}
