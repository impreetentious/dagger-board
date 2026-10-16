import { describe, expect, it } from "vitest";
import { clipEdge, graphBounds, graphToSvg } from "@/lib/svg-export";
import { validateGraph } from "@/engine/graph";
import { EXAMPLE_SNAPSHOTS } from "@/content/examples";

describe("DAG SVG export", () => {
  it("serializes standalone SVG with causal arrows and kind encodings", () => {
    const svg = graphToSvg(EXAMPLE_SNAPSHOTS["m-bias"].graph);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('marker-end="url(#arrow)"');
    expect(svg).toContain("stroke-dasharray");
  });

  /**
   * Node names arrive from imported JSON, DAGitty text, and shared URLs, and the
   * Communicate rail injects this string with `dangerouslySetInnerHTML`. Markup
   * in a name has to leave as text.
   */
  it("escapes node names rather than emitting them as markup", () => {
    const graph = validateGraph({
      v: 1,
      nodes: [
        {
          id: "x",
          idx: 0,
          name: `<img src=x onerror="alert(1)">`,
          kind: "observed",
          position: { x: 100, y: 100 },
        },
      ],
      edges: [],
      roles: {},
    });
    const svg = graphToSvg(graph);
    expect(svg).not.toContain("<img");
    expect(svg).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});

describe("shape-clipped edge geometry and bounds", () => {
  it("has independently derived circle endpoints and terminal marker alignment", () => {
    const result = clipEdge(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { kind: "observed" },
      { kind: "observed" },
    );
    expect(result.start.x).toBeCloseTo(32);
    expect(result.start.y).toBe(0);
    expect(result.end.x).toBeCloseTo(68);
    expect(result.end.y).toBe(0);
    const curved = clipEdge(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { kind: "observed" },
      { kind: "selection" },
      12,
    );
    expect(Math.hypot(curved.start.x, curved.start.y)).toBeCloseTo(32);
    expect(curved.end.x).toBeLessThan(100);
    expect(curved.end.y).toBeGreaterThan(0);
    expect(curved.path).not.toContain("NaN");
  });
  it("includes measured long labels, negative positions and role badges", () => {
    const graph = validateGraph({
      v: 1,
      nodes: [
        {
          id: "x",
          idx: 0,
          name: "A long escaped <label>",
          kind: "observed",
          position: { x: -100, y: -100 },
        },
      ],
      edges: [],
      roles: { exposureId: "x" },
    });
    const bounds = graphBounds(graph, () => ({ width: 400, ascent: 14, descent: 3 }));
    expect(bounds.x).toBe(-324);
    expect(bounds.y).toBe(-164);
    expect(bounds.width).toBe(448);
    expect(graphToSvg(graph, () => ({ width: 400, ascent: 14, descent: 3 }))).toContain(
      'viewBox="-324 -164 448 120"',
    );
    expect(graphToSvg({ v: 1, nodes: [], edges: [], roles: {} })).not.toContain("Infinity");
  });
  it("refuses coincident, overlapping and unreadably adjacent endpoint shapes", () => {
    for (const x of [0, 40, 60, 63])
      expect(() =>
        clipEdge({ x: 0, y: 0 }, { x, y: 0 }, { kind: "observed" }, { kind: "observed" }),
      ).toThrow();
  });
});
