import * as z from "zod/mini";
import { EXAMPLE_SNAPSHOTS } from "@/content/examples";
import type { LabSnapshot } from "@/lib/codec";

export const CHOICE_KINDS = ["naive", "adjust", "iv", "frontdoor"] as const;
export type ChoiceKind = (typeof CHOICE_KINDS)[number];

export const LearnChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(CHOICE_KINDS),
  detail: z.string(),
  correct: z.boolean(),
});

export const LearnScenarioSchema = z.object({
  slug: z.string(),
  ordinal: z.number().check(z.int(), z.positive()),
  title: z.string(),
  oneLiner: z.string(),
  fixtureId: z.string(),
  setup: z.string(),
  actQuestion: z.string(),
  choices: z.array(LearnChoiceSchema).check(z.minLength(2)),
  observe: z.string(),
  reveal: z.object({
    lesson: z.string(),
    populationBias: z.string(),
    pathAnatomy: z.string(),
  }),
  secondaryReference: z.optional(
    z.object({
      label: z.string(),
      value: z.string(),
    }),
  ),
});

export type LearnScenario = z.infer<typeof LearnScenarioSchema>;
export type LearnChoice = z.infer<typeof LearnChoiceSchema>;

export const LEARN_SCENARIOS: readonly LearnScenario[] = z.array(LearnScenarioSchema).parse([
  {
    slug: "confounding",
    ordinal: 1,
    title: "Confounding",
    oneLiner: "A common cause can manufacture an association.",
    fixtureId: "fork",
    setup:
      "A shared parent U feeds both the exposure X and the outcome Y. You have not measured U but you can measure it before analysis. A stakeholder wants the raw X → Y association without a control.",
    actQuestion: "What do you report?",
    choices: [
      {
        id: "naive",
        label: "Report the raw slope β(∅).",
        kind: "naive",
        detail: "Regress Y on X. Ignore U.",
        correct: false,
      },
      {
        id: "adjust",
        label: "Adjust for the common cause U.",
        kind: "adjust",
        detail: "Regress Y on X and U. Block the confounding backdoor.",
        correct: true,
      },
    ],
    observe:
      "The naive slope is populated entirely by the U → X, U → Y fork. Every unit change in X co-arrives with a change in U, and U changes Y for its own reasons.",
    reveal: {
      lesson:
        "A single unblocked backdoor is enough to inflate the raw slope. Blocking it with the observed common cause exactly restores the true zero direct effect.",
      populationBias: "β(∅) − TE(X → Y) = Σ_XY / Σ_XX. Adjusting for U drives Bias({U}) to 0.",
      pathAnatomy:
        "One biasing path X ← U → Y. Adjustment set {U} d-separates X from Y in the proper backdoor graph.",
    },
  },
  {
    slug: "overcontrol",
    ordinal: 2,
    title: "Mediator overcontrol",
    oneLiner: "A mediator is evidence of the effect, not a nuisance variable.",
    fixtureId: "mediator-overcontrol",
    setup:
      'X → M → Y is the causal channel. There is no confounding. A colleague suggests including M in the regression to "absorb noise".',
    actQuestion: "Do you condition on M?",
    choices: [
      {
        id: "naive",
        label: "Keep the total effect estimate: regress Y on X alone.",
        kind: "naive",
        detail: "Do not add M as a covariate — it lies on the causal path.",
        correct: true,
      },
      {
        id: "overcontrol",
        label: "Add M to the regression.",
        kind: "adjust",
        detail: 'Regress Y on X and M to "clean up" the estimate.',
        correct: false,
      },
    ],
    observe:
      "Conditioning on M closes the only path from X to Y. The regression slope of X collapses toward zero because the causal channel is being blocked.",
    reveal: {
      lesson:
        'Adjusting for a mediator does not "clean up" the estimate — it kills the effect you were measuring.',
      populationBias:
        "The X-conditional-on-M slope targets the direct effect (zero here) rather than the total effect, so Bias({M}) = −TE.",
      pathAnatomy:
        "One causal path X → M → Y. Path label under Z = {M}: causal-blocked with overcontrol warning.",
    },
  },
  {
    slug: "collider-trap",
    ordinal: 3,
    title: "Collider trap",
    oneLiner: "Conditioning can create the association you were looking for.",
    fixtureId: "collider",
    setup:
      "X and Y are independent but they share a downstream collider C. A modelling reviewer insists on including C as a control because it correlates with both.",
    actQuestion: "Do you include C in the regression?",
    choices: [
      {
        id: "naive",
        label: "Regress Y on X — do not condition on C.",
        kind: "naive",
        detail: "Leave the collider unconditioned.",
        correct: true,
      },
      {
        id: "condition",
        label: 'Condition on C to "control for the shared driver".',
        kind: "adjust",
        detail: "Add C as a covariate.",
        correct: false,
      },
    ],
    observe:
      "Conditioning on C opens the previously closed X → C ← Y path. The slope becomes non-zero from an artefactual, adjustment-induced dependence.",
    reveal: {
      lesson:
        "Colliders are the opposite of confounders. Their default state is blocking. Conditioning opens them and injects bias out of thin air.",
      populationBias:
        "β({C}) − TE = Σ_XY·C / Σ_XX·C; with TE = 0 this is pure adjustment-induced bias.",
      pathAnatomy: "One non-causal path X → C ← Y, classified as collider-opened when C ∈ Z.",
    },
  },
  {
    slug: "m-bias",
    ordinal: 4,
    title: "M-bias",
    oneLiner: "Pretreatment does not automatically mean safe to adjust for.",
    fixtureId: "m-bias",
    setup:
      'M is pretreatment, unrelated to X or Y directly, but two latents U₁ and U₂ each connect to M. The intuition "pretreatment covariates cannot bias the effect" says to include M.',
    actQuestion: "Do you include M in the regression?",
    choices: [
      {
        id: "naive",
        label: "Leave M out. Regress Y on X.",
        kind: "naive",
        detail: "The unconditional slope is exactly zero here.",
        correct: true,
      },
      {
        id: "include",
        label: "Include M for safety — it is pretreatment.",
        kind: "adjust",
        detail: "The intuition suggests M cannot hurt.",
        correct: false,
      },
    ],
    observe:
      "Adjusting for M opens the X ← U₁ → M ← U₂ → Y collider path. The slope moves from zero to a small negative number even though nothing about the DAG changed.",
    reveal: {
      lesson:
        '"Pretreatment covariate" is not a licence to adjust. If the covariate is a collider between two latents that also touch X and Y, adjusting for it manufactures the exact bias you were trying to prevent.',
      populationBias: "β({M}) = −(1/24) / (29/24) = −1/29 ≈ −0.0345, against a true TE of 0.",
      pathAnatomy:
        "One non-causal path X ← U₁ → M ← U₂ → Y, classified as collider-opened when M ∈ Z.",
    },
  },
  {
    slug: "selection-bias",
    ordinal: 5,
    title: "Selection bias",
    oneLiner: "Your sample can condition the graph before analysis starts.",
    fixtureId: "berkson-selection",
    setup:
      "The sampling scheme keeps rows with S > τ, where S is a downstream collider between X and Y. Even without any regression covariates, the sampled association differs from the causal effect.",
    actQuestion: "What are you willing to claim about the true X → Y effect from this sample?",
    choices: [
      {
        id: "raw",
        label: "Report the raw slope β(∅) as the effect.",
        kind: "naive",
        detail: "Treat the selected sample as if it were random.",
        correct: false,
      },
      {
        id: "quantify",
        label: "Report the raw slope alongside the truncated-Σ population bias.",
        kind: "naive",
        detail:
          'The engine\'s truncated closed form quantifies the selection bias exactly; v1 does not certify "valid under selection" sets.',
        correct: true,
      },
    ],
    observe:
      "With q = 0.5 the kept-sample covariance shifts along the collider path. The naive slope moves away from 0 by the exact amount predicted by the truncated closed form.",
    reveal: {
      lesson:
        'Selection is conditioning by the sampling rule, not by the analyst. The engine models it as a virtual indicator and reports the biasing paths and the exact truncated Σ; it deliberately never claims an adjustment set is "valid under selection".',
      populationBias:
        "Truncated Σ_XY = −0.106, Σ_XX = 0.894 at q=0.5, so β(∅) is offset from TE by roughly −0.118.",
      pathAnatomy:
        "One selection-opened path X → S ← Y; I_S sits in the effective conditioning set and opens the collider.",
    },
  },
  {
    slug: "measurement-error",
    ordinal: 6,
    title: "Measurement error",
    oneLiner: "The drawn exposure may not be the thing you meant to measure.",
    fixtureId: "measurement-error",
    setup:
      "A latent true exposure T influences both the noisy observed X (its proxy) and the outcome Y. The workbench designates X as the exposure because that is what you can measure — but the causal effect you care about is T → Y.",
    actQuestion: "What number do you report as the effect of X on Y?",
    choices: [
      {
        id: "raw",
        label: "Report β(∅) as-is — the sample slope of Y on X.",
        kind: "naive",
        detail: "Treat X as if it were T.",
        correct: false,
      },
      {
        id: "acknowledge",
        label: "Report β(∅) but frame it against the latent T → Y coefficient.",
        kind: "naive",
        detail: "Own the attenuation and the identification limit.",
        correct: true,
      },
    ],
    observe:
      "TE(X → Y) is structurally zero because X does not cause Y. The raw slope is nonzero, driven by T's shared influence, and it is a downwardly attenuated proxy of the latent T → Y coefficient.",
    reveal: {
      lesson:
        "When the workbench's designated exposure is a noisy proxy for the true cause, the raw slope answers a different question. v1 will not silently rebrand it; the ADR must state that the reported estimand is the proxy's association, not the latent effect.",
      populationBias:
        "β(∅) − TE(X → Y) = β(∅) − 0. The slope equals a specific fraction of the latent T → Y coefficient — the classical attenuation factor.",
      pathAnatomy:
        "Backdoor via the latent: X ← T → Y opens without any conditioning. No adjustment set of observed nodes closes it.",
    },
    secondaryReference: {
      label: "Latent T → Y coefficient (attenuated in β(∅))",
      value:
        "β(∅) = (Var(T) / Var(X)) · β_{T→Y} — the raw slope is that fraction of the latent effect.",
    },
  },
]);

export const LEARN_SLUGS: readonly string[] = LEARN_SCENARIOS.map((scenario) => scenario.slug);

export function scenarioBySlug(slug: string): LearnScenario | undefined {
  return LEARN_SCENARIOS.find((scenario) => scenario.slug === slug);
}

const EXAMPLE_KEYS = Object.keys(EXAMPLE_SNAPSHOTS);

export function openInLabSnapshot(scenario: LearnScenario): LabSnapshot | null {
  if (EXAMPLE_KEYS.includes(scenario.slug))
    return EXAMPLE_SNAPSHOTS[scenario.slug as keyof typeof EXAMPLE_SNAPSHOTS];
  if (scenario.fixtureId === "m-bias") return EXAMPLE_SNAPSHOTS["m-bias"];
  return EXAMPLE_SNAPSHOTS["m-bias"];
}
