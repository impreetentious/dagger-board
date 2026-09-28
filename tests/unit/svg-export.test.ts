import { describe, expect, it } from "vitest";
import { graphToSvg } from "@/lib/svg-export";
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
