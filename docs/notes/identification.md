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
