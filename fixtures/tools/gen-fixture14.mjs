import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const seed = "fixture14-layered-v1";
const layers = [["x"], ["a", "b", "c"], ["d", "e"], ["f", "g", "h"], ["i", "j"], ["y"]];
const names = new Map(layers.flat().map((id) => [id, id.toUpperCase()]));
const nodes = layers.flat().map((id, idx) => ({ id, idx, name: names.get(id), kind: "observed" }));
const edges = [];
for (let layer = 0; layer < layers.length - 1; layer += 1) {
  for (const from of layers[layer]) {
    for (const to of layers[layer + 1]) edges.push({ from, to });
  }
}
edges.push({ from: "x", to: "y" });

const fixture = {
  v: 1,
  id: "adversarial-perf",
  derivation: `Frozen ${seed}: a 12-node / 24-edge layered DAG for agreement and performance only.`,
  graph: { v: 1, nodes, edges, roles: { exposureId: "x", outcomeId: "y" } },
  expectedGraph: { dSeparation: [], paths: [] },
};

if (nodes.length !== 12 || edges.length !== 24)
  throw new Error("Fixture #14 must stay at the contract cap.");
const outputPath = resolve(import.meta.dirname, "../tier1/14-adversarial-perf.json");
const serialized = `${JSON.stringify(fixture, null, 2)}\n`;

if (process.argv.includes("--check")) {
  if (readFileSync(outputPath, "utf8") !== serialized) {
    throw new Error("Adversarial fixture is stale; run npm run fixtures:adversarial.");
  }
} else {
  writeFileSync(outputPath, serialized);
}
