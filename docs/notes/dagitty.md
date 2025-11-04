# DAGitty Oracle Source Check (V-03)

Resolved before P0, using the official repository at
`https://github.com/jtextor/dagitty`.

- Pinned source commit: `7a657776dc8f5e5ba4e323edb028e2c2aaf29327` (the
  `master` head resolved by `git ls-remote`).
- License: the source file `LICENSE.txt` begins with GNU General Public License,
  Version 2, June 1991; the JavaScript source headers grant version 2 or any
  later version. It is therefore GPL-2.0-or-later for the dependency-boundary
  decision.
- JavaScript implementation: `jslib/` is the independent JavaScript library
  described by the upstream README. Its `Makefile` builds the CommonJS Node entry
  `jslib/dagitty-node.js`; `jslib/node-post.js` exports `Graph`, `GraphAnalyzer`,
  `GraphParser`, `GraphTransformer`, `GraphSerializer`, and `MPoly`.
- Packaging outcome: the pinned repository has no root `package.json`, so
  `github:jtextor/dagitty#<commit>` is not installable as an npm devDependency.
  The contract's pre-approved fallback is selected: P2 will vendor the minimum
  source/build artifact under `fixtures/tools/dagitty/`, with this commit, URL,
  date, GPL-2.0-or-later boundary, and import path in its provenance header.
- Boundary: the fallback is test tooling only. Application modules under `src/`
  must never import it, and generated Tier-2 JSON remains data rather than a
  runtime dependency.

Primary source: [official DAGitty repository](https://github.com/jtextor/dagitty)
at the pinned commit above.
