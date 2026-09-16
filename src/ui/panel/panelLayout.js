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


// The slot an ANNOTATION sits in instead — a control a second app puts where the
// × would be (ui/option/annotations.jsx). Wider because such a control may be
// ringed, and a ring sits outside its button.
//
//   >>> A CONSTANT, not a prop, and reserved in the department heading even
//   >>> where nothing fills it. Both apps draw the panel from the same numbers,
//   >>> so a column that changed width between them would make one layout read
//   >>> as a different screen rather than the same one with a control added.
export const ANNOTATION_SLOT = 30

// >>> NO ROW RESERVES A CONTROL COLUMN ANY MORE, and nothing should add one
// back. There is no × in this panel: removal is a RIGHT-CLICK on the end of a
// row's own branch, which always prompts (see PanelTree.jsx and the canvases,
// which settled it first). A second app's annotation is simply the last thing in
// the row when there is one, and in the editor there never is — so every sqft
// figure ends on the panel's own right edge, which cannot drift.
//
// The old trailing column had to be both the datum and the control slot. Each
// side has one job now: the tree and its + down the left, the figures down the
// right.

// Divides one kind of statement from another INSIDE a room's body — the room's
// own generic size from the objects standing in it, one energy section from the
// next. Lighter than anything in ui/layout.js, which rules off the regions of
// the screen; this only groups lines that were running together.
export const SUBTLE_RULE = '#eee'
// The air EITHER SIDE of such a rule, so it is twice this between two blocks.
// At 10 a room of four objects was mostly the gaps between its parts.
export const SUBTLE_GAP = 6

// The column every energy value sits in — a figure, a dropdown or a switch, all
// right-aligned to the same edge so the eye runs down one line instead of
// tracking a ragged one. Wide enough for "0.00 W/sqft", which is the longest of
// them; a value that outgrows it should get a SHORTER UNIT, not a wider column,
// because the label beside it is what gets squeezed. (That is why hot water
// reads L/p/day.)
export const VALUE_WIDTH = 84

// A row holding TWO inputs — a heating and a cooling setpoint, litres and the
// temperature they are at. It grows LEFTWARDS: the right edge is the column
// every other value is aligned to and must not move, so the extra width comes
// out of the label instead.
//
// That is affordable only because pairing shrinks the label: "Heating setpoint"
// and "Cooling setpoint" become one "Setpoint", which is where the space comes
// from. A pair whose two halves share a unit prints it once at the end —
// "21.0 / 24.0 °C" — and one whose halves do not gets shorter units, never a
// wider column.
export const PAIR_WIDTH = 108

// The energy grid's own numbers — its gap, its divider and the width it stacks
// at — are NOT here. They live in `.spp-energy-grid` in index.css, because all
// three change when the two columns wrap to one and only a container query knows
// that they have. Duplicating them here would be two places to keep in step.

// The room block: header strip, then a body inset by this much.
//
// A room is a stack of one-line rows and the insets were a third of its height.
// Every number here is deliberately tight: the block's own border and its
// coloured header are what separate one room from the next, so the padding does
// not also have to.
export const BLOCK_PADDING = 10
// The header's right-hand inset matches BLOCK_PADDING so its columns end where
// the body's do — the areas below have to line up with the area above them.
// CHANGE THE TWO TOGETHER. The LEFT inset is the tree's (see PanelTree.jsx): the
// branch lands on a caret drawn over this strip, and the name starts clear of it.
export const HEADER_PADDING_RIGHT = 10

// ONE HEIGHT FOR A ROOM'S HEADER, fixed rather than sized to its own text: the
// tree has to know where the branch meets the row (PanelTree.jsx), and a header
// that grew with its name would give a different answer on every room. The
// canvas settled the same thing for the same reason — see ROW_HEIGHT there.
export const ROOM_HEAD = 28
// The air above a row that opens a new kind of statement — a room block under
// the one before it, a note under the objects.
export const BLOCK_GAP = 6

// Above and below ONE LINE of a room: an object, the room's own area, an energy
// field. A room is a stack of these, so this number more than any other decides
// how tall a room is — at 4 a six-object room spent 48px on padding alone.
//
//   >>> Set it with `paddingBlock`, NEVER the `padding` shorthand. .spp-row's
//   >>> highlight is padding-inline plus an equal negative margin; the shorthand
//   >>> resets the inline half and the row lands 4px left of everything it lines
//   >>> up with.
export const ROW_PAD = 3
export const BLOCK_RADIUS = 6

// A ROOM IS LIFTED OFF THE PANEL, NOT OUTLINED ON IT. The tree already says what
// contains what — a border around every room was a second answer to a question
// already answered, and a column of them boxed the tree in. The shadow is enough
// to say where the block ends, which is all the outline was doing.
//
// The border is a number rather than a deleted line because the geometry is
// measured from the block's outer edge: the tree's columns and the body's inset
// both read it, and putting one back means changing this alone.
export const BLOCK_BORDER = 0
export const BLOCK_SHADOW = '0 1px 3px rgba(0,0,0,0.18)'
