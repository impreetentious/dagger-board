# Accessibility audit — P8

Recorded 17 Aug 2026; re-verified and corrected 29 Aug 2026 (IST).

## Scope

- Surfaces covered: `/`, `/lab`, `/learn`, `/learn/[slug]`.
- Bar: WCAG 2.1 AA intent + the §4.5 shape/stroke encoding requirement.

## Automated pass

- `axe-core` (via `@axe-core/playwright`) runs against `/`, `/learn`, `/learn/m-bias`, and every
  `/lab` workbench surface (Draw, Prove, Simulate, Design, Communicate).
  (`.include("main")`) in `tests/e2e/editor.spec.ts` and reports zero
  violations. This is now genuinely zero: the earlier record overstated the
  result. The active surface-tab number badge rendered `--signal` (#b14e2d) on
  the active `--signal-soft` (#f5ded4), only 4.07:1 — below AA. It now uses a
  dedicated `--signal-strong` token (5.03:1 light / 5.15:1 dark) and the axe
  assertion passes with zero serious violations.
- The audit fixture uses the M-bias canon graph so the assertion covers all
  three node kinds (`observed`, `latent`, and — via the Berkson lesson — the
  `selection` kind), not just the default state.
- Single-`h1` structure: the `/lab` shell owns the page `h1`; each surface
  panel (Draw/Prove/Simulate/Design/Communicate) now heads with `h2`, so the
  document exposes exactly one top-level heading per route.

## Node-kind encoding

Node kinds are drawn by shape and stroke pattern, never by colour alone
(§4.5). The current renderings are:

| Kind      | Shape          | Stroke         |
| --------- | -------------- | -------------- |
| observed  | Solid circle   | Solid outline  |
| latent    | Dashed circle  | Dashed outline |
| selection | Double diamond | Solid outline  |

## Manual keyboard pass

- Editor: `n` adds a node, arrows navigate, `x`/`y`/`l`/`s` assign role/kind,
  `e` + arrow + `Enter` draws an edge, `?` opens the help sheet, Cmd/Ctrl+Z
  and Shift+Cmd/Ctrl+Z drive the undo stack (`WU-4.3`).
- Focus is always visible; the canvas uses a roving `tabindex` so a single
  Tab press enters the graph and arrows then walk it (V-06).
- Live announcements: `aria-live="polite"` region reports node adds, kind
  changes, and role assignments so a screen reader hears the mutation.

## Screen reader spot check

Manually verified with macOS VoiceOver:

- Editor announces `Causal graph editor` when focused; each node reads its
  name, kind, and role in order.
- Prove panel's identification verdict reads first ("adjustment", "frontdoor",
  etc.); the path list is a labeled list; the conditioning toggles announce
  their state.
- Communicate panel's Download button reports a clear label; the assumed-absent
  list reads coherently in reading order.

## Remaining owner review

- No live user-research pass has been performed; the audit above is
  builder-verified against the ratified WCAG intent (§4.5). Full assistive-tech
  coverage is on the Owner review list in §9.
