// Numbers shared by BOTH side panels — the Tree tab's rooms panel and the
// Project tab's department block.
//
// They draw the same three things (a heading, a room block, an object row) and
// must agree on every number. They were two copies and they drifted: one lost
// the chip row and the other kept it, one gave its room block a white body and the
// other didn't, the count inputs ended up different widths. Any change to panel
// spacing belongs here and nowhere else.
//
// Pure numbers. No React, no colours, no data access. The canvas equivalent is
// ui/canvas/canvasLayout.js.

// A room's own controls act on the whole block; an object's act on one line of
// it, so they are a size smaller.
export const ROOM_CONTROL = 18
export const OBJECT_CONTROL = 16

// Wide enough for three digits without the spinner clipping.
export const COUNT_WIDTH = 48

// The room block: header strip, then a body inset by this much.
export const BLOCK_PADDING = 12
export const HEADER_PADDING = '6px 10px'
export const BLOCK_RADIUS = 6
