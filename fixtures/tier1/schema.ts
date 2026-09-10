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

export const Tier1FixtureSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  derivation: z.string(),
  graph: GraphSchema,
  parameters: z.optional(SCMParametersSchema),
  expectedP3: z.optional(z.unknown()),
  expectedP1: z._default(
    z.object({
      dSeparation: z._default(z.array(DSeparationExpectationSchema), []),
      paths: z._default(z.array(PathExpectationSchema), []),
    }),
    { dSeparation: [], paths: [] },
  ),
});

export type Tier1Fixture = z.infer<typeof Tier1FixtureSchema>;
