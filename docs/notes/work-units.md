# Work-Unit Notes

## P1 · Graph Core

Before implementation, the cited normative contract is restated here.

- **§3.0–§3.1:** A model is a finite DAG with at most 12 nodes and 24 directed
  edges. Nodes are observed, latent, or selection; only observed nodes may be
  exposure, outcome, or members of an adjustment set. Each node has a persistent
  creation `idx`. Ancestor and descendant closures include the node itself.
  Every displayed enumeration is complete within the cap; brute force is the
  correctness baseline.
- **§3.2:** A path is blocked when a conditioned non-collider occurs on it, or
  when a collider has neither itself nor any descendant conditioned. Two nodes
  are d-separated exactly when every path between them is blocked. The engine
  therefore implements both an independent reachability query and exhaustive
  simple-path witnesses, with agreement as a property.
- **§3.3:** With a selection rule, the effective conditioning set includes a
  virtual indicator child of the selected node. It opens colliders at that node
  and its ancestors but never blocks a fork or chain through the selected node.
  Causal paths distinguish open from overcontrolled; non-causal open paths are
  labeled in this order: selection-opened, collider-opened, confounding, then
  noncausal-open. Conditioning on descendants of proper causal-path nodes is a
  separate forbidden-adjustment warning even when a visible X–Y path is not
  changed.

## P2 · Identification

Before implementation, the cited normative contract is restated here.

- **§3.4:** For a total-effect adjustment set, forbid every descendant (inclusive)
  of a non-exposure node on a proper directed exposure-to-outcome path, plus the
  exposure itself. A candidate is valid exactly when it contains no forbidden
  node and d-separates exposure and outcome in the proper-backdoor graph formed
  by cutting the exposure's outgoing edges that begin proper causal paths.
  Enumeration is brute-force over observed, non-selection candidates and returns
  every inclusion-minimal set, minimum-size sets, empty-set validity, and a
  witness if none exists.
- **§3.5:** v1 searches singleton observed mediators only. A mediator applies
  only if at least one directed exposure-to-outcome path exists, it intercepts
  every such path, no open backdoor connects exposure to mediator, and every
  mediator-to-outcome backdoor is blocked by the exposure.
- **§3.6:** A conservative conditional instrument is an observed Z and observed
  W set, all non-descendants of the exposure, for which Z remains d-connected to
  exposure given W in the original graph and d-separated from outcome given W
  after every outgoing exposure edge is cut. The engine enumerates all Z/W pairs
  and keeps every inclusion-minimal W for each Z.
- **§3.7:** For each non-adjacent observed pair, enumerate every inclusion-minimal
  observed separating set. Under active selection, the virtual indicator is
  implicitly conditioned in each query; an emitted implication is therefore a
  claim for the selected regime, never a data test.

## P3 · SCM And Simulation

Before implementation, the cited normative contract is restated here.

- **§3.8:** In topological order every node is a zero-mean linear combination of
  its parents plus an independent Gaussian disturbance. Edge coefficients are in
  [-2, 2], disturbance SDs are in [0.05, 3], and the matrix stores an edge i→j
  at `B[i][j]`, so the covariance is `(I − Bᵀ)⁻¹ Ω (I − Bᵀ)⁻ᵀ`. Non-finite or
  ill-conditioned covariance blocks estimator readouts rather than producing a
  misleading number.
- **§3.9:** Covariance has two independent calculations: matrix propagation and
  the ordered-pair trek sum. Total effect likewise has a directed-path sum and a
  matrix entry. Schur complements power partial covariance, OLS, IV, and
  singleton-frontdoor population estimands; valid adjustment and IV identities
  are testable without a division. IV output has explicit undefined and weak
  first-stage thresholds.
- **§3.10–§3.11:** One active `S > τ` rule uses the marginal SD of S, Acklam
  quantiles, and `Σ − δ γγᵀ`; it is partial conditioning, not a graph edit.
  Design standard errors and power use the resulting covariance and realized
  effective sample size, while IV's test-only standard error is never presented
  as a v1 design preview.
- **§3.12–§3.14:** Randomness is one global mulberry32 stream, mapped to the
  open interval by `(raw + 0.5) / 2³²`, with Box–Muller cos then sin consumption
  per node. Parent summation and edge order follow persistent `idx`; each odd
  column discards its final pair mate. Samples use two-pass demeaning covariance,
  log-spaced generated-row checkpoints, and fewer than 50 selected rows is an
  insufficient-result state. The production integrity assertion compares both
  covariance and total-effect calculations, while finite-sample convergence is a
  statistical test only.
