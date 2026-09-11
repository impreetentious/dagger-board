import type { Graph } from "@/engine/graph";

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => {
    return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[character]!;
  });
}

function positionOf(node: Graph["nodes"][number]): { x: number; y: number } {
  return node.position ?? { x: 120 + node.idx * 80, y: 220 };
}

/** Standalone, self-contained DAG SVG: no CSS variables or application runtime are required. */
export function graphToSvg(graph: Graph): string {
  const positions = new Map(graph.nodes.map((node) => [node.id, positionOf(node)]));
  const points = [...positions.values()];
  const width = Math.max(640, ...points.map((point) => point.x + 100));
  const height = Math.max(360, ...points.map((point) => point.y + 100));
  const edges = graph.edges
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return "";
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#24312d" stroke-width="2" marker-end="url(#arrow)" />`;
    })
    .join("");
  const nodes = [...graph.nodes]
    .sort((left, right) => left.idx - right.idx)
    .map((node) => {
      const position = positions.get(node.id)!;
      const role =
        node.id === graph.roles.exposureId ? "X" : node.id === graph.roles.outcomeId ? "Y" : "";
      const shape =
        node.kind === "selection"
          ? `<polygon points="${position.x},${position.y - 30} ${position.x + 30},${position.y} ${position.x},${position.y + 30} ${position.x - 30},${position.y}" fill="#fffdf7" stroke="#24312d" stroke-width="2" />`
          : `<circle cx="${position.x}" cy="${position.y}" r="30" fill="#fffdf7" stroke="#24312d" stroke-width="2"${node.kind === "latent" ? ' stroke-dasharray="6 4"' : ""} />`;
      const badge = role
        ? `<circle cx="${position.x + 22}" cy="${position.y - 28}" r="11" fill="#8a4a20" /><text x="${position.x + 22}" y="${position.y - 24}" text-anchor="middle" font-size="10" font-weight="800" fill="#fffdf7">${role}</text>`
        : "";
      return `${shape}<text x="${position.x}" y="${position.y + 5}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#24312d">${escapeXml(node.name)}</text>${badge}`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Causal DAG"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#24312d" /></marker></defs><rect width="100%" height="100%" fill="#f5f1e8" />${edges}${nodes}</svg>`;
}
