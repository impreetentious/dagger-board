# Interoperability notes

## URL fragment budget

The codec serializes canonical JSON as `#g=` plus base64url-encoded,
raw-deflated JSON. A representative 12-node, 24-edge payload with long labels,
coordinates, roles, parameters, conditioning, selection, seed, and sample size
fits comfortably below the limit, but compressibility is input-dependent.

The product therefore measures every emitted fragment and disables Share above
2,000 characters, offering JSON export instead. It never truncates a model.

## DAGitty status mapping

The pinned DAGitty parser and serializer support `selected`, `adjusted`,
`latent`/`unobserved`, `exposure`/`source`, and `outcome`/`target` statuses.
Dagger Board maps the active conditioning set to `adjusted` and selection-kind
nodes to `selected`; role attributes win if an adjusted status conflicts.
Selection thresholds, SCM parameters, and persistent `idx` values are documented
losses. A bidirected import becomes a fresh latent common cause.

Primary source: `fixtures/tools/dagitty/dagitty-node.js`, pinned upstream commit
`7a657776dc8f5e5ba4e323edb028e2c2aaf29327` under `fixtures/tools/dagitty/`.
