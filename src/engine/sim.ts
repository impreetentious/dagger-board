import { z } from "zod";
import { parentsOf } from "@/engine/graph";
import {
  assertScmIntegrity,
  buildScmModel,
  edgeCoefficient,
  type SCMParameters,
  type ScmModel,
} from "@/engine/scm";
import {
  ivEstimand,
  olsEstimand,
  type CovarianceContext,
  type IvEstimate,
  type OlsEstimate,
} from "@/engine/stats";
import { truncateCovariance, type SelectionRule, type TruncationResult } from "@/engine/truncation";
import { createNormalPairGenerator } from "@/lib/rng";

export const SimulationOptionsSchema = z.object({
  seed: z.number().int().min(0).max(0xffff_ffff),
  n: z.number().int().min(100).max(1_000_000),
  selection: z
    .object({ nodeId: z.string().min(1), quantile: z.number().min(0.01).max(0.99) })
    .optional(),
});

export type SimulationOptions = z.infer<typeof SimulationOptionsSchema>;

export interface SimulationData {
  nodeIds: string[];
  indexById: Map<string, number>;
  columns: Map<string, Float64Array>;
  generatedCount: number;
  keptRowIndices: Uint32Array;
  selection: SelectionRule | undefined;
}

export interface SampleMoments extends CovarianceContext {
  sampleSize: number;
  means: number[];
}

export type SimulationEstimatorRequest =
  | {
      kind: "ols";
      exposureId: string;
      outcomeId: string;
      conditionedIds: string[];
      totalEffect: number;
    }
  | {
      kind: "iv";
      exposureId: string;
      outcomeId: string;
      instrumentId: string;
      conditionedIds: string[];
      totalEffect: number;
    };

export interface ConvergencePoint {
  generatedRows: number;
  keptRows: number;
  estimate: number | null;
}

export interface SimulationRun {
  model: ScmModel;
  data: SimulationData;
  sample: SampleMoments;
  truncation: TruncationResult | undefined;
}

function parentEntries(
  model: ScmModel,
  nodeId: string,
): Array<{ id: string; coefficient: number }> {
  return parentsOf(model.graph, nodeId)
    .sort((left, right) => (model.indexById.get(left) ?? 0) - (model.indexById.get(right) ?? 0))
    .map((id) => ({ id, coefficient: edgeCoefficient(model.parameters, id, nodeId) }));
}

function fillNodeColumn(
  model: ScmModel,
  nodeId: string,
  columns: Map<string, Float64Array>,
  normalPair: () => { first: number; second: number },
  start: number,
  end: number,
): void {
  const nodeColumn = columns.get(nodeId);
  if (!nodeColumn) throw new Error(`Missing simulation column for ${nodeId}.`);
  const parents = parentEntries(model, nodeId).map((parent) => ({
    ...parent,
    column: columns.get(parent.id),
  }));
  if (parents.some((parent) => !parent.column))
    throw new Error("Parent simulation order is invalid.");
  const errorSd = model.parameters.errorSds[nodeId];
  for (let row = start; row < end; row += 2) {
    const pair = normalPair();
    let first = pair.first * errorSd;
    let second = pair.second * errorSd;
    for (const parent of parents) {
      const column = parent.column;
      if (!column) continue;
      first += parent.coefficient * column[row];
      if (row + 1 < end) second += parent.coefficient * column[row + 1];
    }
    nodeColumn[row] = first;
    if (row + 1 < end) nodeColumn[row + 1] = second;
  }
}

function createColumns(model: ScmModel, count: number): Map<string, Float64Array> {
  return new Map(model.nodeIds.map((id) => [id, new Float64Array(count)]));
}

function selectedRowIndices(
  model: ScmModel,
  columns: Map<string, Float64Array>,
  count: number,
  selection: SelectionRule | undefined,
): { indices: Uint32Array; truncation: TruncationResult | undefined } {
  if (!selection) {
    const indices = new Uint32Array(count);
    for (let index = 0; index < count; index += 1) indices[index] = index;
    return { indices, truncation: undefined };
  }
  const truncation = truncateCovariance(model, selection);
  const selectionColumn = columns.get(selection.nodeId);
  if (!selectionColumn) throw new Error("Selection column is missing.");
  const kept: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (selectionColumn[index] > truncation.threshold) kept.push(index);
  }
  return { indices: Uint32Array.from(kept), truncation };
}

