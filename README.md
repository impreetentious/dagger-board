# DAGGERBOARD

> Draw your assumptions. See your bias. Before the data.

## The problem

Every strategy deck, A/B readout, and observational analysis makes causal claims — and almost all of them are made by vibes. "We adjusted for everything we could think of." "The uplift is obvious from the chart." The graphical machinery to actually check those claims — d-separation, adjustment criteria, do-calculus — has existed for decades, but it lives in academic tools built for epidemiologists, not for the people shipping decisions.

## The instrument

This project is a pre-data instrument for stress-testing causal claims and study designs:

1. **Draw** your causal assumptions as a directed acyclic graph — observed, latent, and selection nodes; pick an exposure and an outcome.
2. **Prove** — the engine computes, _exactly_, what your assumptions already imply: whether your effect is identified by the classical strategies — covariate adjustment, front-door, instrumental variables — and exactly how (and it tells you honestly when its strategy set is exhausted rather than claiming non-identifiability), every minimal valid adjustment set, every biasing path, available instruments, frontdoor routes, and the conditional independencies your model claims are testable.
3. **Simulate** — the graph becomes a working structural causal model. Seeded, replayable data generation shows the precise bias your naive analysis would produce — confounding, collider conditioning, M-bias, selection, measurement error — and every simulated estimate converges to a closed-form population value the engine derives independently.
4. **Design** — declare what you can measure, how _well_ you can measure it, what you'll condition on, how your sample is selected, and how big it is. Get back which effects are identified under that design's measurement and conditioning choices, the exact population bias of each feasible estimator, a variance/power preview, and — since a noisy proxy is not the variable it stands in for — what each estimator recovers once your declared reliabilities are applied.
5. **Stress-test** — the verdict on every screen assumes the drawn graph is complete, so the sensitivity surface prices that assumption: the exact strength an _undrawn_ confounder would need, in partial R² with the exposure and with the outcome, to bring the estimate to zero or reverse its sign, with the drawn covariates placed on the same axes as calibration. And where the verdict is "not identified", the engine constructs a witness pair — two parameterizations of your graph that agree on every observable covariance and disagree about the effect.
6. **Learn** — a curriculum of canonical traps, each a playable scenario: you make the analysis call first, then the engine reveals what happened and the theory underneath.
7. **Communicate** — export an Analysis Design Record: the graph, the assumptions (including what you assumed _absent_), the chosen identification strategy, the known threats, and the robustness line that says how wrong the assumptions would have to be.

## What makes it different

- **Pre-data by design.** This is not a data-analysis tool. It interrogates the reasoning that comes before data — the part every existing tool skips past.
- **Honest about its own assumptions, quantitatively.** Most tools in this space stop at "conditional on your DAG". This one prices that condition: the sensitivity surface is Cinelli & Hazlett's omitted-variable framework, which is _exact_ in a linear model rather than approximate — and since this engine's models are linear-Gaussian by construction and pre-data, the confounder benchmarks are exact counterfactuals rather than bounds.
- **Exact where it claims to be exact.** Graph queries are complete combinatorics within the 12-node bound (see Limitations). Population biases come from closed forms (path-tracing rules on linear structural models), and every simulation runs under a live engine self-audit: the implied covariance matrix and the total effect are each computed two independent ways (matrix algebra vs. path/trek enumeration) and must agree to within 10⁻⁹, or the product shows an integrity error instead of a number. Simulated estimates are always displayed against their independently derived closed-form targets, so any drift is visible rather than silently absorbed.
- **Verified against the scholarly reference.** The algorithms are classical — Pearl's identification framework, the generalized adjustment criterion, Wright's path tracing. Results are fixture-tested for parity against DAGitty, the academic reference implementation, plus a hand-derived corpus of textbook structures.
- **Built for decision-makers, not epidemiologists.** Analytics, product, and strategy audiences get the same rigor with a product-grade surface: a keyboard-first graph editor, plain-language path diagnostics, and pedagogy that trains intuition instead of assuming it.
- **Fully client-side.** No backend, no accounts, no analytics, no telemetry, no cookies, no third-party requests of any kind (fonts self-hosted). Scenarios persist locally, share by URL, and export as explicit JSON. Deployable as a static bundle anywhere.

