import * as z from "zod/mini";
import { GraphSchema, validateGraph, type Graph } from "@/engine/graph";
import { normalizeScmParameters, SCMParametersSchema, type SCMParameters } from "@/engine/scm";

export const URL_FRAGMENT_LIMIT = 2000;

const SelectionSchema = z.object({
  nodeId: z.string().check(z.minLength(1)),
  quantile: z.number().check(z.gte(0.01), z.lte(0.99)),
});

const LabSnapshotWireSchema = z.object({
  v: z.literal(1),
  graph: GraphSchema,
  parameters: z.optional(SCMParametersSchema),
  conditioning: z._default(z.array(z.string()), []),
  selection: z.optional(z.nullable(SelectionSchema)),
  measured: z._default(z.record(z.string(), z.boolean()), {}),
  seed: z._default(z.number().check(z.int(), z.gte(0), z.lte(0xffff_ffff)), 314159),
  n: z._default(z.number().check(z.int(), z.gte(100), z.lte(1_000_000)), 10_000),
});

export interface LabSnapshot {
  v: 1;
  graph: Graph;
  parameters: SCMParameters;
  conditioning: string[];
  selection: { nodeId: string; quantile: number } | null;
  measured: Record<string, boolean>;
  seed: number;
  n: number;
}

function sortedIds(graph: Graph, ids: Iterable<string>): string[] {
  const indexById = new Map(graph.nodes.map((node) => [node.id, node.idx]));
  return [...new Set(ids)].sort(
    (left, right) => (indexById.get(left) ?? 0) - (indexById.get(right) ?? 0),
  );
}

/**
 * IO boundaries are forgiving about stale references: dropped nodes are pruned
 * and invalid selection/conditioning memberships disappear before UI state sees
 * them. Structural graph errors remain Zod errors.
 */
export function pruneLabSnapshot(input: unknown): LabSnapshot {
  const wire = LabSnapshotWireSchema.parse(input);
  const graph = validateGraph(wire.graph);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const allowedConditioning = wire.conditioning.filter((id) => {
    const node = nodeById.get(id);
    return (
      node?.kind === "observed" && id !== graph.roles.exposureId && id !== graph.roles.outcomeId
    );
  });
  const knownEdgeKeys = new Set(graph.edges.map((edge) => `${edge.from}\u0000${edge.to}`));
  const rawParameters = wire.parameters ?? { v: 1, edgeCoefficients: {}, errorSds: {} };
  const parameters = normalizeScmParameters(graph, {
    ...rawParameters,
    edgeCoefficients: Object.fromEntries(
      Object.entries(rawParameters.edgeCoefficients).filter(([key]) => knownEdgeKeys.has(key)),
    ),
    errorSds: Object.fromEntries(
      Object.entries(rawParameters.errorSds).filter(([id]) => nodeById.has(id)),
    ),
  });
  const measured = Object.fromEntries(
    graph.nodes
      .filter((node) => node.kind === "observed")
      .map((node) => [
        node.id,
        node.id === graph.roles.exposureId || node.id === graph.roles.outcomeId
          ? true
          : (wire.measured[node.id] ?? true),
      ]),
  );
  const selectedNode = wire.selection ? nodeById.get(wire.selection.nodeId) : undefined;
  return {
    v: 1,
    graph,
    parameters,
    conditioning: sortedIds(graph, allowedConditioning),
    selection: selectedNode?.kind === "selection" ? (wire.selection ?? null) : null,
    measured,
    seed: wire.seed,
    n: wire.n,
  };
}

export function canonicalizeSnapshot(snapshot: LabSnapshot): LabSnapshot {
  return pruneLabSnapshot(snapshot);
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortObject(child)]),
    );
  }
  return value;
}

export function snapshotJson(snapshot: LabSnapshot): string {
  return JSON.stringify(sortObject(canonicalizeSnapshot(snapshot)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function bytesFromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function streamBytes(
  bytes: Uint8Array,
  mode: "compress" | "decompress",
): Promise<Uint8Array> {
  const Stream = mode === "compress" ? CompressionStream : DecompressionStream;
  if (!Stream) throw new Error("This browser cannot encode a compressed graph fragment.");
  const stream = new Stream("deflate-raw");
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  // Write and read CONCURRENTLY. Awaiting write()+close() *before* draining the
  // readable deadlocks in browsers: the transform applies backpressure and the
  // writer never settles because nothing is consuming the output. (Node's
  // streams don't block on this, which is why the unit tests passed while the
  // browser hung forever — leaving encodeGraphFragment permanently pending.)
  const writer = stream.writable.getWriter();
  const pump = writer.write(copy as unknown as BufferSource).then(() => writer.close());
  const output = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  await pump;
  return output;
}

export async function encodeGraphFragment(snapshot: LabSnapshot): Promise<string> {
  const encoded = new TextEncoder().encode(snapshotJson(snapshot));
  const compressed = await streamBytes(encoded, "compress");
  return `#g=${base64Url(compressed)}`;
}

export async function decodeGraphFragment(fragment: string): Promise<LabSnapshot> {
  const payload = fragment.startsWith("#g=") ? fragment.slice(3) : "";
  if (!payload) throw new Error("This URL does not contain a graph fragment.");
  const compressed = bytesFromBase64Url(payload);
  const json = new TextDecoder().decode(await streamBytes(compressed, "decompress"));
  return pruneLabSnapshot(JSON.parse(json));
}

export async function graphFragmentStatus(snapshot: LabSnapshot): Promise<{
  fragment: string;
  shareable: boolean;
}> {
  const fragment = await encodeGraphFragment(snapshot);
  return { fragment, shareable: fragment.length <= URL_FRAGMENT_LIMIT };
}
