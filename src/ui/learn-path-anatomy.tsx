import { useMemo } from "react";
import { enumerateSimplePaths } from "@/engine/paths";
import type { LabSnapshot } from "@/lib/codec";

const WIDTH = 720;
const HEIGHT = 340;

function pointsForDiamond(x: number, y: number, radius = 25): string {
  return `${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}`;
}

function positionsFor(snapshot: LabSnapshot): Map<string, { x: number; y: number }> {
  const nodes = [...snapshot.graph.nodes].sort((left, right) => left.idx - right.idx);
  const supplied = nodes
    .map((node) => node.position)
    .filter((position): position is { x: number; y: number } => position !== undefined);
  if (supplied.length === nodes.length) {
    const xs = supplied.map((position) => position.x);
    const ys = supplied.map((position) => position.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scaleX = maxX === minX ? 1 : (WIDTH - 120) / (maxX - minX);
    const scaleY = maxY === minY ? 1 : (HEIGHT - 100) / (maxY - minY);
    return new Map(
      nodes.map((node) => {
        const position = node.position!;
        return [
          node.id,
          { x: 60 + (position.x - minX) * scaleX, y: 50 + (position.y - minY) * scaleY },
        ];
      }),
    );
  }
  return new Map(
    nodes.map((node, index) => [
      node.id,
      { x: 80 + (index % 4) * 180, y: 90 + Math.floor(index / 4) * 150 },
    ]),
  );
}

/** A static, accessible diagram for the Learn reveal; it never changes lab state. */
export function LearnPathAnatomy({
  snapshot,
}: {
  snapshot: LabSnapshot;
}): React.JSX.Element | null {
  const exposureId = snapshot.graph.roles.exposureId;
  const outcomeId = snapshot.graph.roles.outcomeId;
  const path = useMemo(() => {
    if (!exposureId || !outcomeId) return [];
    return enumerateSimplePaths(snapshot.graph, exposureId, outcomeId)[0]?.nodeIds ?? [];
  }, [exposureId, outcomeId, snapshot.graph]);
  const positions = useMemo(() => positionsFor(snapshot), [snapshot]);
  if (path.length < 2) return null;

  const nodeById = new Map(snapshot.graph.nodes.map((node) => [node.id, node]));
  const highlightedPairs = new Set(
    path.slice(1).flatMap((nodeId, index) => {
      const prior = path[index]!;
      return [`${prior}\u0000${nodeId}`, `${nodeId}\u0000${prior}`];
    }),
  );
  const pathLabel = path.map((id) => nodeById.get(id)?.name ?? id).join(" → ");

  return (
    <figure
      className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--canvas)] p-3"
      data-testid="learn-path-anatomy-overlay"
    >
      <svg
        aria-label={`Path anatomy: ${pathLabel}`}
        className="h-auto w-full"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <defs>
          <marker
            id="learn-path-arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="7"
            refY="4"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--ink)" />
          </marker>
        </defs>
        {snapshot.graph.edges.map((edge) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const highlighted = highlightedPairs.has(`${edge.from}\u0000${edge.to}`);
          return (
            <line
              data-testid={highlighted ? "learn-path-edge" : undefined}
              key={`${edge.from}-${edge.to}`}
              markerEnd="url(#learn-path-arrow)"
              stroke={highlighted ? "var(--signal)" : "var(--ink)"}
              strokeOpacity={highlighted ? 1 : 0.45}
              strokeWidth={highlighted ? 4 : 1.5}
              x1={from.x}
              x2={to.x}
              y1={from.y}
              y2={to.y}
            />
          );
        })}
        {snapshot.graph.nodes.map((node) => {
          const position = positions.get(node.id)!;
          const highlighted = path.includes(node.id);
          const isRole = node.id === exposureId || node.id === outcomeId;
          return (
            <g key={node.id}>
              {node.kind === "selection" ? (
                <polygon
                  fill="var(--surface-raised)"
                  points={pointsForDiamond(position.x, position.y)}
                  stroke={highlighted ? "var(--signal)" : "var(--ink)"}
                  strokeWidth={highlighted ? 4 : 2}
                />
              ) : (
                <circle
                  cx={position.x}
                  cy={position.y}
                  fill="var(--surface-raised)"
                  r="25"
                  stroke={highlighted ? "var(--signal)" : "var(--ink)"}
                  strokeDasharray={node.kind === "latent" ? "6 4" : undefined}
                  strokeWidth={highlighted ? 4 : 2}
                />
              )}
              <text
                fill="var(--ink)"
                fontSize="13"
                fontWeight="700"
                textAnchor="middle"
                x={position.x}
                y={position.y + 5}
              >
                {node.name}
              </text>
              {isRole ? (
                <text
                  fill="var(--signal)"
                  fontSize="11"
                  fontWeight="800"
                  textAnchor="middle"
                  x={position.x}
                  y={position.y + 44}
                >
                  {node.id === exposureId ? "EXPOSURE" : "OUTCOME"}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-xs leading-5 text-[var(--muted)]">
        Highlighted path: <strong className="text-[var(--ink)]">{pathLabel}</strong>
      </figcaption>
    </figure>
  );
}
