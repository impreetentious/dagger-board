# Editor Accessibility Research Notes

## V-06 — SVG Editor Pattern

Resolved against W3C's Graphics ARIA module and Authoring
Practices Guide.

- The canvas is exposed as a labelled `graphics-document`; each meaningful node
  is an explicitly labelled, keyboard-focusable graphics object. Decorative
  grid/arrow fragments are excluded from the accessibility tree.
- Nodes use a roving-tabindex model: exactly one active node is in the normal
  tab sequence, with arrow keys changing the active node. This prevents a dense
  canvas from becoming an unbounded tab stop list while preserving direct
  keyboard manipulation.
- Keyboard actions announce structural outcomes through one polite `aria-live`
  region. Geometry conveys kind by shape and stroke as well as color.

Primary sources: [WAI-ARIA Graphics Module](https://www.w3.org/TR/graphics-aria-1.0/)
and [W3C keyboard-interface guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/).
