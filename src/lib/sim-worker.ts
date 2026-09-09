/// <reference lib="webworker" />

import { buildScmModel } from "@/engine/scm";
import { generateSimulationDataAsync } from "@/engine/sim";
import type { SimWorkerRunMessage, SimWorkerOutgoing } from "@/lib/sim-worker-messages";

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = async (event: MessageEvent<SimWorkerRunMessage>) => {
  const message = event.data;
  if (!message || message.kind !== "run") return;
  try {
    const model = buildScmModel(message.graph, message.parameters);
    const data = await generateSimulationDataAsync(
      model,
      message.options,
      message.chunkSize ?? 8192,
    );
    const columns: Record<string, ArrayBuffer> = {};
    const transfers: ArrayBuffer[] = [];
    for (const nodeId of data.nodeIds) {
      const column = data.columns.get(nodeId);
      if (!column) throw new Error(`Simulation column missing for ${nodeId}.`);
      const buffer = column.buffer.slice(0) as ArrayBuffer;
      columns[nodeId] = buffer;
      transfers.push(buffer);
    }
    const keptBuffer = data.keptRowIndices.buffer.slice(0) as ArrayBuffer;
    transfers.push(keptBuffer);
    const response: SimWorkerOutgoing = {
      kind: "done",
      requestId: message.requestId,
      nodeIds: [...data.nodeIds],
      columns,
      keptRowIndices: keptBuffer,
      generatedCount: data.generatedCount,
      selection: message.options.selection,
    };
    worker.postMessage(response, transfers);
  } catch (error) {
    const response: SimWorkerOutgoing = {
      kind: "error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : "Simulation worker failed.",
    };
    worker.postMessage(response);
  }
};

export {};
