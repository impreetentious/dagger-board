import * as z from "zod/mini";
import { GraphSchema } from "@/engine/graph";
import { SCMParametersSchema } from "@/engine/scm";

const DSeparationExpectationSchema = z.object({
  from: z.string(),
  to: z.string(),
  conditioned: z.array(z.string()),
  selectionNodeId: z.optional(z.string()),
  separated: z.boolean(),
});

const PathExpectationSchema = z.object({
  conditioned: z.array(z.string()),
  selectionNodeId: z.optional(z.string()),
  primaryLabels: z.array(z.string()),
});

const ExpectedGraphSchema = z.object({
  dSeparation: z._default(z.array(DSeparationExpectationSchema), []),
  paths: z._default(z.array(PathExpectationSchema), []),
});

const EmptyExpectedGraph = { dSeparation: [], paths: [] };

const ExpectedScmSchema = z.object({
  totalEffect: z.optional(z.number()),
  covariance: z.optional(z.record(z.string(), z.number())),
  ols: z.optional(z.record(z.string(), z.number())),
  olsNaive: z.optional(z.number()),
  selection: z.optional(
    z.object({
      nodeId: z.string(),
      quantile: z.number(),
      varS: z.number(),
      varX: z.number(),
      covXY: z.number(),
      varSSelected: z.number(),
    }),
  ),
  frontdoorSet: z.optional(
    z.object({
      mediatorIds: z.array(z.string()),
      estimand: z.number(),
    }),
  ),
});

const TransitionalTier1FixtureSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  derivation: z.string(),
  graph: GraphSchema,
  parameters: z.optional(SCMParametersSchema),
  expectedP3: z.optional(ExpectedScmSchema),
  expectedScm: z.optional(ExpectedScmSchema),
  expectedP1: z.optional(ExpectedGraphSchema),
  expectedGraph: z.optional(ExpectedGraphSchema),
});

export const Tier1FixtureSchema = z.pipe(
  TransitionalTier1FixtureSchema,
  z.transform((fixture) => ({
    ...fixture,
    expectedP1: fixture.expectedP1 ?? fixture.expectedGraph ?? EmptyExpectedGraph,
  })),
);

export type Tier1Fixture = z.infer<typeof Tier1FixtureSchema>;
