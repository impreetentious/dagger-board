import type { Graph } from "@/engine/graph";
import type { SCMParameters } from "@/engine/scm";
import type { SimulationOptions } from "@/engine/sim";

/**
 * Wire types for the simulation Web Worker. The main thread
 * ships the graph + parameters + options; the worker returns generated node
 * columns (transferable `ArrayBuffer`s) and the kept-row indices. The main
 * thread rebuilds the ScmModel and computes sample moments locally so the
 * worker never has to serialize the model matrices.
 */

export interface SimWorkerRunMessage {
  kind: "run";
  requestId: string;
  graph: Graph;
  parameters: SCMParameters;
  exposureId: string;
  outcomeId: string;
  options: SimulationOptions;
  chunkSize?: number;
}

export interface SimWorkerDoneMessage {
  kind: "done";
  requestId: string;
  nodeIds: string[];
  columns: Record<string, ArrayBuffer>;
  keptRowIndices: ArrayBuffer;
  generatedCount: number;
  selection: SimulationOptions["selection"];
}

interface SimWorkerErrorMessage {
  kind: "error";
  requestId: string;
  message: string;
}

export type SimWorkerOutgoing = SimWorkerDoneMessage | SimWorkerErrorMessage;
