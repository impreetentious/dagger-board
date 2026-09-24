# Accessibility verification

## Automated coverage

`npm run test:e2e` runs axe-core against `/`, `/learn`, `/learn/m-bias`, and
each `/lab` surface (Draw, Prove, Simulate, Design, and Communicate). The lab
check loads the M-bias example so the rendered graph includes observed and
latent node kinds. The same suite verifies keyboard-only graph construction
and role assignment.

The application also enforces these behaviors in code:

- Each route has one top-level heading; workbench panels use second-level
  headings beneath the `/lab` shell.
- The graph is a labelled `graphics-document` with roving tabindex, keyboard
  construction commands, visible focus, and polite live announcements.
- Reduced-motion preferences disable transitions and smooth scrolling.
- Node kinds use shape and stroke pattern rather than color alone.

| Kind      | Shape          | Stroke         |
| --------- | -------------- | -------------- |
| observed  | Solid circle   | Solid outline  |
| latent    | Dashed circle  | Dashed outline |
| selection | Double diamond | Solid outline  |

## Manual release checklist

Automated checks do not replace assistive-technology testing. Before deploying
a public instance, verify the current build with a screen reader and keyboard:

- The editor announces its label and each node's name, kind, and role.
- Arrow-key navigation and the `n`, `x`, `y`, `l`, `s`, `e`, and undo commands
  expose visible focus and announce mutations.
- Prove announces its verdict before diagnostics, and conditioning controls
  expose their state.
- Every surface remains readable at 200% zoom and under forced colors.
- The deployment preserves the document language, reduced-motion behavior, and
  the response headers documented in `STATIC-HOST-HEADERS.md`.
