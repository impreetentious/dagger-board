import { parentsOf, topologicalOrder, validateGraph, type Graph } from "@/engine/graph";

/**
 * Assist-only layout: longest-path layers followed by a parent barycenter sort.
 * It writes positions but never changes graph structure or forces a future edit.
 */
export function assistedLayout(graph: Graph): Graph {
  const order = topologicalOrder(graph);
  const layerById = new Map<string, number>();
  for (const id of order) {
    const parentLayers = parentsOf(graph, id).map((parent) => layerById.get(parent) ?? 0);
    layerById.set(id, parentLayers.length === 0 ? 0 : Math.max(...parentLayers) + 1);
  }
  const groups = new Map<number, string[]>();
  for (const id of order) {
    const layer = layerById.get(id) ?? 0;
    groups.set(layer, [...(groups.get(layer) ?? []), id]);
  }
  const rowById = new Map<string, number>();
  for (const [layer, ids] of [...groups.entries()].sort(([left], [right]) => left - right)) {
    ids.sort((left, right) => {
      const leftParents = parentsOf(graph, left).map((id) => rowById.get(id) ?? 0);
      const rightParents = parentsOf(graph, right).map((id) => rowById.get(id) ?? 0);
      const leftCenter = leftParents.length
        ? leftParents.reduce((sum, row) => sum + row, 0) / leftParents.length
        : 0;
      const rightCenter = rightParents.length
        ? rightParents.reduce((sum, row) => sum + row, 0) / rightParents.length
        : 0;
      if (leftCenter !== rightCenter) return leftCenter - rightCenter;
      return (
        (graph.nodes.find((node) => node.id === left)?.idx ?? 0) -
        (graph.nodes.find((node) => node.id === right)?.idx ?? 0)
      );
    });
    ids.forEach((id, row) => rowById.set(id, row));
    groups.set(layer, ids);
  }
  return validateGraph({
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: {
        x: 130 + (layerById.get(node.id) ?? 0) * 190,
        y: 130 + (rowById.get(node.id) ?? 0) * 125,
      },
    })),
  });
}
