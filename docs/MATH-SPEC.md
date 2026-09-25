# Dagger Board — Normative Math Contract

The normative mathematics for this repository: objects and notation, the graph-size bound and
completeness contract, d-separation, path classification, adjustment sets, the front-door
criterion, instrumental variables, testable implications, the linear-Gaussian SCM and its closed
forms, selection truncation, the design-surface formulas, the simulation kernel, the exact-vs-
simulated boundary, tolerances and the global consistency identities, and the CPDAG.

**This document is authoritative.** Source comments cite it by section number as `§X.Y`; a citation
that names a document must name this one. Section numbering is part of the contract because
`npm run check:citations` resolves every citation in `src/`, `scripts/`, `tests/`, and `fixtures/`
against these headings.

---

Engine code implements this contract, executable fixtures arbitrate implementation behavior, and the
cited literature governs the mathematical definitions. Supporting research notes live in
`docs/notes/`.

### 3.0 Objects & notation

- DAG `G = (V, E)`, finite, acyclic (enforced at edit time). Node kinds: `observed`, `latent`, `selection`. Exposure `X`, outcome `Y` — exactly one each, both `observed`, X ≠ Y.
- `Pa/Ch/An/De(v)` = parents/children/ancestors/descendants, **inclusive of v** for An/De (state this convention everywhere it's used).
- Conditioning set `Z` ⊆ observed ∖ {X, Y}. Latent and selection nodes can never appear in Z or in adjustment sets; an inactive selection node participates in paths like any other node but can never be conditioned on. When a selection rule is active (§3.10), the engine models it as conditioning on a **virtual indicator** `I_S` — an engine-internal child S → `I_S`, never rendered and never counted against §3.1: every d-separation query runs on the augmented graph with `I_S` in the conditioning set. Consequences (deliberate — they match §3.10's exact math): selection **opens** colliders at S and at every ancestor of S (descendant rule), but does **not block** chains or forks passing through S. Threshold selection is partial conditioning; paths through S stay qualitatively open while §3.10 quantifies the attenuation. Never model selection as `S ∈ Z` — that overstates blocking and contradicts the truncated-covariance oracle (e.g., it would call a fork X←S→Y "blocked" while the exact bias is nonzero).
- A **path** is a sequence of distinct nodes with an edge (either orientation) between consecutive nodes. A **directed path** follows edge directions.

### 3.1 Graph-size bound & completeness contract

- Hard cap, enforced by the editor: **≤ 12 nodes and ≤ 24 edges** (all kinds counted). The editor refuses further additions with a friendly explanation.
- Within the cap, every enumeration the product displays (paths, treks, minimal adjustment sets, minimal separators, frontdoor sets, instruments) is **guaranteed complete** — brute force is acceptable and is the ground truth; cleverer algorithms are optimizations that must agree with brute force in tests.
- Executable performance budgets at the cap use the committed adversarial fixture documented in
  `docs/perf.md`.

### 3.2 d-separation

**Definition.** A path p is **blocked** by Z iff some non-endpoint node w on p satisfies: (i) w is a non-collider on p (chain `a→w→b` / `a←w←b` or fork `a←w→b`) and w ∈ Z; or (ii) w is a collider on p (`a→w←b`) and neither w nor any descendant of w is in Z. X and Y are **d-separated** by Z iff every X–Y path is blocked. (Pearl, _Causality_ 2009, §1.2.3.)

**Dual implementation (both required):**

- (a) Reachability algorithm (Bayes-Ball / Shachter 1998; equivalently Koller & Friedman's `Reachable`), O(|V|+|E|), for boolean queries.
- (b) Exhaustive simple-path enumeration with per-path blocked/open status and the witness node(s) that block or fail to block — this powers the UI.
- **Agreement is a standing property test:** on random DAGs within the bound with random Z, (a) and (b) must return identical verdicts.

### 3.3 Path classification (relative to X, Y, Z, active selection S)

Effective conditioning set: `Z⁺ = Z ∪ {I_S if a selection rule is active}` (virtual indicator, §3.0). `I_S` is a leaf lying on no X–Y path: it can open colliders (descendant rule) but can never block a path — selection never blocks; only Z blocks.

- **Causal path**: directed path X→…→Y.
  - open under Z⁺ → `causal-open`; blocked → `causal-blocked` and flag **overcontrol** (the blocker is a node _on the path_ — a mediator — in Z) for total-effect queries. A mediator's _descendant_ in Z does **not** block this path (descendants only open colliders, never block chains); that case biases without blocking and is caught by the forbidden-conditioning warning below, not by a path label.
- **Non-causal path**: any other X–Y path.
  - **Backdoor path** if its first edge points into X.
  - open under Z⁺ → **biasing path**; blocked → inert.
- Secondary labels (deterministic rules, applied in this order; a path may carry several, the first applicable is its primary label):
  1. `selection-opened`: open under Z⁺ but blocked under Z (deactivating the selection rule closes it).
  2. `collider-opened`: some collider w on the path has opening witness set `O_w = ({w} ∪ De(w)) ∩ Z⁺ ≠ ∅`, and removing **all of O_w** from Z⁺ blocks the path at w. The narration names the full witness set ("open because you conditioned on D1 and D2, descendants of collider C").
  3. `confounding`: open backdoor path with no collider on it (pure common-ancestor trek).
  4. `noncausal-open` otherwise.
- The UI narrates from these labels ("open because you conditioned on `C`, a collider descendant…"). Labels are engine outputs, not UI heuristics.
- **Forbidden-conditioning warning (independent of any path's status):** whenever `Z ∩ forb(X,Y) ≠ ∅` (§3.4), the classifier emits a `forbidden-adjustment` warning naming the offending nodes. Rationale: conditioning on a descendant of a mediator (or of Y) biases the total effect _without blocking or opening any X–Y path_ — path labels alone cannot reveal it, yet the §3.9 closed form will show nonzero bias, and the two readouts must never silently disagree. The Prove conditioning playground and the Design surface display this warning whenever it fires.
- **Selection honesty rule for copy:** under an active selection rule, labels are qualitative (indicator conditioning); magnitudes — including the partial attenuation of paths through S — come only from §3.10. UI copy never claims a path through S is "blocked by selection".

### 3.4 Adjustment sets (total effect, DAGs)

**Criterion (generalized adjustment criterion, restricted to DAGs).** Let `cn(X,Y)` = all nodes lying on **proper causal paths** from X to Y, _excluding X_ (proper = the path's only occurrence of X is its start; on a DAG with a single X this is every directed X→…→Y path). Let `forb(X,Y) = De(cn(X,Y)) ∪ {X}` (De inclusive). Z satisfies the adjustment criterion relative to (X,Y) iff:

- (a) `Z ∩ forb(X,Y) = ∅`, and
- (b) Z d-separates X and Y in the **proper backdoor graph** `G^pbd` = G with every edge X→w removed where w ∈ cn(X,Y) ∩ Ch(X). (Intuition: Z blocks every proper non-causal path from X to Y. The two phrasings can differ only on paths whose first edge was removed, and condition (a) automatically blocks those; the `G^pbd` form is the normative, implemented one. The adjustment section in `docs/notes/identification.md` records the equivalence.)

Z ranges over observed, non-selection nodes only, excluding X and Y. (Shpitser, VanderWeele & Robins 2010; Perković et al., JMLR 2018; van der Zander, Liśkiewicz & Textor, JMLR 2019. Paraphrase confirmed against the papers — `docs/notes/identification.md`.)

**Outputs (all within the bound, brute-force ground truth):**

- All **minimal** valid sets (no valid proper subset), all minimum-size sets, and whether ∅ is valid ("no adjustment needed").
- "**No valid adjustment set exists**" with witnesses: the open proper non-causal paths that remain open under the best allowed candidate set. Use the canonical candidate `Adjust(X,Y) = An({X,Y}) ∖ (forb ∪ {X,Y} ∪ latent ∪ selection)`: the literature's existence theorem says a valid observed set exists iff this canonical set is valid; regardless, brute-force enumeration independently establishes existence within the bound, so correctness never hinges on the theorem — it serves as cross-check and witness generator.
- Enumeration method: iterate candidate subsets in increasing size; validity-check each via (a)+(b); keep minimal ones (discard any superset of a kept set). At the bound this is ≤ 2^10 subsets × an O(|V|+|E|) d-sep check — trivial.

**Under active selection:** adjustment validity is computed and displayed on the selection-free model
(no `I_S` in the query), with an explicit banner that recoverability under selection is outside the
certification scope; the bias engine in §3.10 remains selection-aware.

### 3.5 Frontdoor criterion

M ⊆ observed ∖ {X,Y} satisfies the frontdoor criterion relative to (X,Y) iff (Pearl 2009, Def. 3.3.3):

1. M intercepts every directed path X→…→Y;
2. there is no open backdoor path from X to M (empty conditioning set);
3. every backdoor path from M to Y is blocked by X.

The engine enumerates every nonempty subset of eligible observed nodes within the bound, retains all
inclusion-minimal front-door sets, and orders them by size and node creation order. A front-door
verdict requires at least one directed X→Y path and a nonempty M; the empty set is never reported as
a witness. Prove displays every minimal set, and Simulate and Design evaluate the corresponding
set-valued estimand (§3.9).

### 3.6 Instrumental variables (total effect, linear SCM)

**Criterion (conservative and sound; completeness deliberately sacrificed).** Z (observed, ∉ {X,Y}) is an instrument for the total effect of X on Y given W ⊆ observed ∖ {X,Y,Z} iff, with `G_out(X)` = G minus all edges out of X:

1. **Non-descendance:** `({Z} ∪ W) ∩ De(X) = ∅` (De inclusive of X).
2. **Relevance:** Z is d-connected to X given W in G. (Given condition 1, this is equivalent to d-connection in `G_out(X)`; relevance guarantees `Σ_ZX·W ≠ 0` only generically — see the weak-instrument guard, §3.9.)
3. **Exclusion/exogeneity:** Z is d-separated from Y given W in `G_out(X)`.

Soundness: with condition 1, (Z, W) have the same joint law in the original and mutilated models, so condition 3 forces `Σ_ZỸ·W = 0` where `Y = TE·X + Ỹ`; hence `Σ_ZY·W = TE·Σ_ZX·W`. The restriction may reject some (Z,W) pairs the literature admits (e.g., W containing descendants of X that are non-descendants of Y); this is required by the total-effect target and `G_out(X)` formulation.

Removing all X-outgoing edges (not just X→Y) targets the **total** effect; removing only X→Y targets a direct-edge coefficient and is not this criterion. The engine enumerates all (Z, W) pairs within the bound and reports every inclusion-minimal W for each valid Z, ordered by size and node creation order. See `docs/notes/identification.md` for the literature trace and counterexample that protects the descendant barrier.

### 3.7 Testable implications

For every non-adjacent pair of observed nodes (u,v): enumerate all **minimal separating sets** Z ⊆ observed ∖ {u,v} (within the bound, brute force; if an active selection rule exists, the virtual indicator `I_S` (§3.0) is implicitly added to every candidate — so a chain u→S→v is _not_ reported as separated merely because of selection, and collider-at-S dependence induced by selection is respected). Emit `u ⊥ v | Z` for each minimal Z; emit nothing for pairs that cannot be separated by observed nodes (latent confounding). The parity suite verifies DAGitty-listed implications directly against the independent d-separation oracle, and every emitted implication is rechecked by definition; set equality is not required because DAGitty exposes a basis. The UI displays these as model claims for later testing and exports them in the ADR. Under active selection they are explicitly scoped to the selected regime.

### 3.8 Linear-Gaussian SCM

- Structural equations over a topological order: `x_j = Σ_{i ∈ Pa(j)} b_ij · x_i + ε_j`, `ε_j ~ N(0, σ_j²)` independent; all means 0 (no intercepts).
- Parameters: edge coefficients `b_ij ∈ [−2, 2]` (UI range; "randomize" draws |b| uniformly from [0.3, 0.9] with a fair random sign, seeded — magnitudes bounded away from 0 so demonstrations stay legible); error SDs `σ_j ∈ [0.05, 3]` (concrete UI minimum; never 0), default 1.
- **Matrix convention (fix it once, test it):** let `B` be the |V|×|V| matrix with `B[i][j] = b_ij` for edge i→j, else 0. Then `x = Bᵀx + ε`, so `x = (I − Bᵀ)⁻¹ ε` and the model-implied covariance is
  `Σ = (I − Bᵀ)⁻¹ · Ω · (I − Bᵀ)⁻ᵀ`, with `Ω = diag(σ_j²)`.
  Sanity anchor (two nodes, X→Y with coefficient b, σ=1 both): `Σ_XX = 1`, `Σ_XY = b`, `Σ_YY = b² + 1`.
- **Ill-conditioning guard:** if `min eigenvalue(Σ) < 1e−9 · max eigenvalue(Σ)` (or any non-finite entry), the engine flags the parameterization as degenerate and blocks estimator readouts with an explanation, instead of rendering garbage.

### 3.9 Closed forms (the exact oracle)

All of the following are **exact** (pure arithmetic on Σ; tolerance policy in §3.14):

- **Trek rule (independent second computation of Σ).** A trek between u and v is an **ordered pair** of directed paths (P₁: s→…→u, P₂: s→…→v) with a common source s (either path may have length 0; the two paths may share nodes and edges). Its monomial is `σ_s² · Π(edge coefficients on P₁ and P₂)` (a length-0 path contributes an empty product). Then `Σ_uv = Σ over all treks between u and v` (Wright 1934; trek rule as in Sullivant et al.). Ordered matters when u = v: (A,B) and (B,A) are distinct treks for A ≠ B — equivalently `Σ_uu = Σ_s σ_s² · (Σ_{directed paths s→u} Π coeffs)²`; enumerating unordered pairs halves the cross terms and corrupts every variance. Enumerated exhaustively within the bound.
- **Total effect:** `TE(X→Y) = Σ over directed paths X→…→Y of Π(edge coefficients) = [(I − Bᵀ)⁻¹]_{Y,X}` — two computations, must agree.
- **Partial covariance (Schur complement):** for disjoint U,V,Z: `Σ_{UV·Z} = Σ_UV − Σ_UZ Σ_ZZ⁻¹ Σ_ZV`.
- **OLS estimand** (population slope of X in the regression of Y on X and Z): `β(Z) = Σ_{XY·Z} / Σ_{XX·Z}`. **Population bias:** `Bias(Z) = β(Z) − TE`, the gap between the estimator's population target (its probability limit) and the true effect; simulated estimates converge to it as n grows. It is _not_ `E[estimate] − TE` at finite n — for just-identified IV that expectation does not even exist, so the term "expected bias" is deliberately avoided throughout.
- **Theorems as property tests:** Z valid by §3.4 ⇒ `Bias(Z) = 0`; (Z,W) a valid instrument by §3.6 ⇒ `Σ_{ZY·W} − TE · Σ_{ZX·W} = 0` (multiplicative; within the 1e−9 relative rule — division-free, remains testable at exact denominator cancellation).
- **IV estimand:** `β_IV = Σ_{ZY·W} / Σ_{ZX·W}`.
- **Weak/undefined-instrument guard.** Let `ρ = Σ_{ZX·W} / √(Σ_{ZZ·W} · Σ_{XX·W})` (first-stage partial correlation; both denominators are conditional variances, strictly positive since Σ is PD). If `|ρ| < 1e−8`: the IV estimand is **undefined** — render an explicit "instrument is uncorrelated with exposure under this parameterization" state, never a number. If `1e−8 ≤ |ρ| < 0.01`: render the estimand with a **weak-instrument warning**. Thresholds `1e−8` and `0.01` are engine constants exposed in UI copy. §3.11's IV SE and §3.14's IV sim-vs-plim tolerance row are skipped for undefined rows.
- **Frontdoor estimand (set M):** `β_FD = β_{Y~M·X}ᵀ β_{M~X}`, where `β_{M~X}` contains the marginal regression slope of each mediator on X and `β_{Y~M·X}` is the joint coefficient vector on M from `Y ~ X + M`, computed by Schur complement. The singleton case reduces to `β_{M~X} · β_{Y~M|X}`.
- **Worked example (also a Tier-1 fixture — hand-derived, engine must reproduce exactly).** M-bias: latent U₁, U₂; observed M; X exposure; Y outcome. Edges: U₁→X, U₁→M, U₂→M, U₂→Y, all coefficients 0.5; X→Y coefficient 0 (true effect zero); all σ = 1. Then `Σ_XM = 0.25`, `Σ_MY = 0.25`, `Σ_MM = 1.5`, `Σ_XX = 1.25`, `Σ_XY = 0`. Naive: `β(∅) = 0` — unbiased. Adjusting for M: `Σ_{XY·M} = −(0.25·0.25)/1.5 = −1/24`, `Σ_{XX·M} = 1.25 − 0.25²/1.5 = 29/24`, so `β({M}) = −1/29 ≈ −0.03448`. Conditioning on the innocent-looking pretreatment covariate _created_ bias.

### 3.10 Selection (truncation) closed form — one active filter

Selection rule: keep samples with `S > τ`, S the active selection node, threshold set in the UI as a quantile q ∈ [0.01, 0.99]. Let `s_S = √Σ_SS` denote S's **marginal** SD — not the disturbance SD σ_S of §3.8; they differ whenever S has parents. Then `τ = s_S · Φ⁻¹(q)` (means are 0). Symbols σ_j with a node subscript are reserved for disturbance SDs everywhere in §3; s_v with a subscript means the marginal SD `√Σ_vv`.

**Exact result used as oracle.** For jointly Gaussian (V, S): decompose V = aS + U with U ⊥ S, `a = Σ_{VS}/Σ_SS`. With `α = τ/s_S = Φ⁻¹(q)`, inverse Mills `λ(α) = φ(α)/(1−Φ(α))`, and `δ = λ(λ−α) ∈ (0,1)`: `Var(S | S>τ) = Σ_SS(1−δ)`, hence
`Cov(V | S>τ) = Σ − δ · γγᵀ`, where `γ = Σ_{·S}/s_S`.
The truncated joint is not Gaussian, but OLS slope limits depend only on second moments (slopes are invariant to the mean shift), so **the plim of every estimator readout (naive, adjusted, IV) under selection = the same Schur formulas of §3.9 applied to the truncated covariance**. Effective sample size: `n_eff = n · (1 − Φ(α)) = n · (1 − q)`. This closed form is the quantitative twin of §3.0's indicator-conditioning rule: selection adds dependence at colliders on S (and its ancestors) and only _partially_ controls paths through S — the pure fork/chain case shrinks by exactly `1 − δ`, never to zero — so the qualitative labels and the exact numbers tell one story.

Simulation demonstrates the result by generating the full sample, filtering rows by `S > τ`, and
showing estimators converge to these probability limits. The public UI exposes one active filter.
The engine's multi-filter helper applies a labeled sequential-Gaussian approximation because joint
orthant truncation has no equivalent elementary closed form.

### 3.11 Design-surface formulas

**Row universe.** Rows = **naive (∅)** · every **minimal** valid adjustment set composed of measured nodes (§3.4's enumeration re-run over the measured universe — a subset of measured nodes may be minimal-valid even when it isn't minimal over all observed nodes) · every instrument (Z, all inclusion-minimal W per Z, per §3.6) with Z and W both measured · every minimal front-door set whose mediators are measured. **Deterministic row order:** zero-population-bias rows first, then ascending `|population bias|`; ties by ascending SE, then ascending set size, then lexicographic by node `idx`. **Best-row highlight** = the first row of that order **iff** it has zero population bias and (under selection) carries the selection banner honestly; if no zero-bias row exists, no best-row highlight is shown — the surface never crowns a biased estimator.

For each feasible estimator under the declared design:

- **Identified (selection ignored)** [column header when a selection rule is active] / **Identified?** [column header when no selection rule is active]: from §3.4–3.6 restricted to measured nodes. Under an active selection rule this column reports the selection-free verdict (§3.4 banner applies — the header change itself, not just a banner, announces the scope); the bias column is selection-aware and exact — the two can legitimately diverge, and the banner owns the explanation.
- **Population bias:** §3.9/§3.10 closed forms (exact).
- **OLS SE preview:** asymptotic `SE(β̂) = sqrt( Σ_{YY·(X∪Z)} / (n_eff · Σ_{XX·Z}) )`, computed on the truncated covariance when selection is active. Label as asymptotic/homoskedastic-Gaussian (which the model is); under selection the truncated model is neither Gaussian nor exactly homoskedastic, so there the label reads "asymptotic approximation". When `n_eff < 50`, flag SE/power as unreliable ("selected sample too small for asymptotic previews") instead of presenting them plainly.
- **Power preview** for the two-sided test of β = 0 at α = 0.05: `power = Φ(−z_{0.975} + |β(Z)|/SE) + Φ(−z_{0.975} − |β(Z)|/SE)` (second term usually negligible; compute both).
- **IV SE preview:** in the just-identified case, `SE(β̂_IV) = sqrt( σ_u² · Σ_{ZZ·W} / (n_eff · Σ_{ZX·W}²) )` with `σ_u² = Σ_{YY·W} − 2·β_IV·Σ_{XY·W} + β_IV²·Σ_{XX·W}`. Defined IV rows receive the same two-sided power calculation; undefined rows have neither SE nor power. The formula is documented in `docs/notes/scm.md`.
- Front-door rows show the estimand and exact population bias. Their SE and power are unavailable because no sampling-variance approximation is implemented for the set-valued estimator.

### 3.12 Simulation kernel

- RNG: **mulberry32** (32-bit seed) for uniforms; **Box–Muller (basic form)** for normals. Every random element in the product (data, randomized parameters) flows from a user-visible seed. Same seed + same engine ⇒ identical output. Implement mulberry32 verbatim:

```ts
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}
```

**Uniform mapping (pinned):** `u = (mulberry32_output + 0.5) / 2³²`, which places u strictly inside (0, 1) — zero and one are excluded by construction, so `√(−2 ln u₁)` can never overflow. **Box–Muller pair (pinned):** `z₁ = √(−2 ln u₁) · cos(2π u₂)`, `z₂ = √(−2 ln u₁) · sin(2π u₂)`, consumed in that order. The tests include known-input vectors and the poison seed `0x92d4860b`, whose first raw mulberry32 output is exactly 0; the mapped uniform is `0.5/2³² ≈ 1.164e−10` and all generated values remain finite.

- **Determinism caveat (contract-level honesty):** `Math.log/cos/sqrt` are not bit-identical across JS engines. Reproducibility is guaranteed _per engine_; golden-value tests pin the CI/test engine (Node, version pinned in `.nvmrc`); cross-engine assertions use statistical tolerances only (§3.14). Never write a test that assumes cross-engine bit equality.
- Generation: topological order, column-wise `Float64Array` per node, n ∈ [100, 1,000,000] (UI default 10,000). **Determinism of order:** every node carries a persistent integer `idx` (creation order, preserved verbatim by URL codec and JSON). **DAGitty text is idx-lossy:** DAGitty model text has no native idx field, so import assigns idx by declaration order; seeded replay identity is guaranteed across URL/JSON round-trips only. Topological ties break by ascending `idx`. **Per-node accumulation order (float non-associativity):** for `x_j = Σ_{i ∈ Pa(j)} b_ij · x_i + ε_j`, parents are sorted by ascending `idx` and accumulated left-to-right in float64. Edge storage is canonicalized — sorted by (child idx, parent idx) — on every import and load, so an edit-and-reimport sequence yields bit-identical simulation output at a fixed seed. **RNG consumption rule:** one global mulberry32 stream; each node's column draws ⌈n/2⌉ Box–Muller pairs in generation order; when n is odd the final pair's second normal is discarded, never carried into the next column. Selection filtering follows §3.10. Browser runs execute in a module Web Worker and transfer the generated buffers back to the main thread; non-browser callers use the equivalent chunked async path. **Memory budget:** at n = 10⁶ across 12 nodes, 12 Float64 columns ≈ 96 MB before kept-row copies; peak additional memory ≈ 2× column storage. The UI caps n at 10⁶.
- Sample estimators mirror the closed forms structurally: two-pass sample covariance matrix → same Schur/slope formulas. The two-pass demeaning _is_ the intercept: under selection the sample means shift, so slopes must never be computed from raw non-central moments. Convergence series: estimates recorded at log-spaced checkpoints (e.g., 100, 316, 1k, 3.16k, 10k, …, n) for the convergence sparkline; checkpoints index **generated** rows, and each estimate uses the kept rows among the first k generated. **Small-sample guard:** any readout (checkpoint or full run) resting on fewer than 50 kept rows renders as "insufficient selected sample", never as a number.
- Normal CDF/quantile: `Φ` uses a double-precision erfc rational approximation; `Φ⁻¹` uses **Acklam's algorithm** with branch points `0.02425` and `0.97575`, followed by one Halley correction. Tests pin the central and tail vectors and the round-trip property `Φ(Φ⁻¹(p)) = p` on `p ∈ [1e−12, 1 − 1e−12]`. Sources and accuracy notes are in `docs/notes/erf.md`.

### 3.13 Exact vs simulated — the boundary, in one table

| Quantity                                         | Status                                                                                                       | Source    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------- |
| d-separation, paths, classifications             | exact (set/boolean)                                                                                          | §3.2–3.3  |
| adjustment sets, frontdoor, IV, implied CIs      | exact, complete within bound (footnote below)                                                                | §3.4–3.7  |
| Σ, TE, estimands, population biases, truncated Σ | exact closed form (float)                                                                                    | §3.8–3.11 |
| SE preview, power preview                        | **closed-form asymptotic approximation** (exact arithmetic on Σ, approximate as a sampling statement; §3.11) | §3.11     |
| simulated estimates & convergence                | stochastic **demonstration** that must converge to the closed forms                                          | §3.12     |

Simulation exists to _demonstrate_; it is never the source of a displayed "truth". Any number shown as truth comes from the left three rows.

Footnote (row 2): complete _per implemented strategy_ within the bound; the strategy family is
sufficient-only and does not include general do-calculus/ID.

### 3.14 Tolerances & global consistency identities

| Check                                                               | Tolerance                                             |
| ------------------------------------------------------------------- | ----------------------------------------------------- |
| Boolean/set-valued results (d-sep, sets, paths)                     | exact equality                                        |
| Trek-rule Σ vs matrix Σ; path-sum TE vs matrix TE                   | `abs(a-b) <= 1e-9 * max(1, abs(a), abs(b))`           |
| Pure-arithmetic closed forms vs independently coded test references | same 1e−9 relative rule                               |
| Φ-dependent closed forms (truncation, power)                        | absolute 1e−6                                         |
| Simulated estimate vs plim (fixed seeds)                            | `abs(est-plim) <= 4 * SE(est)` using realized moments |
| Golden seeds (pinned engine)                                        | bit-identical                                         |

**Global consistency identity — runs on every simulation, in production:** the engine computes Σ both ways (matrix and trek rule) and TE both ways (matrix and path sum); if either pair disagrees beyond tolerance, or the ill-conditioning guard trips, the UI shows an **engine-integrity error state and refuses to display results**. When selection is active, the truncated-Σ computation additionally asserts `δ ∈ (0,1)` and positive-semidefiniteness. The 4·SE simulated-vs-plim rule is a repeatable statistical test, not a production correctness identity; finite-sample deviation never triggers an engine-integrity error.

---

### 3.15 CPDAG — Markov equivalence class of the drawn DAG

Two DAGs are Markov-equivalent iff they share a skeleton and the same unshielded colliders (Verma–Pearl 1990). The **CPDAG** (completed PDAG / essential graph) of the drawn DAG has a **compelled** edge `a → b` wherever every equivalent DAG orients it that way, and an **undirected** (reversible) edge wherever the orientation is a modelling assumption the conditional-independence structure cannot decide. For a design instrument this is the "which arrows are assumptions?" readout: compelled arrows are forced by the data-testable independencies; reversible arrows are choices.

Algorithm (`src/engine/cpdag.ts` — pure, structured output the UI narrates): orient the unshielded colliders, then propagate with Meek's rules R1–R3 to a fixpoint (R4 is only for background-knowledge orientation, which the product does not accept). `equivalenceClassDags` additionally enumerates every member DAG (each reversible edge oriented either way, kept acyclic with an unchanged unshielded-collider set), bounded by an internal 4,096-member cap.

**Scope.** The equivalence class is computed over the DAG **as drawn**, across all node kinds. Observable-margin equivalence with latents marginalised (MAG/PAG, FCI) is outside the product's scope. The implementation is verified against DAGitty's `GraphTransformer.dagToCpdag` on hand-derived fixtures plus 300 seeded random DAGs (`tests/unit/cpdag.test.ts`) and surfaced in Prove.
