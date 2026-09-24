import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { format } from "prettier";

const require = createRequire(import.meta.url);
const { GraphAnalyzer, GraphParser } = require("./dagitty/dagitty-node.js");
const here = dirname(fileURLToPath(import.meta.url));
const tier1Directory = resolve(here, "../tier1");
const outputPath = resolve(here, "../tier2/dagitty-corpus.json");

function nodeStatement(node, roles) {
  if (node.id === roles.exposureId) return `${node.id} [exposure]`;
  if (node.id === roles.outcomeId) return `${node.id} [outcome]`;
  if (node.kind === "latent") return `${node.id} [latent]`;
  if (node.kind === "selection") return `${node.id} [selected]`;
  return node.id;
}

function toDagittyText(graph) {
  const nodes = graph.nodes.map((node) => nodeStatement(node, graph.roles));
  const edges = graph.edges.map((edge) => `${edge.from} -> ${edge.to}`);
  return `dag { ${[...nodes, ...edges].join("; ")} }`;
}

function ids(nodes) {
  return nodes.map((node) => node.id).sort();
}

function serializeImplications(output) {
  return output.map(([u, v, separators]) => ({
    u,
    v,
    sets: separators
      .map(ids)
      .sort(
        (left, right) =>
          left.length - right.length || left.join("\u0000").localeCompare(right.join("\u0000")),
      ),
  }));
}

function descendantsOf(graph, start) {
  const seen = new Set();
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    for (const edge of graph.edges) if (edge.from === id) queue.push(edge.to);
  }
  return seen;
}

function oracleEntry(id, graph) {
  const model = toDagittyText(graph);
  const dag = GraphParser.parseGuess(model);
  const adjustmentSets = GraphAnalyzer.listMsasTotalEffect(dag, [], [], Infinity)
    .map(ids)
    .sort(
      (left, right) =>
        left.length - right.length || left.join("\u0000").localeCompare(right.join("\u0000")),
    );
  const instruments = GraphAnalyzer.conditionalInstruments(dag)
    .map(([instrument, conditioning]) => ({
      instrument: instrument.id,
      conditioning: ids(conditioning),
    }))
    .sort(
      (left, right) =>
        left.instrument.localeCompare(right.instrument) ||
        left.conditioning.join("\u0000").localeCompare(right.conditioning.join("\u0000")),
    );
  const descendants = descendantsOf(graph, graph.roles.exposureId);
  const criterionDifferences = [];
  if (graph.nodes.some((node) => node.kind === "selection")) {
    criterionDifferences.push({
      kind: "adjustment",
      reason:
        "DAGitty treats selected status as a direct selection condition; this implementation certifies adjustment on the selection-free graph and reports selected-sample bias separately.",
    });
  }
  for (const instrument of instruments) {
    if (
      descendants.has(instrument.instrument) ||
      instrument.conditioning.some((id) => descendants.has(id))
    ) {
      criterionDifferences.push({
        kind: "instrument",
        instrument: instrument.instrument,
        conditioning: instrument.conditioning,
        reason:
          "DAGitty ancestral-instrument output is broader; this implementation rejects exposure descendants in Z or W by §3.6's conservative non-descendance rule.",
      });
    }
  }
  return {
    id,
    graph,
    model,
    adjustmentSets,
    implications: serializeImplications(GraphAnalyzer.listMinimalImplications(dag, Infinity)),
    instruments,
    criterionDifferences,
  };
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };
}

function randomGraph(seed) {
  const random = mulberry32(seed);
  const count = 5 + Math.floor(random() * 5);
  const nodes = Array.from({ length: count }, (_, idx) => ({
    id: `r${idx}`,
    idx,
    name: `R${idx}`,
    kind: idx === 0 || idx === count - 1 || random() > 0.2 ? "observed" : "latent",
  }));
  const edges = [];
  for (let from = 0; from < count; from += 1) {
    for (let to = from + 1; to < count; to += 1) {
      if (random() < 0.25 && edges.length < 24) edges.push({ from: `r${from}`, to: `r${to}` });
    }
  }
  return { v: 1, nodes, edges, roles: { exposureId: "r0", outcomeId: `r${count - 1}` } };
}

const tier1 = readdirSync(tier1Directory)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => JSON.parse(readFileSync(resolve(tier1Directory, file), "utf8")));
const randomSeeds = [
  0x0a11ce, 0x1d3a5e, 0x51a7, 0x5eed, 0xc0ffee, 0xdecafbad, 0x12345678, 0x8badf00d,
];
const entries = [
  ...tier1.map((fixture) => oracleEntry(fixture.id, fixture.graph)),
  ...randomSeeds.map((seed) => oracleEntry(`random-${seed.toString(16)}`, randomGraph(seed))),
];

const corpus = {
  v: 1,
  provenance: {
    source: "https://github.com/jtextor/dagitty",
    commit: "7a657776dc8f5e5ba4e323edb028e2c2aaf29327",
    license: "GPL-2.0-or-later",
    importPath: "fixtures/tools/dagitty/dagitty-node.js",
    generatedAt: "2026-07-19",
    scope: "Test-only oracle corpus; never bundled or imported by src/.",
  },
  entries,
};

const serialized = await format(JSON.stringify(corpus), { filepath: outputPath });
if (process.argv.includes("--check")) {
  if (readFileSync(outputPath, "utf8") !== serialized) {
    throw new Error("DAGitty oracle corpus is stale; run npm run fixtures:dagitty.");
  }
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized);
}
