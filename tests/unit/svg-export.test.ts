import { describe, expect, it } from "vitest";
import { graphToSvg } from "@/lib/svg-export";
import { EXAMPLE_SNAPSHOTS } from "@/content/examples";

describe("DAG SVG export", () => {
  it("serializes standalone SVG with causal arrows and kind encodings", () => {
    const svg = graphToSvg(EXAMPLE_SNAPSHOTS["m-bias"].graph);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('marker-end="url(#arrow)"');
    expect(svg).toContain("stroke-dasharray");
  });
});
