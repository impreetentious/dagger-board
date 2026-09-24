# SCM research notes

## Conditional-IV standard error

For variables residualized against controls `W`, the just-identified estimator
is `Σ_ZY·W / Σ_ZX·W`. Under a homoskedastic linear model its asymptotic standard
error is

`SE = sqrt(σ_u² Σ_ZZ·W / (n_eff Σ_ZX·W²))`,

where `σ_u² = Σ_YY·W − 2 β_IV Σ_XY·W + β_IV² Σ_XX·W`. The engine applies the
formula only when the first stage is defined. Design uses the population moments
and effective sample size for its IV uncertainty and power preview; simulation
tests compare realized moments with the same identity.

Primary source: the just-identified derivation and homoskedastic asymptotic
variance in [Wooldridge-referenced IV lecture material](https://amsdottorato.unibo.it/8813/1/PhdThesis_Ievoli.pdf),
eqs. 2.10–2.13. Residualization follows the Frisch–Waugh–Lovell theorem.

## Seeded-run portability

The golden test runtime is Node 20.20.2, matching `.nvmrc` and the declared
engine range. Same-runtime seeded runs are bit-identical because the generator,
stream order, edge ordering, and arithmetic order are pinned. Cross-engine bit
equality is intentionally not asserted: ECMAScript classifies `Math.sin`,
`Math.cos`, and `Math.log` as implementation-approximated, so tests outside the
pinned engine use numeric tolerances.

Primary sources: [Node 20.20.2 archive](https://nodejs.org/en/download/archive/v20.20.2)
and [ECMAScript Math specification](https://tc39.es/ecma262/2025/multipage/numbers-and-dates.html).
