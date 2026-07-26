# SCM Research Notes

## V-09 — Conditional IV Test Standard Error

Resolved against the standard just-identified IV derivation. For
the residualized variables after controls `W`, the just-identified estimator is
`Σ_ZY·W / Σ_ZX·W`. Under the homoskedastic linear model its asymptotic variance
is the residual-error variance times `Var(Z·W)` divided by `n · Cov(Z,X·W)^2`.
That is exactly the contract's test-only form:

`SE = sqrt(σ_u² Σ_ZZ·W / (n_eff Σ_ZX·W²))`,

where `σ_u² = Σ_YY·W − 2 β_IV Σ_XY·W + β_IV² Σ_XX·W`. The engine applies it
only to a defined first stage and uses the run's realized moments for the
simulation tolerance; it does not expose IV power or an IV SE as a v1 design
readout.

Primary source: the just-identified derivation and its homoskedastic asymptotic
variance in [Wooldridge-referenced IV lecture material](https://amsdottorato.unibo.it/8813/1/PhdThesis_Ievoli.pdf),
eqs. 2.10–2.13. The residualization extension follows the Frisch–Waugh–Lovell
form used by the contract.

## Golden-Seed Runtime Pin

The golden test runtime is Node 20.20.2, matching `.nvmrc` and the declared
engine range. Same-runtime seeded runs are bit-identical because the generator,
stream order, edge ordering, and arithmetic order are pinned. Cross-engine
bit-equality is intentionally not asserted: ECMAScript classifies `Math.sin`,
`Math.cos`, and `Math.log` as implementation-approximated, so the contract uses
numeric tolerances outside the pinned engine.

Primary sources: [Node 20.20.2 archive](https://nodejs.org/en/download/archive/v20.20.2)
and [ECMAScript Math specification](https://tc39.es/ecma262/2025/multipage/numbers-and-dates.html).