/** Synchronous deterministic generation for tests and short product runs. */
export function generateSimulationData(
  model: ScmModel,
  options: SimulationOptions,
): SimulationData {
  const parsed = SimulationOptionsSchema.parse(options);
  const columns = createColumns(model, parsed.n);
  const normalPair = createNormalPairGenerator(parsed.seed);
  for (const nodeId of model.nodeIds) {
    fillNodeColumn(model, nodeId, columns, normalPair, 0, parsed.n);
  }
  const selected = selectedRowIndices(model, columns, parsed.n, parsed.selection);
  return {
    nodeIds: [...model.nodeIds],
    indexById: new Map(model.indexById),
    columns,
    generatedCount: parsed.n,
    keptRowIndices: selected.indices,
    selection: parsed.selection,
  };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Chunked generation preserves the same stream/order as the synchronous path. */
export async function generateSimulationDataAsync(
  model: ScmModel,
  options: SimulationOptions,
  chunkSize = 8192,
): Promise<SimulationData> {
  const parsed = SimulationOptionsSchema.parse(options);
  const normalizedChunk = Math.max(2, Math.floor(chunkSize / 2) * 2);
  const columns = createColumns(model, parsed.n);
  const normalPair = createNormalPairGenerator(parsed.seed);
  for (const nodeId of model.nodeIds) {
    for (let start = 0; start < parsed.n; start += normalizedChunk) {
      const end = Math.min(parsed.n, start + normalizedChunk);
      fillNodeColumn(model, nodeId, columns, normalPair, start, end);
      await yieldToEventLoop();
    }
  }
  const selected = selectedRowIndices(model, columns, parsed.n, parsed.selection);
  return {
    nodeIds: [...model.nodeIds],
    indexById: new Map(model.indexById),
    columns,
    generatedCount: parsed.n,
    keptRowIndices: selected.indices,
    selection: parsed.selection,
  };
}

/** Two-pass demeaning covariance. Prefixes are defined in generated-row order. */
export function sampleMoments(
  data: SimulationData,
  generatedRows = data.generatedCount,
): SampleMoments {
  const limit = Math.min(Math.max(0, generatedRows), data.generatedCount);
  const indices: number[] = [];
  for (const row of data.keptRowIndices) {
    if (row >= limit) break;
    indices.push(row);
  }
  const means = Array<number>(data.nodeIds.length).fill(0);
  for (const row of indices) {
    for (let column = 0; column < data.nodeIds.length; column += 1) {
      const values = data.columns.get(data.nodeIds[column]);
      if (!values) throw new Error("Missing simulation column.");
      means[column] += values[row];
    }
  }
  if (indices.length > 0) {
    for (let column = 0; column < means.length; column += 1) means[column] /= indices.length;
  }
  const covariance = Array.from({ length: data.nodeIds.length }, () =>
    Array<number>(data.nodeIds.length).fill(Number.NaN),
  );
  if (indices.length > 0) {
    for (let left = 0; left < data.nodeIds.length; left += 1) {
      const leftValues = data.columns.get(data.nodeIds[left]);
      if (!leftValues) throw new Error("Missing simulation column.");
      for (let right = left; right < data.nodeIds.length; right += 1) {
        const rightValues = data.columns.get(data.nodeIds[right]);
        if (!rightValues) throw new Error("Missing simulation column.");
        let sum = 0;
        for (const row of indices)
          sum += (leftValues[row] - means[left]) * (rightValues[row] - means[right]);
        const value = sum / indices.length;
        covariance[left][right] = value;
        covariance[right][left] = value;
      }
    }
  }
  return { covariance, indexById: new Map(data.indexById), sampleSize: indices.length, means };
}

export function logSpacedCheckpoints(generatedCount: number): number[] {
  const checkpoints = new Set<number>();
  for (let exponent = 2; ; exponent += 0.5) {
    const checkpoint = Math.round(10 ** exponent);
    if (checkpoint >= generatedCount) break;
    checkpoints.add(checkpoint);
  }
  checkpoints.add(generatedCount);
  return [...checkpoints].sort((left, right) => left - right);
}

function simulatedEstimate(
  request: SimulationEstimatorRequest,
  moments: SampleMoments,
): OlsEstimate | IvEstimate | null {
  if (moments.sampleSize < 50) return null;
  if (request.kind === "ols") {
    return olsEstimand(
      moments,
      request.exposureId,
      request.outcomeId,
      request.conditionedIds,
      request.totalEffect,
    );
  }
  return ivEstimand(
    moments,
    request.instrumentId,
    request.exposureId,
    request.outcomeId,
    request.conditionedIds,
    request.totalEffect,
  );
}

export function convergenceSeries(
  data: SimulationData,
  request: SimulationEstimatorRequest,
): ConvergencePoint[] {
  return logSpacedCheckpoints(data.generatedCount).map((generatedRows) => {
    const moments = sampleMoments(data, generatedRows);
    const result = simulatedEstimate(request, moments);
    const estimate =
      result === null ? null : "status" in result ? result.estimand : result.estimand;
    return { generatedRows, keptRows: moments.sampleSize, estimate };
  });
}

export function runSimulation(
  graph: ScmModel["graph"],
  parameters: SCMParameters,
  exposureId: string,
  outcomeId: string,
  options: SimulationOptions,
): SimulationRun {
  const model = buildScmModel(graph, parameters);
  assertScmIntegrity(model, exposureId, outcomeId);
  const data = generateSimulationData(model, options);
  const sample = sampleMoments(data);
  const truncation = options.selection ? truncateCovariance(model, options.selection) : undefined;
  return { model, data, sample, truncation };
}

export async function runSimulationAsync(
  graph: ScmModel["graph"],
  parameters: SCMParameters,
  exposureId: string,
  outcomeId: string,
  options: SimulationOptions,
  chunkSize = 8192,
): Promise<SimulationRun> {
  const model = buildScmModel(graph, parameters);
  assertScmIntegrity(model, exposureId, outcomeId);
  const data = await generateSimulationDataAsync(model, options, chunkSize);
  const sample = sampleMoments(data);
  const truncation = options.selection ? truncateCovariance(model, options.selection) : undefined;
  return { model, data, sample, truncation };
}
