import type { Graph } from "@/engine/graph";
import { assertScmIntegrity, buildScmModel, type SCMParameters } from "@/engine/scm";
import { sampleMoments, type SimulationOptions, type SimulationRun } from "@/engine/sim";
import { truncateCovariance } from "@/engine/truncation";
import type {
  SimWorkerDoneMessage,
  SimWorkerOutgoing,
  SimWorkerRunMessage,
} from "@/lib/sim-worker-messages";

let sharedWorker: Worker | null = null;

function ensureWorker(): Worker {
  if (typeof Worker === "undefined") {
    throw new Error("Web workers are not available in this environment.");
  }
  if (sharedWorker) return sharedWorker;
  sharedWorker = new Worker(new URL("./sim-worker.ts", import.meta.url), { type: "module" });
  return sharedWorker;
}

function reconstruct(
  model: ReturnType<typeof buildScmModel>,
  message: SimWorkerDoneMessage,
): SimulationRun {
  const indexById = new Map(message.nodeIds.map((id, index) => [id, index]));
  const columns = new Map(message.nodeIds.map((id) => [id, new Float64Array(message.columns[id])]));
  const keptRowIndices = new Uint32Array(message.keptRowIndices);
  const data = {
    nodeIds: [...message.nodeIds],
    indexById,
    columns,
    generatedCount: message.generatedCount,
    keptRowIndices,
    selection: message.selection,
  };
  const sample = sampleMoments(data);
  const truncation = message.selection ? truncateCovariance(model, message.selection) : undefined;
  return { model, data, sample, truncation };
}

/**
 * Off-main-thread simulation (item 8 of §2.6). The pure-engine kernel in
 * `src/engine/sim.ts` stays untouched; the worker owns Float64Array
 * generation and transfers the buffers back so the main thread never blocks
 * on RNG work. Falls back to the direct async path if `Worker` is missing
 * (e.g., during Node-side tests) so callers get one integration surface.
 */
export function runSimulationInWorker(
  graph: Graph,
  parameters: SCMParameters,
  exposureId: string,
  outcomeId: string,
  options: SimulationOptions,
  chunkSize = 8192,
): Promise<SimulationRun> {
  if (typeof Worker === "undefined") {
    return import("@/engine/sim").then((module) =>
      module.runSimulationAsync(graph, parameters, exposureId, outcomeId, options, chunkSize),
    );
  }
  return new Promise((resolve, reject) => {
    const worker = ensureWorker();
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const listener = (event: MessageEvent<SimWorkerOutgoing>) => {
      const message = event.data;
      if (!message || message.requestId !== requestId) return;
      worker.removeEventListener("message", listener);
      if (message.kind === "error") {
        reject(new Error(message.message));
        return;
      }
      try {
        const model = buildScmModel(graph, parameters);
        assertScmIntegrity(model, exposureId, outcomeId);
        resolve(reconstruct(model, message));
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error("Failed to reconstruct simulation."));
      }
    };
    worker.addEventListener("message", listener);
    const request: SimWorkerRunMessage = {
      kind: "run",
      requestId,
      graph,
      parameters,
      exposureId,
      outcomeId,
      options,
      chunkSize,
    };
    worker.postMessage(request);
  });
}
