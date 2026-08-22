import { z } from "zod";
import { GraphSchema } from "@/engine/graph";
import { SCMParametersSchema } from "@/engine/scm";

const DSeparationExpectationSchema = z.object({
  from: z.string(),
  to: z.string(),
  conditioned: z.array(z.string()),
  selectionNodeId: z.string().optional(),
  separated: z.boolean(),
});

const PathExpectationSchema = z.object({
  conditioned: z.array(z.string()),
  selectionNodeId: z.string().optional(),
  primaryLabels: z.array(z.string()),
});

export const Tier1FixtureSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  derivation: z.string(),
  graph: GraphSchema,
  parameters: SCMParametersSchema.optional(),
  expectedP3: z.unknown().optional(),
  expectedP1: z
    .object({
      dSeparation: z.array(DSeparationExpectationSchema).default([]),
      paths: z.array(PathExpectationSchema).default([]),
    })
    .default({ dSeparation: [], paths: [] }),
});

export type Tier1Fixture = z.infer<typeof Tier1FixtureSchema>;
