# DAGGERBOARD

> Draw your assumptions. See your bias. Before the data.

**Status:** v0.11.0 — P0 → P9 implementation is on `main` (graph editor, identification, simulation, design surfaces, curriculum, analysis design record). Static export; v1.0.0 tagging and public deploy remain separate release steps.

---

## The problem

Every strategy deck, A/B readout, and observational analysis makes causal claims — and almost all of them are made by vibes. "We adjusted for everything we could think of." "The uplift is obvious from the chart." The graphical machinery to actually check those claims — d-separation, adjustment criteria, do-calculus — has existed for decades, but it lives in academic tools built for epidemiologists, not for the people shipping decisions.

## The instrument

This project is a pre-data instrument for stress-testing causal claims and study designs:

1. **Draw** your causal assumptions as a directed acyclic graph — observed, latent, and selection nodes; pick an exposure and an outcome.
2. **Prove** — the engine computes, _exactly_, what your assumptions already imply: whether your effect is identified by the classical strategies — covariate adjustment, front-door, instrumental variables — and exactly how (and it tells you honestly when its strategy set is exhausted rather than claiming non-identifiability), every minimal valid adjustment set, every biasing path, available instruments, frontdoor routes, and the conditional independencies your model claims are testable.
3. **Simulate** — the graph becomes a working structural causal model. Seeded, replayable data generation shows the precise bias your naive analysis would produce — confounding, collider conditioning, M-bias, selection, measurement error — and every simulated estimate converges to a closed-form population value the engine derives independently.
4. **Design** — declare what you can measure, what you'll condition on, how your sample is selected, and how big it is. Get back which effects are identified under that design's measurement and conditioning choices — with selection effects quantified as exact biases (v1 quantifies selection; it does not certify adjustment validity _under_ selection) — the exact population bias of each feasible estimator, and a variance/power preview — before you collect a single row.
5. **Learn** — a curriculum of canonical traps, each a playable scenario: you make the analysis call first, then the engine reveals what happened and the theory underneath.
6. **Communicate** — export an Analysis Design Record: the graph, the assumptions (including what you assumed _absent_), the chosen identification strategy, and the known threats.

## What makes it different

- **Pre-data by design.** This is not a data-analysis tool. It interrogates the reasoning that comes before data — the part every existing tool skips past.
- **Exact where it claims to be exact.** Graph queries are complete combinatorics within a documented size bound. Population biases come from closed forms (path-tracing rules on linear structural models), and every simulation runs under a live engine self-audit: the implied covariance matrix and the total effect are each computed two independent ways (matrix algebra vs. path/trek enumeration) and must agree to within 10⁻⁹, or the product shows an integrity error instead of a number. Simulated estimates are always displayed against their independently derived closed-form targets, so any drift is visible rather than silently absorbed.
- **Verified against the scholarly reference.** The algorithms are classical — Pearl's identification framework, the generalized adjustment criterion, Wright's path tracing. Results are fixture-tested for parity against DAGitty, the academic reference implementation, plus a hand-derived corpus of textbook structures.
- **Built for decision-makers, not epidemiologists.** Analytics, product, and strategy audiences get the same rigor with a product-grade surface: a keyboard-first graph editor, plain-language path diagnostics, and pedagogy that trains intuition instead of assuming it.
- **Fully client-side.** No backend, no accounts, no analytics, no telemetry, no cookies, no third-party requests of any kind (fonts self-hosted). Scenarios persist locally, share by URL, and export as explicit JSON. Deployable as a static bundle anywhere.

## Prior art

**DAGitty** is the authoritative academic tool for graphical identification and serves as this project's independent oracle, not its competitor. **Tetrad** does causal discovery from data; **CausalWizard** does estimation from uploaded data. The open space this product occupies: a product-grade _design_ instrument with bias-quantifying simulation and built-in pedagogy, aimed at people who make decisions with analyses rather than publish them.

## Stack

Next.js App Router (static export) · React · TypeScript strict · Tailwind CSS · Zustand · Zod · Vitest + fast-check · Playwright. Hand-rolled SVG for visualizations.

## Run locally

Requires Node `20.20.x` (see `.nvmrc` / `package.json` engines).

```bash
npm ci
npm run dev
```

Dev server defaults to port `3004`.

## Verify

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

Or `npm run test:full` for the combined local gate.

## Third-party notice

Test-only DAGitty fixtures under `fixtures/tools/dagitty/` are GPL-2.0-or-later. Application code under `src/` does not import that fixture tooling. See [NOTICE](NOTICE).

## Docs

- `docs/a11y-audit.md` — accessibility audit notes
- `docs/notes/` — design and engine notes for contributors

## License

MIT © Sidakpreet Singh — see [LICENSE](LICENSE). Application code is MIT; see [NOTICE](NOTICE) for GPL fixture tooling.
