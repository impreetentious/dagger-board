# Identification Research Notes

## V-01 — Generalized adjustment criterion

Resolved against Perković, Textor, Kalisch, and Maathuis (2018),
_Complete Graphical Characterization and Construction of Adjustment Sets in Markov
Equivalence Classes of Ancestral Graphs_.

- Definition 3 defines the forbidden set from descendants of non-exposure nodes on
  proper possibly directed exposure-to-outcome paths. For a DAG this specializes
  directly to §3.4's descendants of nodes on proper directed paths.
- Definition 4 requires avoiding that forbidden set and blocking all proper
  non-causal paths. Definition 6 and Theorem 7 give the equivalent proper
  back-door-graph separation test; in a DAG, it removes the exposure's outgoing
  edges that start proper causal paths.
- Definition 12 gives `Adjust(X,Y,G) = An(X ∪ Y) \ (X ∪ Y ∪ Forb)` for DAGs.
  Corollary 15 states that this canonical set is valid exactly when an adjustment
  set exists. The engine still brute-forces every allowed subset, so this theorem
  is a cross-check and witness aid rather than a single point of correctness.

Primary source: [JMLR paper, Definition 3–6 and Corollary 15](https://www.jmlr.org/papers/volume18/16-319/16-319.pdf).

## V-02 — Conditional instruments

Resolved against Brito and Pearl (2002) and the official DAGitty
manual/source.

- Brito and Pearl establish the graphical conditional-IV setting for linear models.
- The DAGitty manual states the operational conditional form: given a covariate
  set, the instrument remains connected to exposure and is separated from outcome
  after every outgoing exposure edge is removed. This matches §3.6's relevance and
  exclusion/exogeneity checks.
- The literature/DAGitty ancestral-instrument search is broader than v1's explicit
  non-descendance rule. The product intentionally adds `({Z} ∪ W) ∩ De(X) = ∅` as
  a conservative total-effect restriction. It is therefore a sound subset, not a
  claim of exhaustive literature-equivalent IV enumeration; the child-of-exposure
  negative fixtures exercise exactly the excluded failure mode.

Primary sources: [Brito & Pearl (2002)](https://escholarship.org/uc/item/0gj1b2nx)
and [official DAGitty manual, §5.5.2](https://dagitty.net/manual-3.x.pdf).

**v1.x relaxation note (finding: unsafe as a drop-in).** Item 10 of §2.6
asked to widen v1's conservative `Z, W ∉ De(X)` toward Brito & Pearl's
ancestral-instrument family. A prototype in `src/engine/iv.ts` (kept in the
git history) moved the non-descendance barrier to `De(Y)` and evaluated
relevance in `G_out(X)`. Property testing against random DAGs, and direct
computation on the existing negative fixture #16, showed the multiplicative
identity `Σ_{ZY·W} − TE · Σ_{ZX·W} = 0` failing under the relaxed rule: with
`Z ∈ De(X)` and `U` confounding `X` and `Y`, the observed `Cov(Z, Y)` picks
up a back-door term proportional to the confounding coefficient that the
mutilated-graph d-separation does not compensate for.

The correct literature relaxation (ancestral instruments) uses a different
mutilation — the "Z↦X→Y" arrow-cut graph in van der Zander, Textor &
Liśkiewicz — plus an ancestral restriction on `W`. Encoding this soundly is a
whole verification task on its own (call it V-11); the engine therefore
exposes an `IvCriterion` parameter surface today whose `"literature"` value
is a no-op relative to `"conservative"`. When V-11 is completed the same
parameter surface will pick up the correctly implemented enumeration without
a call-site change. The Owner review list carries the deferred pull-through.

## V-04 — Implied-CI parity semantics

Resolved against the official DAGitty manual and pinned source.

- The manual says displayed implications are minimal, observed-variable testable
  implications and explicitly says the display is not a basis set.
- In the pinned JavaScript source, `GraphAnalyzer.listMinimalImplications` loops
  over non-adjacent non-latent endpoint pairs and delegates to
  `listDseparators`, producing minimal separators for that pair.
- The product enumerates every minimal observed separator per non-adjacent pair;
  parity is consequently asymmetric. Each oracle implication must pass our
  d-separation query, and each emitted implication is independently re-verified
  by PROP-7. Set equality is not claimed as a global oracle contract.

Primary sources: [official DAGitty manual, §5.6](https://dagitty.net/manual-3.x.pdf)
and `jslib/graph/GraphAnalyzer.js` at pinned commit
`7a657776dc8f5e5ba4e323edb028e2c2aaf29327`.

## V-08 — Set-valued frontdoor

Resolved against Pearl (2009), _Causality: Models, Reasoning, and Inference_,
2nd ed., §3.3.2, and the vendored DAGitty source at the pinned commit.

Pearl's **Definition 3.3.3 (front-door)** applies to a **set** Z (not a single
node) and reads verbatim: a set of variables Z is said to satisfy the
front-door criterion relative to an ordered pair (X, Y) if
1. Z intercepts all directed paths from X to Y;
2. there is no back-door path from X to Z; and
3. all back-door paths from Z to Y are blocked by X.

For a set Z, conditions 2 and 3 are read set-wise — no back-door from X to any
element of Z, and every back-door from any element of Z to Y is blocked by X.

Pearl's **Theorem 3.3.4 (front-door adjustment)** gives the identifying
formula when Z satisfies the criterion and P(x, z) > 0:
`P(y | do(x)) = Σ_z P(z | x) Σ_{x'} P(y | x', z) P(x')`.

**Linear-Gaussian specialization used by the engine.** For jointly-Gaussian
(X, Z, Y) satisfying the criterion, with X scalar, Z a k-vector of mediators,
and Y scalar, the total-effect slope reduces to
`β_FD = β_{Y ~ Z · X}ᵀ · β_{Z ~ X}`,
where `β_{Z ~ X}` is the k-vector of OLS slopes of each `Z_i` on X (each
component `Σ_{X Z_i} / Σ_{X X}`) and `β_{Y ~ Z · X}` is the k-vector of OLS
coefficients on Z from the joint regression `Y ~ X + Z`, computed via a Schur
complement: `β_{Y ~ Z · X} = Σ_{ZZ · X}⁻¹ · Σ_{ZY · X}`. When k = 1 this
collapses to §3.9's singleton `β_FD = β_{M ~ X} · β_{Y ~ M | X}` exactly.

**Derivation.** Under linear-Gaussian, `E[Z | X = x] = β_{Z ~ X} · x` and
`E[Y | X = x', Z = z] = β_{Y ~ X · Z} · x' + β_{Y ~ Z · X}ᵀ · z`. Integrating
Pearl's formula over Z given x and marginalizing x' out (means zero):
`E[Y | do(x)] = β_{Y ~ Z · X}ᵀ · β_{Z ~ X} · x`, giving the stated slope.

**DAGitty parity.** The vendored source at pinned commit
`7a657776dc8f5e5ba4e323edb028e2c2aaf29327` does not expose a public
frontdoor-set enumeration — `fixtures/tools/dagitty/dagitty-node.js` mentions
"front-door" only in `activeBiasGraph` comments (lines 4728 and 5038), never
as a first-class output. The Tier-2 corpus therefore cannot import a DAGitty
frontdoor list; instead, every set Z the engine emits is cross-checked in the
existing d-separation oracle against §3.4's back-door graph on the auxiliary
`(X → Z)` and `(Z → Y | X)` queries — the same primitives Tier-2 already
uses for adjustment parity.

**Enumeration and minimality.** v1.x enumerates every subset Z of observed
non-role nodes within the graph bound (§3.1), applies conditions 1–3, keeps
inclusion-minimal witnesses, and orders results by (size ascending,
lexicographic idx). Singletons stay in the output — the singleton case is a
minimal-Z case whenever it applies.

Primary sources: Pearl, J. (2009). _Causality: Models, Reasoning, and
Inference_ (2nd ed.). Cambridge University Press, §3.3.2, Definition 3.3.3
and Theorem 3.3.4; vendored `dagitty-node.js` at commit
`7a657776dc8f5e5ba4e323edb028e2c2aaf29327` under `fixtures/tools/dagitty/`.
