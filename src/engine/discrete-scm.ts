import * as z from "zod/mini";
import { parentsOf, type Graph } from "@/engine/graph";

/**
 * Binary/discrete SCM path. This self-contained Bernoulli-logistic oracle
 * complements the primary linear-Gaussian model. It cannot share the §3 identity-assertion
 * machinery (matrix-vs-trek Σ, path-sum vs matrix TE, Schur partials) because
 * those identities are linear equalities: Wright's path decomposition and the
 * Schur complement live in the linear-Gaussian moment algebra. The discrete
 * equivalent is exact enumeration over 2^|V| configurations (feasible under
 * §3.1's 12-node cap → 4096 rows), with two independent joint-probability
 * computations (topological product vs marginalization identity) serving as
 * the analogous self-audit.
 */

const FiniteNumber = z.number();

const DiscreteScmParametersSchema = z.object({
  v: z.literal(1),
  logits: z.record(
    z.string(),
    z.object({
      intercept: FiniteNumber,
      coefficients: z.record(z.string(), FiniteNumber),
    }),
  ),
});

export type DiscreteScmParameters = z.infer<typeof DiscreteScmParametersSchema>;

class DiscreteScmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscreteScmError";
  }
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exponential = Math.exp(-value);
    return 1 / (1 + exponential);
  }
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

export function defaultDiscreteParameters(graph: Graph): DiscreteScmParameters {
  const logits: DiscreteScmParameters["logits"] = {};
  for (const node of graph.nodes) {
    const coefficients: Record<string, number> = {};
    for (const parent of parentsOf(graph, node.id)) coefficients[parent] = 1;
    logits[node.id] = { intercept: 0, coefficients };
  }
  return { v: 1, logits };
}

export function normalizeDiscreteParameters(
  graph: Graph,
  input: Partial<DiscreteScmParameters> | DiscreteScmParameters = {},
): DiscreteScmParameters {
  const parsed = DiscreteScmParametersSchema.parse({ v: 1, ...input });
  const defaults = defaultDiscreteParameters(graph);
  const logits: DiscreteScmParameters["logits"] = {};
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const node of graph.nodes) {
    const supplied = parsed.logits[node.id];
    const fallback = defaults.logits[node.id];
    const expectedParents = new Set(parentsOf(graph, node.id));
    if (supplied) {
      for (const parent of Object.keys(supplied.coefficients)) {
        if (!expectedParents.has(parent)) {
          throw new DiscreteScmError(`Logit for ${node.id} references non-parent ${parent}.`);
        }
        if (!nodeIds.has(parent)) {
          throw new DiscreteScmError(`Logit for ${node.id} references missing node ${parent}.`);
        }
      }
    }
    const coefficients: Record<string, number> = {
      ...fallback.coefficients,
      ...supplied?.coefficients,
    };
    logits[node.id] = {
      intercept: supplied?.intercept ?? fallback.intercept,
      coefficients,
    };
  }
  return { v: 1, logits };
}

interface Order {
  order: string[];
  indexById: Map<string, number>;
}

