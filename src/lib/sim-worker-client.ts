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
const pendingRejects = new Set<(reason: Error) => void>();

/**
 * A worker that fails to load or dies mid-run never posts a message, so without
 * this the run promise stays pending forever and the Simulate button is stuck on
 * "Running…" — and because the worker is shared, every later run inherits the
 * dead instance. Failing loudly and dropping the worker lets the next run retry.
 */
function failWorker(message: string): void {
  sharedWorker?.terminate();
  sharedWorker = null;
  const waiting = [...pendingRejects];
  pendingRejects.clear();
  for (const reject of waiting) reject(new Error(message));
}

function ensureWorker(): Worker {
  if (typeof Worker === "undefined") {
    throw new Error("Web workers are not available in this environment.");
  }
  if (sharedWorker) return sharedWorker;
  const worker = new Worker(new URL("./sim-worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("error", (event) => {
    failWorker(event.message || "The simulation worker failed to start.");
  });
  worker.addEventListener("messageerror", () => {
    failWorker("The simulation worker returned an unreadable message.");
  });
  sharedWorker = worker;
  return worker;
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
 * Off-main-thread simulation. The pure-engine kernel in
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
    const settle = (finish: () => void) => {
      worker.removeEventListener("message", listener);
      pendingRejects.delete(abandon);
      finish();
    };
    const abandon = (reason: Error) => {
      worker.removeEventListener("message", listener);
      reject(reason);
    };
    const listener = (event: MessageEvent<SimWorkerOutgoing>) => {
      const message = event.data;
      if (!message || message.requestId !== requestId) return;
      if (message.kind === "error") {
        settle(() => reject(new Error(message.message)));
        return;
      }
      settle(() => {
        try {
          const model = buildScmModel(graph, parameters);
          assertScmIntegrity(model, exposureId, outcomeId);
          resolve(reconstruct(model, message));
        } catch (cause) {
          reject(cause instanceof Error ? cause : new Error("Failed to reconstruct simulation."));
        }
      });
    };
    pendingRejects.add(abandon);
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
