import type { Graph } from "@/engine/graph";

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => {
    return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[character]!;
  });
}

function positionOf(node: Graph["nodes"][number]): { x: number; y: number } {
  return node.position ?? { x: 120 + node.idx * 80, y: 220 };
}

export interface Point {
  x: number;
  y: number;
}
export interface EdgeShape {
  kind: Graph["nodes"][number]["kind"];
  radius?: number;
}
export interface TextExtent {
  width: number;
  ascent: number;
  descent: number;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function shapeDistance(point: Point, center: Point, shape: EdgeShape): number {
  const x = Math.abs(point.x - center.x),
    y = Math.abs(point.y - center.y),
    radius = shape.radius ?? 30;
  if (shape.kind !== "selection") return Math.hypot(x, y) - radius;
  const distance = distanceToSegment({ x, y }, { x: radius, y: 0 }, { x: 0, y: radius });
  return x + y <= radius ? -distance : distance;
}
function shapesOverlap(from: Point, to: Point, a: EdgeShape, b: EdgeShape): boolean {
  const ra = a.radius ?? 30,
    rb = b.radius ?? 30;
  if (a.kind !== "selection" && b.kind !== "selection")
    return Math.hypot(to.x - from.x, to.y - from.y) <= ra + rb;
  if (a.kind === "selection" && b.kind === "selection")
    return Math.abs(to.x - from.x) + Math.abs(to.y - from.y) <= ra + rb;
  return a.kind === "selection"
    ? shapeDistance(to, from, a) <= rb
    : shapeDistance(from, to, b) <= ra;
}

/** Ordered curve clipping uses the actual endpoint shape, including rounded gap corners. */
export function clipEdge(
  from: Point,
  to: Point,
  a: EdgeShape,
  b: EdgeShape,
  bend = 0,
): { start: Point; end: Point; control: Point; path: string } {
  if (shapesOverlap(from, to, a, b))
    throw new Error("Endpoint shapes overlap; separate the connected nodes before exporting.");
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const control = {
    x: (from.x + to.x) / 2 + ((from.y - to.y) / length) * bend,
    y: (from.y + to.y) / 2 + ((to.x - from.x) / length) * bend,
  };
  const point = (t: number): Point => ({
    x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t * t * to.x,
    y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t * t * to.y,
  });
  function crossing(center: Point, shape: EdgeShape, exit: boolean): number {
    let low = 0,
      high = 1;
    for (let i = 0; i < 60; i++) {
      const t = (low + high) / 2;
      if (shapeDistance(point(t), center, shape) < 2 === exit) low = t;
      else high = t;
    }
    return (low + high) / 2;
  }
  const t0 = crossing(from, a, true),
    t1 = crossing(to, b, false);
  if (t0 >= t1) throw new Error("No readable ordered edge remains; separate the connected nodes.");
  const start = point(t0),
    end = point(t1);
  const trimmedControl = {
    x: start.x + (t1 - t0) * ((1 - t0) * (control.x - from.x) + t0 * (to.x - control.x)),
    y: start.y + (t1 - t0) * ((1 - t0) * (control.y - from.y) + t0 * (to.y - control.y)),
  };
  return {
    start,
    end,
    control: trimmedControl,
    path: `M ${start.x} ${start.y} Q ${trimmedControl.x} ${trimmedControl.y} ${end.x} ${end.y}`,
  };
}

export function graphLayoutWarning(graph: Graph): string | null {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (!a || !b) continue;
    try {
      clipEdge(positionOf(a), positionOf(b), a, b);
    } catch {
      return `Separate ${a.name} and ${b.name}: their endpoint shapes overlap or leave no readable arrow.`;
    }
  }
  return null;
}

function measureLabel(text: string): TextExtent | undefined {
  if (typeof document === "undefined") return undefined;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("font-family", "system-ui, sans-serif");
  label.setAttribute("font-size", "14");
  label.setAttribute("font-weight", "700");
  label.textContent = text;
  svg.style.cssText = "position:absolute;visibility:hidden;left:-10000px;top:0";
  svg.append(label);
  document.body.append(svg);
  try {
    const box = label.getBBox();
    return { width: box.width, ascent: -box.y, descent: box.y + box.height };
  } finally {
    svg.remove();
  }
}

export function graphBounds(
  graph: Graph,
  textExtent: (text: string) => TextExtent | undefined = measureLabel,
): { x: number; y: number; width: number; height: number } {
  if (!graph.nodes.length) return { x: 0, y: 0, width: 640, height: 360 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const node of graph.nodes) {
    const point = positionOf(node),
      label = textExtent(node.name);
    const role = node.id === graph.roles.exposureId || node.id === graph.roles.outcomeId;
    minX = Math.min(minX, point.x - 32, point.x - (label?.width ?? 0) / 2);
    maxX = Math.max(
      maxX,
      point.x + 32,
      point.x + (label?.width ?? 0) / 2,
      role ? point.x + 34 : point.x + 32,
    );
    minY = Math.min(
      minY,
      point.y - 32,
      point.y + 5 - (label?.ascent ?? 0),
      role ? point.y - 40 : point.y - 32,
    );
    maxY = Math.max(maxY, point.y + 32, point.y + 5 + (label?.descent ?? 0));
  }
  return { x: minX - 24, y: minY - 24, width: maxX - minX + 48, height: maxY - minY + 48 };
}

/** Standalone, self-contained DAG SVG: no CSS variables or application runtime are required. */
export function graphToSvg(
  graph: Graph,
  textExtent?: (text: string) => TextExtent | undefined,
): string {
  const warning = graphLayoutWarning(graph);
  if (warning) throw new Error(warning);
  const positions = new Map(graph.nodes.map((node) => [node.id, positionOf(node)]));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const bounds = graphBounds(graph, textExtent);
  const edges = graph.edges
    .map((edge) => {
      const from = positions.get(edge.from),
        to = positions.get(edge.to);
      if (!from || !to) return "";
      const clipped = clipEdge(from, to, nodesById.get(edge.from)!, nodesById.get(edge.to)!);
      return `<line x1="${clipped.start.x}" y1="${clipped.start.y}" x2="${clipped.end.x}" y2="${clipped.end.y}" stroke="#24312d" stroke-width="2" marker-end="url(#arrow)" />`;
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" role="img" aria-label="Causal DAG"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 z" fill="#24312d" /></marker></defs><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#f5f1e8" />${edges}${nodes}</svg>`;
}