function topologicalOrder(graph: Graph): Order {
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    children.set(node.id, []);
  }
  for (const edge of graph.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    children.get(edge.from)?.push(edge.to);
  }
  const ready = graph.nodes
    .filter((node) => (inDegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .sort((left, right) => {
      const leftIdx = graph.nodes.find((node) => node.id === left)?.idx ?? 0;
      const rightIdx = graph.nodes.find((node) => node.id === right)?.idx ?? 0;
      return leftIdx - rightIdx;
    });
  const order: string[] = [];
  while (ready.length > 0) {
    const nodeId = ready.shift() as string;
    order.push(nodeId);
    for (const childId of children.get(nodeId) ?? []) {
      const next = (inDegree.get(childId) ?? 0) - 1;
      inDegree.set(childId, next);
      if (next === 0) ready.push(childId);
    }
  }
  if (order.length !== graph.nodes.length) throw new DiscreteScmError("Graph must be acyclic.");
  return { order, indexById: new Map(order.map((id, index) => [id, index])) };
}

function assignmentProbability(
  graph: Graph,
  parameters: DiscreteScmParameters,
  order: Order,
  assignment: readonly number[],
  interventions: ReadonlyMap<string, 0 | 1>,
): number {
  let probability = 1;
  for (const nodeId of order.order) {
    const logits = parameters.logits[nodeId];
    if (!logits) throw new DiscreteScmError(`Missing logit for ${nodeId}.`);
    const value = assignment[order.indexById.get(nodeId) as number];
    if (interventions.has(nodeId)) {
      const target = interventions.get(nodeId);
      if (target !== value) return 0;
      continue;
    }
    let logit = logits.intercept;
    for (const parentId of parentsOf(graph, nodeId)) {
      const coefficient = logits.coefficients[parentId] ?? 0;
      logit += coefficient * (assignment[order.indexById.get(parentId) as number] as number);
    }
    const oneProbability = sigmoid(logit);
    probability *= value === 1 ? oneProbability : 1 - oneProbability;
  }
  return probability;
}

function enumerateAssignments(count: number): number[][] {
  const output: number[][] = [];
  for (let mask = 0; mask < 1 << count; mask += 1) {
    const assignment: number[] = new Array(count);
    for (let index = 0; index < count; index += 1) assignment[index] = (mask >> index) & 1;
    output.push(assignment);
  }
  return output;
}

export interface DiscreteInterventionalMean {
  x0: number;
  x1: number;
  ate: number;
}

/** Exact E[Y | do(X = x)] for x ∈ {0, 1} by brute enumeration. */
export function averageCausalEffect(
  graph: Graph,
  parameters: DiscreteScmParameters,
  exposureId: string,
  outcomeId: string,
): DiscreteInterventionalMean {
  if (graph.nodes.length > 12) {
    throw new DiscreteScmError("Discrete oracle is capped at 12 nodes (§3.1).");
  }
  const normalized = normalizeDiscreteParameters(graph, parameters);
  const order = topologicalOrder(graph);
  const assignments = enumerateAssignments(graph.nodes.length);
  const compute = (value: 0 | 1) => {
    const interventions = new Map<string, 0 | 1>([[exposureId, value]]);
    let expectation = 0;
    for (const assignment of assignments) {
      const probability = assignmentProbability(
        graph,
        normalized,
        order,
        assignment,
        interventions,
      );
      if (probability === 0) continue;
      const outcome = assignment[order.indexById.get(outcomeId) as number];
      expectation += probability * outcome;
    }
    return expectation;
  };
  const x0 = compute(0);
  const x1 = compute(1);
  return { x0, x1, ate: x1 - x0 };
}

/**
 * Plug-in adjustment estimand for the ATE using the covariate set `Z`. When Z
 * satisfies the graphical adjustment criterion (§3.4) this equals `averageCausalEffect`;
 * a mismatch is the discrete equivalent of §3.14's population-bias witness.
 */
export function adjustmentAverageCausalEffect(
  graph: Graph,
  parameters: DiscreteScmParameters,
  exposureId: string,
  outcomeId: string,
  adjustmentIds: readonly string[],
): number {
  if (graph.nodes.length > 12) {
    throw new DiscreteScmError("Discrete oracle is capped at 12 nodes (§3.1).");
  }
  const normalized = normalizeDiscreteParameters(graph, parameters);
  const order = topologicalOrder(graph);
  const assignments = enumerateAssignments(graph.nodes.length);
  const joint = assignments.map((assignment) => ({
    assignment,
    probability: assignmentProbability(graph, normalized, order, assignment, new Map()),
  }));
  const exposureIndex = order.indexById.get(exposureId) as number;
  const outcomeIndex = order.indexById.get(outcomeId) as number;
  const covariateIndices = adjustmentIds.map((id) => order.indexById.get(id) as number);
  const marginalKey = (assignment: readonly number[]) =>
    covariateIndices.map((index) => assignment[index]).join(",");
  const zMarginal = new Map<string, number>();
  const zJointX = new Map<string, [number, number, number, number]>(); // key → [sum P(Y=1,X=0,Z), P(X=0,Z), P(Y=1,X=1,Z), P(X=1,Z)]
  for (const entry of joint) {
    if (entry.probability === 0) continue;
    const key = marginalKey(entry.assignment);
    zMarginal.set(key, (zMarginal.get(key) ?? 0) + entry.probability);
    const zx = zJointX.get(key) ?? [0, 0, 0, 0];
    const xValue = entry.assignment[exposureIndex];
    const yValue = entry.assignment[outcomeIndex];
    if (xValue === 0) {
      zx[1] += entry.probability;
      if (yValue === 1) zx[0] += entry.probability;
    } else {
      zx[3] += entry.probability;
      if (yValue === 1) zx[2] += entry.probability;
    }
    zJointX.set(key, zx);
  }
  let estimand = 0;
  for (const [key, marginal] of zMarginal) {
    const stats = zJointX.get(key);
    if (!stats) continue;
    const [y1x0, x0, y1x1, x1] = stats;
    const e0 = x0 > 0 ? y1x0 / x0 : 0;
    const e1 = x1 > 0 ? y1x1 / x1 : 0;
    estimand += marginal * (e1 - e0);
  }
  return estimand;
}
