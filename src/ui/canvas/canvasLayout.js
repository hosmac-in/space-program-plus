// Geometry shared by BOTH canvases — the Tree tab and the option Canvas
// tab draw the same nested boxes and must agree on every number.
//
// This existed twice, once per tab, and the copies drifted: a padding fix
// landed on one side only, so the two tabs inset their cards differently. Any
// change to canvas spacing belongs here and nowhere else.
//
// Pure maths. No React, no colours, no data access.

export const NODE_WIDTH = 200
export const GAP = 16
// One inset used on all four sides at every nesting level, and exported so card
// headers pad by the same amount — that's what lines a header's text up with
// the left edge of the cards beneath it.
export const PADDING = 16
export const LABEL_HEIGHT = 30
const EMPTY_HEIGHT = 36

// Content starts PADDING below the header and ends PADDING above the bottom
// edge, matching the PADDING used left and right — so a card is inset by the
// same amount on all four sides of its container.
const CONTENT_TOP = LABEL_HEIGHT + PADDING

// A group box: a header, then equal-height cards stacked at a fixed pitch.
export function layoutGroupBox(children, childHeight) {
  const bodyHeight =
    children.length === 0 ? EMPTY_HEIGHT : children.length * childHeight + Math.max(0, children.length - 1) * GAP

  return {
    width: NODE_WIDTH + PADDING * 2,
    height: CONTENT_TOP + bodyHeight + PADDING,
    childPositions: children.map((entry, idx) => ({
      entry,
      x: PADDING,
      y: CONTENT_TOP + idx * (childHeight + GAP),
    })),
    isEmpty: children.length === 0,
  }
}

// A section box: a header, then group boxes, which vary in height and so can't
// use the fixed pitch above.
export function layoutSectionBox(groupBoxes) {
  const width =
    PADDING * 2 + Math.max(NODE_WIDTH + PADDING * 2, ...(groupBoxes.length ? groupBoxes.map((gb) => gb.width) : [0]))

  let runningY = CONTENT_TOP
  const placed = groupBoxes.map((gb) => {
    const y = runningY
    runningY += gb.height + GAP
    return { ...gb, x: PADDING, y }
  })

  const contentBottom = groupBoxes.length === 0 ? CONTENT_TOP + EMPTY_HEIGHT : runningY - GAP
  return { width, height: contentBottom + PADDING, placed, isEmpty: groupBoxes.length === 0 }
}
