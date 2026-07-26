# Draw Design Language

## Builder Decision For WU-4.1

The workbench uses a **field-instrument** language: low-glare paper surfaces,
an exact 32-pixel plotting grid, graphite-like ink, oxidized-green structure,
and a single clay signal color for active risk or focus. It avoids dashboard
chrome and card stacks in favor of a canvas with a narrow, switchable analysis
rail.

- Observed nodes are solid circles; latent nodes are dashed circles; selection
  nodes are double-stroked diamonds. The geometry and stroke pattern remain
  legible without color.
- Causal edges are restrained graphite arrows. A selected path gains a clay
  outline, not a new semantic color. Parallel visual emphasis is limited to the
  active node/path and keyboard focus.
- Focus is a high-contrast clay perimeter; motion is short (150–180 ms),
  opacity/transform only, and disabled under reduced motion.
- `/lab` is one shared model: the drawing canvas remains dominant while Draw,
  Prove, Simulate, Design, and Communicate are switchable rail surfaces. This
  keeps evidence adjacent to the assumption that produced it instead of making
  each stage a disconnected page.

This is the builder's D-15 decision for the formerly owner-review checkpoint.
It is included in the build-end Owner review list rather than treated as an
unresolved blocker.
