# SVG editor accessibility pattern

The editor follows W3C Graphics ARIA and keyboard-interface guidance.

- The canvas is a labelled `graphics-document`; each meaningful node is a
  labelled, keyboard-focusable graphics object. Decorative grid and arrow
  fragments are excluded from the accessibility tree.
- Nodes use roving tabindex: exactly one active node is in the normal tab
  sequence, and arrow keys change the active node. This avoids turning a dense
  canvas into an unbounded list of tab stops while preserving direct keyboard
  manipulation.
- Keyboard actions announce structural outcomes through one polite `aria-live`
  region. Geometry conveys kind by shape and stroke as well as color.

Primary sources: [WAI-ARIA Graphics Module](https://www.w3.org/TR/graphics-aria-1.0/)
and [W3C keyboard-interface guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/).
