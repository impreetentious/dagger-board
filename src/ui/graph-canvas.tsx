"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useLabStore } from "@/store/lab-store";
import { clipEdge, graphLayoutWarning, graphToSvg } from "@/lib/svg-export";

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

export function GraphCanvas() {
  const graph = useLabStore((state) => state.graph);
  const selectedNodeId = useLabStore((state) => state.selectedNodeId);
  const edgeStartId = useLabStore((state) => state.edgeStartId);
  const highlightedPathNodeIds = useLabStore((state) => state.highlightedPathNodeIds);
  const selectNode = useLabStore((state) => state.selectNode);
  const moveNode = useLabStore((state) => state.moveNode);
  const endGesture = useLabStore((state) => state.endGesture);
  const addNode = useLabStore((state) => state.addNode);
  const assignRole = useLabStore((state) => state.assignRole);
  const setNodeKind = useLabStore((state) => state.setNodeKind);
  const deleteNode = useLabStore((state) => state.deleteNode);
  const startEdge = useLabStore((state) => state.startEdge);
  const completeEdge = useLabStore((state) => state.completeEdge);
  const undo = useLabStore((state) => state.undo);
  const redo = useLabStore((state) => state.redo);
  const layoutWarning = graphLayoutWarning(graph);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, width: 800, height: 520 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number; viewport: Viewport } | null>(
    null,
  );
  const [showHelp, setShowHelp] = useState(false);

  const pointFor = (event: PointerEvent<SVGSVGElement | SVGGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const bounds = svg.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return { x: 0, y: 0 };
    return {
      x: viewport.x + ((event.clientX - bounds.left) / bounds.width) * viewport.width,
      y: viewport.y + ((event.clientY - bounds.top) / bounds.height) * viewport.height,
    };
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

  // Bound on the <svg> only. A focused node <g> bubbles its keydown here, so
  // binding this on both surfaces ran every command twice for the one case that
  // matters — N added two nodes, Alt+arrow moved sixteen pixels, and the second
  // Delete reported "Unknown node" for the one it had just removed.
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

  // Also bound to pointercancel: a cancelled pointer (an interrupting system
  // gesture on touch, say) never delivers pointerup, and the node would stay
  // glued to the cursor with no button held.
  const endPointerInteraction = () => {
    if (drag) endGesture();
    setDrag(null);
    setPanStart(null);
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

  // React registers `wheel` passively, so an onWheel prop cannot call
  // preventDefault: the browser logs an error and scrolls the page while the
  // canvas zooms. The listener is attached directly so the zoom consumes it.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const bounds = svg.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;
      const factor = event.deltaY > 0 ? 1.12 : 0.88;
      setViewport((previous) => {
        const pointX = previous.x + ((event.clientX - bounds.left) / bounds.width) * previous.width;
        const pointY =
          previous.y + ((event.clientY - bounds.top) / bounds.height) * previous.height;
        const width = Math.min(1500, Math.max(320, previous.width * factor));
        const height = (width / previous.width) * previous.height;
        return {
          width,
          height,
          x: pointX - ((pointX - previous.x) * width) / previous.width,
          y: pointY - ((pointY - previous.y) * height) / previous.height,
        };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const positions = new Map(
    graph.nodes.map((node) => [node.id, node.position ?? { x: 120 + node.idx * 80, y: 220 }]),
  );
  const downloadSvg = async () => {
    await document.fonts.ready;
    const url = URL.createObjectURL(new Blob([graphToSvg(graph)], { type: "image/svg+xml" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "daggerboard-dag.svg";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };
  const highlightedPairs = new Set(
    (highlightedPathNodeIds ?? []).slice(1).map((id, index) => {
      const prior = highlightedPathNodeIds?.[index] ?? "";
      return `${prior}\u0000${id}`;
    }),
  );

  return (
    <div className="relative min-h-[31rem] overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--canvas)]">
      <button
        className="tool-button absolute right-3 top-3 z-10"
        onClick={() => void downloadSvg()}
        disabled={Boolean(layoutWarning)}
        type="button"
      >
        Download SVG
      </button>
      {layoutWarning ? (
        <p role="status">{layoutWarning} Diagram export is unavailable until separated.</p>
      ) : null}
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
        // A dragged node captures the pointer on its <g>. Listen during capture
        // on the SVG so the movement still reaches this shared drag controller.
        onPointerMoveCapture={onPointerMove}
        onPointerCancel={endPointerInteraction}
        onPointerUp={endPointerInteraction}
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
            refX="8"
            markerUnits="userSpaceOnUse"
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
            let path: string;
            try {
              path = clipEdge(
                from,
                to,
                {
                  ...nodesById.get(edge.from)!,
                  radius: nodesById.get(edge.from)?.kind === "selection" ? 31 : 30,
                },
                {
                  ...nodesById.get(edge.to)!,
                  radius: nodesById.get(edge.to)?.kind === "selection" ? 31 : 30,
                },
                index % 2 === 0 ? 12 : -12,
              ).path;
            } catch {
              return null;
            }
            const isConnected = edge.from === selectedNodeId || edge.to === selectedNodeId;
            const isHighlighted =
              highlightedPairs.has(`${edge.from}\u0000${edge.to}`) ||
              highlightedPairs.has(`${edge.to}\u0000${edge.from}`);
            return (
              <path
                d={path}
                fill="none"
                key={`${edge.from}-${edge.to}`}
                markerEnd="url(#causal-arrow)"
                data-testid={isHighlighted ? "highlighted-path-edge" : undefined}
                stroke={isHighlighted || isConnected ? "var(--signal)" : "var(--ink)"}
                strokeOpacity={isHighlighted || isConnected ? 0.95 : 0.62}
                strokeWidth={isHighlighted ? 4 : isConnected ? 2.6 : 1.7}
              />
            );
          })}
        </g>
        {ordered.map((node) => {
          const position = positions.get(node.id)!;
          const isSelected = selectedNodeId === node.id;
          const isEdgeSource = edgeStartId === node.id;
          const isPathNode = highlightedPathNodeIds?.includes(node.id) ?? false;
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
              {isSelected || isEdgeSource || isPathNode ? (
                <circle
                  cx={position.x}
                  cy={position.y}
                  fill="none"
                  r="38"
                  data-testid={isPathNode ? "highlighted-path-node" : undefined}
                  stroke="var(--signal)"
                  strokeWidth={isPathNode ? 4 : 2.5}
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
