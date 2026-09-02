// The app frame: the numbers behind the four regions and the three regulating
// lines between them. See CLAUDE.md.
//
// Anything that draws or sits on one of those lines reads it from here, so the
// header, the footer, main's right edge and the carousel bands cannot drift
// apart — and so a floating element knows how much room the footer takes.
//
// This is app chrome only. Spacing *inside* a canvas card belongs to
// ui/canvas/canvasLayout.js instead.

// The dividers are deliberately heavier than a hairline: the regions are the
// structure of the screen, and at 1px #e0e0e0 you couldn't see where main ended
// and side began.
const RULE_COLOUR = '#9a9a9a'
export const RULE = `1.33px solid ${RULE_COLOUR}`

// A lighter line for divisions *within* a region — one carousel row from the
// next — so they read as subdivisions rather than as region boundaries.
export const RULE_INNER = '1px solid #dcdcdc'

// Fixed, not content-derived: the footer is a regulating line, so it holds the
// same position on every tab, and anything floating above it (toasts) can offset
// by a known amount instead of measuring.
export const FOOTER_HEIGHT = 44

// Clears the footer, for the fixed-position toasts that would otherwise sit on
// top of it.
export const ABOVE_FOOTER = FOOTER_HEIGHT + 12
