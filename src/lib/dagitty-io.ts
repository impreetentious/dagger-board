import { validateGraph, type Graph, type GraphEdge, type GraphNode } from "@/engine/graph";
import { defaultScmParameters } from "@/engine/scm";
import { pruneLabSnapshot, type LabSnapshot } from "@/lib/codec";

export interface DagittyImportResult {
  snapshot: LabSnapshot;
  warnings: string[];
}

function quoted(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replaceAll(/\\(["\\])/gu, "$1");
  }
  return trimmed;
}

function statusFor(snapshot: LabSnapshot, node: GraphNode): string | null {
  if (node.id === snapshot.graph.roles.exposureId) return "exposure";
  if (node.id === snapshot.graph.roles.outcomeId) return "outcome";
  if (snapshot.conditioning.includes(node.id)) return "adjusted";
  if (node.kind === "latent") return "latent";
  if (node.kind === "selection") return "selected";
  return null;
}

export function exportDagittyText(snapshot: LabSnapshot): string {
  const model = pruneLabSnapshot(snapshot);
  const lines = model.graph.nodes.map((node) => {
    const status = statusFor(model, node);
    return `  ${quoted(node.name)}${status ? ` [${status}]` : ""}`;
  });
  for (const edge of model.graph.edges) {
    const from = model.graph.nodes.find((node) => node.id === edge.from);
    const to = model.graph.nodes.find((node) => node.id === edge.to);
    if (from && to) lines.push(`  ${quoted(from.name)} -> ${quoted(to.name)}`);
  }
  return `dag {\n${lines.join("\n")}\n}`;
}

function uniqueName(rawName: string, seen: Set<string>, warnings: string[]): string {
  const base = rawName.trim().slice(0, 64) || "Node";
  let name = base;
  let suffix = 2;
  while (seen.has(name.toLocaleLowerCase())) {
    name = `${base.slice(0, Math.max(1, 64 - String(suffix).length - 1))}_${suffix}`;
    suffix += 1;
  }
  if (name !== rawName)
    warnings.push(`Renamed imported node ${quoted(rawName)} to ${quoted(name)}.`);
  seen.add(name.toLocaleLowerCase());
  return name;
}

interface ParsedNode {
  name: string;
  statuses: Set<string>;
}

interface ParsedEdge {
  from: string;
  to: string;
  operator: "->" | "<->";
}

function parseStatements(text: string): { nodes: ParsedNode[]; edges: ParsedEdge[] } {
  const body = text.replace(/^\s*(dag|digraph)\s*(?:[\w-]+)?\s*\{/iu, "").replace(/\}\s*$/u, "");
  const statements = body
    .split(/[;\n]/u)
    .map((statement) => statement.trim())
    .filter(Boolean);
  const nodeMap = new Map<string, ParsedNode>();
  const edges: ParsedEdge[] = [];
  const nodeFor = (raw: string) => {
    const name = unquote(raw);
    let node = nodeMap.get(name);
    if (!node) {
      node = { name, statuses: new Set() };
      nodeMap.set(name, node);
    }
    return node;
  };
  for (const statement of statements) {
    const edge = statement.match(/^\s*("(?:\\.|[^"\\])*")\s*(<->|->)\s*("(?:\\.|[^"\\])*")\s*$/u);
    if (edge) {
      const from = unquote(edge[1]);
      const to = unquote(edge[3]);
      nodeFor(edge[1]);
      nodeFor(edge[3]);
      edges.push({ from, to, operator: edge[2] as "->" | "<->" });
      continue;
    }
    const declaration = statement.match(
      /^\s*("(?:\\.|[^"\\])*"|[^\s\[]+)\s*(?:\[([^\]]*)\])?\s*$/u,
    );
    if (!declaration) continue;
    const node = nodeFor(declaration[1]);
    const attributes = declaration[2] ?? "";
    for (const status of [
      "latent",
      "unobserved",
      "exposure",
      "source",
      "outcome",
      "target",
      "adjusted",
      "selected",
    ]) {
      if (new RegExp(`(?:^|\\s|,)${status}(?:$|\\s|,)`, "iu").test(attributes)) {
        node.statuses.add(status.toLocaleLowerCase());
      }
    }
  }
  return { nodes: [...nodeMap.values()], edges };
}

function nodeKind(statuses: ReadonlySet<string>): GraphNode["kind"] {
  if (statuses.has("latent") || statuses.has("unobserved")) return "latent";
  if (statuses.has("selected")) return "selection";
  return "observed";
}

export function importDagittyText(text: string): DagittyImportResult {
  const parsed = parseStatements(text);
  const warnings: string[] = [];
  const names = new Set<string>();
  const idByOriginalName = new Map<string, string>();
  const nodes: GraphNode[] = parsed.nodes.map((parsedNode, idx) => {
    const name = uniqueName(parsedNode.name, names, warnings);
    const id = `node-${idx}`;
    idByOriginalName.set(parsedNode.name, id);
    return {
      id,
      idx,
      name,
      kind: nodeKind(parsedNode.statuses),
      position: { x: 100 + idx * 64, y: 160 },
    };
  });
  const roles: Graph["roles"] = {};
  for (const parsedNode of parsed.nodes) {
    const id = idByOriginalName.get(parsedNode.name);
    if (!id) continue;
    if (parsedNode.statuses.has("exposure") || parsedNode.statuses.has("source"))
      roles.exposureId = id;
    if (parsedNode.statuses.has("outcome") || parsedNode.statuses.has("target"))
      roles.outcomeId = id;
  }
  for (const node of nodes) {
    if (node.id === roles.exposureId || node.id === roles.outcomeId) {
      if (node.kind !== "observed")
        warnings.push(`Role status wins over non-observed status for ${quoted(node.name)}.`);
      node.kind = "observed";
    }
  }
  const edges: GraphEdge[] = [];
  const addLatent = (left: string, right: string) => {
    if (nodes.length >= 12) throw new Error("Bidirected import exceeds the 12-node graph limit.");
    let latentNumber = 1;
    let latentName = `L${latentNumber}`;
    while (names.has(latentName.toLocaleLowerCase())) {
      latentNumber += 1;
      latentName = `L${latentNumber}`;
    }
    names.add(latentName.toLocaleLowerCase());
    const latentId = `node-${nodes.length}`;
    nodes.push({
      id: latentId,
      idx: nodes.length,
      name: latentName,
      kind: "latent",
      position: { x: 100, y: 100 },
    });
    edges.push({ from: latentId, to: left }, { from: latentId, to: right });
  };
  for (const edge of parsed.edges) {
    const from = idByOriginalName.get(edge.from);
    const to = idByOriginalName.get(edge.to);
    if (!from || !to) continue;
    if (edge.operator === "<->") addLatent(from, to);
    else edges.push({ from, to });
  }
  if (nodes.length > 12 || edges.length > 24)
    throw new Error("Imported DAGitty graph exceeds the graph cap.");
  const graph = validateGraph({ v: 1, nodes, edges, roles });
  const adjusted = parsed.nodes
    .filter((node) => node.statuses.has("adjusted"))
    .map((node) => idByOriginalName.get(node.name))
    .filter((id): id is string => Boolean(id));
  const snapshot = pruneLabSnapshot({
    v: 1,
    graph,
    parameters: defaultScmParameters(graph),
    conditioning: adjusted,
    selection: null,
    measured: {},
    seed: 314159,
    n: 10_000,
  });
  if (snapshot.conditioning.length !== adjusted.length) {
    warnings.push(
      "Role-marked or non-observed adjusted statuses were not added to the conditioning set.",
    );
  }
  if (graph.nodes.some((node) => node.kind === "selection")) {
    warnings.push(
      "Selection kind imported; its active threshold/quantile is not representable in DAGitty text.",
    );
  }
  return { snapshot, warnings };
}
