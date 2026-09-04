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

// No COUNT_WIDTH any more. A count used to be a fixed-width box in a column of
// its own; it now sizes to its own digits and sits directly against the name it
// belongs to, so there is no shared number to agree on. See CountField.

// Every sqft figure in a panel lines up in one right-aligned column: a room's
// own area in its header, and each object's area in the body beneath it.
//
// Wide enough for "1,000 sqft" and no wider. Every pixel here is taken from the
// room's name, which is the thing being read — at 96 a Consultation Room was
// ellipsised down to "Consultation R…" in a panel this narrow.
export const AREA_WIDTH = 78

// The slot a remove button sits in. Fixed and shared, so the area column above
// ends at the same x as the one below it even though a room's × is larger than
// an object's — the two buttons are centred in the same width rather than each
// setting its own.
export const CONTROL_SLOT = 18

// Divides one kind of statement from another INSIDE a room's body — the room's
// own generic size from the objects standing in it, one energy section from the
// next. Lighter than anything in ui/layout.js, which rules off the regions of
// the screen; this only groups lines that were running together.
export const SUBTLE_RULE = '#eee'
export const SUBTLE_GAP = 10

// The column every energy value sits in — a figure, a dropdown or a switch, all
// right-aligned to the same edge so the eye runs down one line instead of
// tracking a ragged one. Wide enough for "0.00 W/sqft", which is the longest of
// them; a value that outgrows it should get a SHORTER UNIT, not a wider column,
// because the label beside it is what gets squeezed. (That is why hot water
// reads L/p/day.)
export const VALUE_WIDTH = 84

// The energy grid's own numbers — its gap, its divider and the width it stacks
// at — are NOT here. They live in `.spp-energy-grid` in index.css, because all
// three change when the two columns wrap to one and only a container query knows
// that they have. Duplicating them here would be two places to keep in step.

// The room block: header strip, then a body inset by this much.
export const BLOCK_PADDING = 12
// The horizontal inset matches BLOCK_PADDING so the header's right-hand columns
// end where the body's do — the areas below have to line up with the area
// above them.
export const HEADER_PADDING = '6px 12px'
export const BLOCK_RADIUS = 6
