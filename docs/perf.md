# Performance Record

## Reference environment

- Host: MacBook Pro (Mac16,5), Apple M4 Max, 14 CPU cores, 36 GB memory.
- Runtime: Node 20.20.2.
- Browser harness: Playwright 1.61.1 with repo-local Chrome for Testing 149.0.7827.55.
- Isolation: development port 3004; static serving and browser checks port 4004; other local builds were active on the host, so this record reflects the concurrent-load context required by D-16.

## P1 graph-core gate

Fixture #14 is frozen at 12 nodes and 24 edges by
`fixtures/tools/gen-fixture14.mjs` (`fixture14-layered-v1`). The five fresh runs
of `tests/unit/p1-perf.test.ts` measured:

| Check                         | Five runs (ms)                         | Median |  Gate |
| ----------------------------- | -------------------------------------- | -----: | ----: |
| Bayes-Ball d-separation query | 0.0089, 0.0074, 0.0075, 0.0074, 0.0074 | 0.0074 |   < 5 |
| Full simple-path enumeration  | 2.4550, 2.5050, 2.5799, 2.7466, 2.4965 | 2.5050 | < 150 |

The cap fixture exposes 541 simple X–Y paths. Both measurements pass on the
first round; no D-16 re-measure was needed.

## P2 identification gate

The full Prove workload runs path classification, adjustment enumeration,
singleton frontdoor detection, conditional-IV enumeration, and all-minimal
implication enumeration on fixture #14. The first implementation measured
415.6494 ms, so it was fixed rather than waived: Bayes-Ball now caches immutable
parent/child topology while retaining its independent traversal semantics.

`tests/unit/p2-perf.test.ts` samples the median itself: one discarded warm-up
pass, then five measured passes, asserting on the median. Measuring a single
cold pass had made the gate depend on when the runner happened to schedule the
file — under a full parallel `vitest run` that pass alone reached 274 ms.

| Check               | Five fixed runs (ms)                         |  Median |  Gate |
| ------------------- | -------------------------------------------- | ------: | ----: |
| Full Prove workload | 85.3836, 85.4730, 86.3175, 90.4507, 103.1920 | 86.3175 | < 250 |

The corrected workload passes on the first post-fix round; no D-16 re-measure
was needed.

## P3 SCM and simulation gate

The workload creates 100,000 rows across fixture #14's 12 variables with the
chunked generator, then computes two-pass sample moments. It uses an edge
coefficient of 0.25 for a numerically representative bounded SCM rather than
turning the deliberately dense graph into an ill-conditioned demonstration.

| Check                                  | Five runs (ms)                                   |   Median |    Gate |
| -------------------------------------- | ------------------------------------------------ | -------: | ------: |
| Chunked 100k × 12 simulation + moments | 276.2940, 278.7618, 275.3286, 277.0392, 274.2752 | 276.2940 | < 1,500 |

The gate passed on its first concurrent-load round. The implementation yields
after each 8,192-row even chunk without changing the global RNG stream.
