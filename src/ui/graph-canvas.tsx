"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { useLabStore } from "@/store/lab-store";

interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  id: string;
  x: number;
  y: number;
}

function diamondPoints(x: number, y: number, radius: number): string {
  return `${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}`;
}

function curvePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bend: number,
): string {
  const middleX = (from.x + to.x) / 2;
  const middleY = (from.y + to.y) / 2;
  const length = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
  const controlX = middleX + ((from.y - to.y) / length) * bend;
  const controlY = middleY + ((to.x - from.x) / length) * bend;
  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}

export function GraphCanvas() {
  const graph = useLabStore((state) => state.graph);
  const selectedNodeId = useLabStore((state) => state.selectedNodeId);
  const edgeStartId = useLabStore((state) => state.edgeStartId);
  const selectNode = useLabStore((state) => state.selectNode);
  const moveNode = useLabStore((state) => state.moveNode);
  const addNode = useLabStore((state) => state.addNode);
  const assignRole = useLabStore((state) => state.assignRole);
  const setNodeKind = useLabStore((state) => state.setNodeKind);
  const deleteNode = useLabStore((state) => state.deleteNode);
  const startEdge = useLabStore((state) => state.startEdge);
  const completeEdge = useLabStore((state) => state.completeEdge);
  const undo = useLabStore((state) => state.undo);
  const redo = useLabStore((state) => state.redo);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, width: 800, height: 520 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number; viewport: Viewport } | null>(
    null,
  );
  const [showHelp, setShowHelp] = useState(false);

  const pointFor = (event: PointerEvent<SVGSVGElement | SVGGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const ordered = [...graph.nodes].sort((left, right) => left.idx - right.idx);
  const focusNode = (id: string) => {
    selectNode(id);
    requestAnimationFrame(() =>
      document.querySelector<SVGGElement>(`[data-node-id="${id}"]`)?.focus(),
    );
  };
  const advanceFocus = (direction: number) => {
    if (ordered.length === 0) return;
    const currentIndex = Math.max(
      0,
      ordered.findIndex((node) => node.id === selectedNodeId),
    );
    const next = ordered[(currentIndex + direction + ordered.length) % ordered.length];
    focusNode(next.id);
  };

  const handleKey = (event: KeyboardEvent<SVGSVGElement | SVGGElement>) => {
    const activeId = selectedNodeId;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (key === "?") {
      event.preventDefault();
      setShowHelp((visible) => !visible);
      return;
    }
    if (key === "n") {
      event.preventDefault();
      addNode();
      requestAnimationFrame(() => {
        const newest = useLabStore.getState().selectedNodeId;
        if (newest) focusNode(newest);
      });
      return;
    }
    if (!activeId) return;
    if (event.altKey && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
      event.preventDefault();
      const delta = {
        arrowleft: [-8, 0],
        arrowright: [8, 0],
        arrowup: [0, -8],
        arrowdown: [0, 8],
      }[key] ?? [0, 0];
      moveNode(activeId, delta[0], delta[1]);
      return;
    }
    if (["arrowleft", "arrowup"].includes(key)) {
      event.preventDefault();
      advanceFocus(-1);
      return;
    }
    if (["arrowright", "arrowdown", "tab"].includes(key)) {
      event.preventDefault();
      advanceFocus(key === "tab" && event.shiftKey ? -1 : 1);
      return;
    }
    if (key === "e") {
      event.preventDefault();
      startEdge(activeId);
      return;
    }
    if (key === "enter" && edgeStartId && edgeStartId !== activeId) {
      event.preventDefault();
      completeEdge(activeId);
      return;
    }
    if (key === "x") {
      event.preventDefault();
      assignRole("exposureId", activeId);
      return;
    }
    if (key === "y") {
      event.preventDefault();
      assignRole("outcomeId", activeId);
      return;
    }
    if (key === "l") {
      event.preventDefault();
      setNodeKind(activeId, "latent");
      return;
    }
    if (key === "s") {
      event.preventDefault();
      setNodeKind(activeId, "selection");
      return;
    }
    if (key === "delete" || key === "backspace") {
      event.preventDefault();
      deleteNode(activeId);
    }
  };

  const onNodePointerDown = (event: PointerEvent<SVGGElement>, id: string) => {
    event.stopPropagation();
    const point = pointFor(event);
    if (edgeStartId && edgeStartId !== id) {
      completeEdge(id);
      return;
    }
    focusNode(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id, ...point });
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const point = pointFor(event);
    if (drag) {
      moveNode(drag.id, point.x - drag.x, point.y - drag.y);
      setDrag({ ...drag, ...point });
    } else if (panStart) {
      setViewport({
        ...panStart.viewport,
        x: panStart.viewport.x - (point.x - panStart.x),
        y: panStart.viewport.y - (point.y - panStart.y),
      });
    }
  };

  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.12 : 0.88;
    const point = pointFor(event as unknown as PointerEvent<SVGSVGElement>);
    const width = Math.min(1500, Math.max(320, viewport.width * factor));
    const height = (width / viewport.width) * viewport.height;
    setViewport({
      width,
      height,
      x: point.x - ((point.x - viewport.x) * width) / viewport.width,
      y: point.y - ((point.y - viewport.y) * height) / viewport.height,
    });
  };

  const positions = new Map(
    graph.nodes.map((node) => [node.id, node.position ?? { x: 120 + node.idx * 80, y: 220 }]),
  );

  return (
    <div className="relative min-h-[31rem] overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--canvas)]">
      <svg
        aria-describedby="canvas-help"
        aria-label="Causal graph editor"
        className="h-[31rem] w-full touch-none"
        onKeyDown={handleKey}
        onPointerDown={(event) => {
          const point = pointFor(event);
          selectNode(null);
          event.currentTarget.setPointerCapture(event.pointerId);
          setPanStart({ ...point, viewport });
        }}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          setDrag(null);
          setPanStart(null);
        }}
        onWheel={onWheel}
        ref={svgRef}
        role="graphics-document document"
        tabIndex={0}
        viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
      >
        <defs>
          <pattern height="32" id="field-grid" patternUnits="userSpaceOnUse" width="32">
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="var(--line)"
              strokeOpacity="0.55"
              strokeWidth="1"
            />
          </pattern>
          <marker
            id="causal-arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="7"
            refY="4"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--ink)" />
          </marker>
        </defs>
        <rect
          fill="url(#field-grid)"
          height="100%"
          role="presentation"
          width="100%"
          x={viewport.x}
          y={viewport.y}
        />
        <g aria-hidden="true" role="presentation">
          {graph.edges.map((edge, index) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const isConnected = edge.from === selectedNodeId || edge.to === selectedNodeId;
            return (
              <path
                d={curvePath(from, to, index % 2 === 0 ? 12 : -12)}
                fill="none"
                key={`${edge.from}-${edge.to}`}
                markerEnd="url(#causal-arrow)"
                stroke={isConnected ? "var(--signal)" : "var(--ink)"}
                strokeOpacity={isConnected ? 0.95 : 0.62}
                strokeWidth={isConnected ? 2.6 : 1.7}
              />
            );
          })}
        </g>
        {ordered.map((node) => {
          const position = positions.get(node.id)!;
          const isSelected = selectedNodeId === node.id;
          const isEdgeSource = edgeStartId === node.id;
          const role =
            node.id === graph.roles.exposureId
              ? "X"
              : node.id === graph.roles.outcomeId
                ? "Y"
                : null;
          const label = `${node.name}, ${node.kind}${role ? `, ${role === "X" ? "exposure" : "outcome"}` : ""}`;
          return (
            <g
              aria-label={label}
              aria-roledescription="causal node"
              className="cursor-grab outline-none active:cursor-grabbing"
              data-node-id={node.id}
              key={node.id}
              onFocus={() => selectNode(node.id)}
              onKeyDown={handleKey}
              onPointerDown={(event) => onNodePointerDown(event, node.id)}
              role="graphics-symbol img"
              tabIndex={isSelected || (!selectedNodeId && node.idx === ordered[0]?.idx) ? 0 : -1}
            >
              {node.kind === "selection" ? (
                <>
                  <polygon
                    fill="var(--surface-raised)"
                    points={diamondPoints(position.x, position.y, 31)}
                    stroke="var(--ink)"
                    strokeWidth="2"
                  />
                  <polygon
                    fill="none"
                    points={diamondPoints(position.x, position.y, 23)}
                    stroke="var(--moss)"
                    strokeWidth="1.5"
                  />
                </>
              ) : (
                <circle
                  cx={position.x}
                  cy={position.y}
                  fill="var(--surface-raised)"
                  r="30"
                  stroke="var(--ink)"
                  strokeDasharray={node.kind === "latent" ? "6 4" : undefined}
                  strokeWidth="2"
                />
              )}
              {isSelected || isEdgeSource ? (
                <circle
                  cx={position.x}
                  cy={position.y}
                  fill="none"
                  r="38"
                  stroke="var(--signal)"
                  strokeWidth="2.5"
                />
              ) : null}
              <text
                fill="var(--ink)"
                fontSize="14"
                fontWeight="700"
                textAnchor="middle"
                x={position.x}
                y={position.y + 5}
              >
                {node.name}
              </text>
              {role ? (
                <g transform={`translate(${position.x + 22} ${position.y - 28})`}>
                  <circle cx="0" cy="0" fill="var(--signal)" r="11" />
                  <text
                    fill="var(--surface)"
                    fontSize="10"
                    fontWeight="800"
                    textAnchor="middle"
                    x="0"
                    y="3.5"
                  >
                    {role}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
        {graph.nodes.length === 0 ? (
          <text
            fill="var(--muted)"
            fontSize="17"
            textAnchor="middle"
            x={viewport.x + viewport.width / 2}
            y={viewport.y + viewport.height / 2}
          >
            Press N or choose a node from the palette to begin.
          </text>
        ) : null}
      </svg>
      <p className="sr-only" id="canvas-help">
        Press N to add a node, arrow keys to move focus, Alt and arrow keys to move the active node,
        E then Enter to draw an edge, and question mark for help.
      </p>
      {showHelp ? (
        <aside className="absolute bottom-4 left-4 max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm shadow-[var(--shadow)]">
          <p className="font-mono text-xs font-bold tracking-[0.14em] text-[var(--signal)]">
            KEYBOARD
          </p>
          <p className="mt-2 leading-6 text-[var(--muted)]">
            N add · arrows select · Alt+arrows move · E then Enter edge · X/Y roles · L/S kind ·
            Delete remove · Cmd/Ctrl+Z undo
          </p>
        </aside>
      ) : null}
    </div>
  );
}
