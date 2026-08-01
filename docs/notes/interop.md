# Interoperability Notes

## V-07 — Fragment Budget

Resolved. The codec serializes canonical JSON as
`#g=` + base64url(deflate-raw(JSON)). A full 12-node/24-edge representative
payload with 64-character labels, coordinates, roles, parameters, Z, selection,
seed, and n compressed to 726 characters (729 with `#g=`) on Node 20.20.2.

That measurement is not treated as a universal upper bound: 64-character labels
can contain less-compressible Unicode/escaped content. The product therefore
measures the actual emitted fragment and disables Share above 2,000 characters
with the required JSON-export fallback; it never truncates a model. The bound is
thus enforced at the exact IO boundary rather than guessed from a friendly
fixture.

## V-10 — DAGitty `selected` Status

Resolved from the pinned source used by the test oracle. Its
`GraphParser.parseDotStatementArray` has an explicit `selected`/`s` case that
calls `addSelectedNode`; its serializer emits `selected` for selected nodes.
It likewise accepts and emits `adjusted`, `latent`/`unobserved`,
`exposure`/`source`, and `outcome`/`target`.

The product's exporter/importer follows the ratified mapping: current Z is
`adjusted`, selection kind is `selected`, role attributes win over an adjusted
conflict, and selection threshold, parameters, and `idx` remain documented
losses. A bidirected import becomes a fresh latent common cause.

Primary source: `fixtures/tools/dagitty/dagitty-node.js`, pinned upstream commit
`7a657776dc8f5e5ba4e323edb028e2c2aaf29327`, parser lines 3950–3973 and
serializer lines 6044–6051.
