# Performance budgets

The performance tests use the frozen 12-node, 24-edge adversarial fixture at
`fixtures/tier1/14-adversarial-perf.json`. They enforce upper bounds rather than
recording machine-specific benchmark claims.

| Workload                                              | Test                                 |     Budget |
| ----------------------------------------------------- | ------------------------------------ | ---------: |
| Bayes-Ball d-separation query                         | `tests/unit/graph-perf.test.ts`      |     < 5 ms |
| Full simple-path enumeration (541 paths)              | `tests/unit/graph-perf.test.ts`      |   < 150 ms |
| Full Prove workload, median of five warmed runs       | `tests/unit/prove-perf.test.ts`      |   < 250 ms |
| Generate and summarize 100,000 × 12 simulation values | `tests/unit/simulation-perf.test.ts` | < 1,500 ms |
| Full Design table, median of five warmed runs         | `tests/unit/design-perf.test.ts`     |   < 750 ms |

The Prove workload includes path classification, adjustment enumeration,
front-door search, conditional-IV enumeration, and minimal implied-CI
enumeration. The simulation workload uses bounded coefficients so it measures
generation and moment calculation rather than numerical failure handling.

Run the gates through the normal test suite. To print fresh timing samples:

```bash
PERF_LOG=1 npm run test -- \
  tests/unit/graph-perf.test.ts \
  tests/unit/prove-perf.test.ts \
  tests/unit/simulation-perf.test.ts \
  tests/unit/design-perf.test.ts
```

Editor dragging is covered as a browser interaction rather than approximated by
a Node timing test.