## Prior art

**DAGitty** is the authoritative academic tool for graphical identification, and this project treats it as the reference to be checked against rather than as a competitor. **Tetrad** does causal discovery from data; **CausalWizard** does estimation from uploaded data. The open space this product occupies: a product-grade _design_ instrument with bias-quantifying simulation and built-in pedagogy, aimed at people who make decisions with analyses rather than publish them.

## Limitations

- **Graphs are capped at 12 nodes.** That bound is what makes the exhaustive claims true: within it, adjustment-set enumeration, path enumeration, and testable-implication search are complete rather than heuristic.
- **Linear-Gaussian structural models.** Simulation and closed-form bias assume linear structural equations with Gaussian noise. Non-linear and discrete-outcome models are outside the engine.
- **Selection is quantified, not certified.** Under an active selection rule the app reports the exact bias it induces, and labels the identification verdict as "selection ignored" — it does not certify that an adjustment set remains valid _under_ selection.
- **Classical strategies only.** Identification covers covariate adjustment, front-door, and conditional IV. When those are exhausted the app says so explicitly instead of declaring the effect non-identifiable.
- **Sensitivity is a population statement, not a significance test.** Robustness values are computed from the model-implied covariance, before any data exists, so there is no standard error to condition on and no significance-adjusted variant is offered. Confounder strength is the only currency.
- **A witness search is bounded and local.** Finding a witness pair proves non-identification for that graph. Failing to find one proves nothing: the search is a deterministic hill-climb inside the model's own parameter bounds, and it says so rather than implying the effect is identified.
- **Measurement error is the classical model.** A mismeasured node is the true node plus independent noise, parameterised by reliability. Differential and correlated measurement error are different models and are not offered.

## Stack

Next.js App Router (static export) · React · TypeScript strict · Tailwind CSS · Zustand · Zod · Vitest + fast-check · Playwright. Hand-rolled SVG for visualizations.

## Run locally

Requires Node `20.20.x` (see `.nvmrc` / `package.json` engines).

```bash
npm ci
npm run dev
```

Open `http://localhost:3004`.

## Verify

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

Or `npm run test:full` to run all of the above in sequence.

## Build and deploy

```bash
npm run build
```

This emits a plain static site in `out/`, which serves from any static host. `npm run serve:out` serves that build locally at `http://localhost:4004`. There is no hosted instance — run it locally or deploy the bundle yourself.

Whatever host you use should send the response headers documented in [docs/STATIC-HOST-HEADERS.md](docs/STATIC-HOST-HEADERS.md). `vercel.json` applies them on Vercel and `serve.json` applies the same policy to the local preview, so the browser test suite runs against the real policy. `npm run check:csp` fails if the two host configs and the document ever disagree.

The GitHub remote is authoritative and carries the only pipeline; `.github/workflows/ci.yml` runs every gate. The GitLab remote is a backup mirror kept in sync, deliberately without a `.gitlab-ci.yml` — there is no second publication target to gate, and a mirrored pipeline would only create a second place for gate drift.

## Third-party notice

Test-only DAGitty fixtures under `fixtures/tools/dagitty/` are GPL-2.0-or-later. Application code under `src/` does not import that fixture tooling. See [NOTICE](NOTICE).

## Docs

- `docs/a11y-audit.md` — accessibility audit notes (axe, keyboard, screen-reader spot checks, contrast, reduced motion)
- `docs/notes/` — design and engine notes for contributors

## License

MIT © Sidakpreet Singh — see [LICENSE](LICENSE). Application code is MIT; see [NOTICE](NOTICE) for GPL fixture tooling.

---

**Version:** v0.16.3
