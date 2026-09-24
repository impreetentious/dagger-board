# DAGitty oracle provenance

Parity fixtures use the official DAGitty source repository at
`https://github.com/jtextor/dagitty`, pinned to commit
`7a657776dc8f5e5ba4e323edb028e2c2aaf29327`.

- DAGitty's JavaScript headers license the source as GPL-2.0-or-later.
- `jslib/` is the independent JavaScript library described by the upstream
  README. Its CommonJS entry exports `Graph`, `GraphAnalyzer`, `GraphParser`,
  `GraphTransformer`, `GraphSerializer`, and `MPoly`.
- The pinned repository has no root `package.json`, so it cannot be installed
  directly as an npm dependency. The minimum generated artifact is vendored at
  `fixtures/tools/dagitty/dagitty-node.js` with its provenance header intact.
- Vendored code is test tooling only. Application modules under `src/` must not
  import it; generated parity JSON is data, not a runtime dependency.

See [NOTICE](../../NOTICE) for the distribution boundary and
[the official DAGitty repository](https://github.com/jtextor/dagitty) for the
upstream source.
