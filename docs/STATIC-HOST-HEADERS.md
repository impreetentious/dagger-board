# Static-host security headers

Dagger Board is a static client-side application. Nothing it computes leaves the browser: there is no backend, no telemetry, no third-party embed, no remote font, and no analytics. The policy below is written to make that architectural claim enforceable by the host rather than merely asserted in prose.

`vercel.json` applies these headers on Vercel and `serve.json` applies the identical policy to the local `npm run serve:out` preview, which is also what the Playwright suite runs against — so every shipped route is exercised under the real policy before release. Any alternate static host should apply the equivalent response headers to every route and static asset:

```http
Content-Security-Policy: default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; img-src 'self' data:; manifest-src 'self'; media-src 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; worker-src 'self'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: browsing-topics=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()
```

## Why each non-obvious directive is what it is

- **`worker-src 'self'`** — the simulation kernel runs off the main thread. `src/lib/sim-worker-client.ts` constructs a module worker from a bundler-emitted same-origin chunk, so the app breaks outright without this directive. It must never be widened beyond `'self'`, and in particular never to `blob:`.
- **`connect-src 'self'`** — the product makes no network requests of its own, so `'none'` looks tempting. It is wrong here: the App Router prefetches route payloads for every `next/link` on `/`, `/lab`, `/learn`, and `/learn/[slug]`, and `'none'` would block that same-origin traffic and degrade navigation. `'self'` still forbids every off-origin destination, which is the property that matters.
- **`script-src`/`style-src` inline allowances** — required by the framework's static bootstrap and its generated critical styles. They permit no remote origin.
- **`img-src 'self' data:`** — visualizations are hand-rolled inline SVG; `data:` covers inlined raster assets. No remote image host is permitted, and `next.config.ts` sets `images.unoptimized`, so no optimizer origin is involved.
- **`frame-ancestors 'none'` plus `X-Frame-Options: DENY`** — Dagger Board has no embeddable surface. Both are set because some hosts and older agents honour only one.

## Changing this policy

`npm run check:csp` fails if `vercel.json`, `serve.json`, and this document disagree, if a required directive goes missing, if a wildcard or unsafe execution token appears, or if the built `out/` gains an off-origin reference. Update all three together, then re-run `npm run test:e2e` — the suite serves `out/` under this exact policy, so a CSP that breaks the worker or navigation fails the gate rather than shipping.

Verify these headers on the deployed origin after publishing; the repository can
only test the bundled local preview, not a live host's configuration.
