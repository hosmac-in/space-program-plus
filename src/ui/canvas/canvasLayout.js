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

// THE AIR BETWEEN TWO DEPARTMENT CARDS, half what separates two boxes. A card is
// a row — one name and a figure — and cards inside a group are a list, which
// reads as one thing at close spacing and as a stack of separate objects at the
// box gap. A GROUP keeps the full GAP: the gap is what says where one box ends
// and the next begins, and halving that ran two groups together.
//
// Derived, not typed: the two are a pair, and the relation between them is what
// makes the nesting legible.
export const CARD_GAP = GAP / 2
// One inset used on all four sides at every nesting level, and exported so card
// headers pad by the same amount — that's what lines a header's text up with
// the left edge of the cards beneath it.
export const PADDING = 16

// ONE ROW HEIGHT FOR EVERYTHING SHUT, and every such height is derived from it
// rather than typed again:
//
//   a section or group header          LABEL_HEIGHT
//   a group box with its cards hidden  its header, so this
//   a department card with no list     DEPT_HEAD_HEIGHT
//
// They are read down one column, stacked in the same boxes, and three numbers
// that were each "about thirty" made a shut group and the card under it two
// slightly different bars — which reads as a mistake, not as a difference. A
// card with its rooms open grows by the list and nothing else.
export const ROW_HEIGHT = 30
export const LABEL_HEIGHT = ROW_HEIGHT

// The × (or +) in a card header, and the column reserved for it WHETHER OR NOT
// there is one — a section has a ×, the group inside it does not, and without a
// reserved slot their area figures sat at two different insets on cards drawn
// one inside the other.
export const CARD_CONTROL = 16
// What squares it off: the control is inset from the right by the same amount
// the header's height leaves above and below it, so it reads as equally padded
// on all three sides. The NAME keeps the full PADDING — it lines up with the
// cards below, which is a different alignment and a more important one.
export const CARD_CONTROL_INSET = (LABEL_HEIGHT - CARD_CONTROL) / 2

// The gap between a header's parts. Named because the sums below depend on it.
export const HEADER_GAP = 6

const EMPTY_HEIGHT = 36

// --- The department card ----------------------------------------------------
//
// ONE CARD, TWO CANVASES. The face is drawn by DepartmentCardFace in
// canvasCards.jsx and sized by the numbers here, so the Tree tab and the option
// tab cannot end up describing a department differently. What stays local to
// each tab is only what it DOES — drag handles and a remove there, ghosts,
// phases and an add here.
//
// A card LISTS THE ROOMS IN IT and grows to hold the list rather than scrolling
// or truncating it: layoutGroupBox already takes a height per child, which is how
// the option tab draws a ghost shorter.
export const ROOM_LINE_HEIGHT = 13
// The air between the name row and the first room line. Exported because the
// tree measures each room's branch from it — see branchToRoom.
export const ROOM_LIST_TOP = 4
export const roomListHeight = (count) => (count === 0 ? 0 : ROOM_LIST_TOP + count * ROOM_LINE_HEIGHT)

// A card with nothing listed: one name, centred in it — THE SAME ROW A SHUT
// GROUP IS, since both are one name and a figure with nothing under them. It was
// 60, which made a card twice the bar above it and a group of them a column of
// slabs; the list is what a card grows for.
export const DEPT_HEAD_HEIGHT = ROW_HEIGHT
export const DEPT_NAME_ROW = 20
// With a list, the card is laid out top-down instead — the same inset above the
// name and below the last room, and DERIVED so that the head of an open card is
// exactly the row a shut one is: opening one adds the list and moves nothing
// else. The card carries no vertical padding of its own, so departmentCardHeight
// is the whole sum.
export const DEPT_HEAD_INSET = (ROW_HEIGHT - DEPT_NAME_ROW) / 2

// What a card has to be to hold its list. The card must draw at exactly this
// height or every card below it in the group stops lining up, so the face and
// both layouts read the one function.
//
// It counts ROWS, not rooms: a room group puts a heading in the list too, and a
// card that grew only by its rooms would clip by one line per group.
export const departmentCardHeight = (roomCount) =>
  roomCount === 0
    ? DEPT_HEAD_HEIGHT
    : // The head row spends BOTH insets (it is ROW_HEIGHT), so the one under the
      // last room is a third — without it the list sat flush on the card's edge.
      DEPT_HEAD_INSET * 3 + DEPT_NAME_ROW + roomListHeight(roomCount)

// The disclosure caret's column, RESERVED WHETHER OR NOT A ROW HAS ONE — a
// department with no rooms, or a group with no cards, would otherwise start its
// name 18px left of every other row beside it, which reads as a different kind
// of row rather than as an empty one.
//
// The room list is indented by the whole column, so a room name starts exactly
// under the department's name, and the rule down the list runs through the
// caret's own centre.
export const DEPT_CARET = 12
export const DEPT_CARET_COL = DEPT_CARET + HEADER_GAP

// --- THE ROW GRID, AND THE DATUM EVERY AREA FIGURE ENDS ON -------------------
//
// EVERY ROW ON EITHER CANVAS IS THE SAME FOUR COLUMNS — a section header, a
// group header, a department card, a phased card's heading:
//
//     [indent] [caret] [name ................] [figure] [control]
//
// NESTING ONLY MOVES THE LEFT EDGE. A child box is inset `NEST_LEFT`, which is
// PADDING plus the caret column — so a child's box starts exactly under its
// parent's NAME, and the tree (CanvasGuides.jsx) has a column of its own to be
// drawn in. That is what makes the nesting read as a tree rather than as boxes
// that happen to sit inside each other.
//
// THE RIGHT IS A DATUM. A box steps in by `NEST_RIGHT` per level so three
// borders don't stack on one line, and each level's control inset PAYS THAT STEP
// BACK — so every area figure, at every depth, on both canvases, ends on one
// vertical line.
//
//   >>> This replaces three constants that each meant "about right at my own
//   >>> level" (FIGURE_INSET, FIGURE_INSET_NESTED, DEPT_CONTROL_INSET), which is
//   >>> why the figures drifted apart every time any level changed. A new level
//   >>> DERIVES its inset from `controlInset`; it never types one. Nothing may
//   >>> right-pad one of these rows by hand.
export const DEPTH = { section: 0, group: 1, card: 2 }
const MAX_DEPTH = 2

// Where a row's own content starts. Tighter than PADDING, which is what the
// boxes are spaced by vertically: the row's left inset is paid TWICE over at
// every level — once by the box and once by the step past it — so at PADDING the
// nesting marched across the card and left the names in a diagonal.
export const ROW_INSET = 8

// ONE STEP, EVERY LEVEL. A child box steps right by this, and so does a room
// inside a card — a tree whose branches are three lengths is three trees.
//
// The floor is the parent's caret ring plus air: a child box drawn any closer
// would be drawn over the ring the tree ends on, because the tree is a layer
// above the boxes.
export const INDENT = 26
export const NEST_LEFT = INDENT

// A ROOM STEPS LESS. It is a line of text, not a box: it has no edge of its own
// to clear, so the step only has to get past the card's caret ring — and at a
// box's full INDENT the names ended up further in than their own department's.
export const ROOM_STEP = 20
// And a hair in on the right, so the right edges step without stacking.
export const NEST_RIGHT = 6

// >>> A SWITCH, kept so the call can be made by looking rather than by arguing.
// Groups and department cards carry no outline at all — the nesting and the tree
// already say what contains what. A section is the outermost box on bare canvas,
// which is the one place a fill alone may not say where the box ends. Flip this
// to false to see it without.
export const SECTION_BORDER = false

// The other half of the same question, and INDEPENDENT of it: a section is
// lifted off the canvas rather than outlined on it. Set to null for neither. An
// edge and a lift say the same thing two ways, so these are separate switches —
// try either, both or neither.
export const SECTION_SHADOW = '0 1px 3px rgba(0,0,0,0.30)'

// What a row pads on the right, BY DEPTH — the control column's own inset plus
// however much of the nesting this level has not yet paid for. Combined with the
// control column and the gap before it, this is what puts the figure on the
// datum.
export const controlInset = (depth) => CARD_CONTROL_INSET + (MAX_DEPTH - depth) * NEST_RIGHT

// --- THE TREE ----------------------------------------------------------------
//
// The line that says what contains what: down the caret column of each row,
// across to each child, ending in that child's caret or in a dot where it has
// none. No branch ends in air.
//
// IT IS ONE DRAWING, over the whole canvas — CanvasGuides.jsx. It was drawn in
// pieces once, each box painting the part inside itself in that box's own ink,
// with the pieces overlapping exactly on every border. The geometry met and it
// still read as four separate drawings, because a line that changes colour at
// every wall is not one line. What is here is only where it attaches.
export const GUIDE_X = ROW_INSET + DEPT_CARET / 2
// The connector at a branch that has no caret to point at — a room, or a box
// with nothing under it to open. Small: it is a full stop on a hairline, and a
// column of them beside a room list out-weighs the names at anything bigger.
export const GUIDE_DOT = 4
// Solid black, everywhere, whatever it crosses. The tree is one object and it is
// drawn in one ink; legibility over a dark group body is the halo's job, not a
// second colour's.
export const GUIDE_INK = '#000'

// THE RING AROUND A CARET, which is what the tree actually lands on. The arrow
// turns inside it, so the point a branch meets never moves — a branch that
// stopped short of the glyph itself shifted its meeting point every time the
// glyph rotated, and read as coming loose.
export const CARET_RING = 14

// The + that adds a ghost, which stands at the end of its own branch rather than
// off in a corner of the card: the thing the tree is pointing at IS the thing
// you press. Smaller than the 27 it is elsewhere — here it is one terminator
// among many and has to sit in the caret's column.
export const ADD_ENDPOINT = 18

// WHAT A BRANCH ENDS ON, as the radius it has to stop short by. A dot is drawn
// by the tree itself and so needs no clearance; a ring and a + are drawn around
// the point, and a line run to their centre would strike through them.
export const ENDPOINT = { dot: 0, caret: CARET_RING / 2, add: ADD_ENDPOINT / 2 }
// The air between a connector and the thing it points at, where the branch ends
// at TEXT rather than at a box with a caret to aim for. Without it the dot sits
// under the first letter of the room it is pointing to.
export const GUIDE_GAP = 3

// --- WHERE THE TREE ATTACHES ------------------------------------------------
//
// Both canvases hand the same three measurements to the guide layer
// (CanvasGuides.jsx), which is the only thing that draws it. They are here
// because they are geometry, and because a second copy of them in the other
// layout is exactly how the two canvases drifted before.
//
// Every one is measured from a box's OUTER top-left, which is what the layouts
// place boxes by.

// A row's caret: the point a branch leaves its parent at, and lands on its
// child at.
export const caretAt = (x, y) => ({ x: x + GUIDE_X, y: y + ROW_HEIGHT / 2 })

// Where a branch leaves its parent — the bottom tip of the caret glyph, so the
// line comes out of the control that opened the thing rather than through it. A
// row with no caret has the line start at its centre and take a dot instead.
export const branchFrom = (x, y, clear = ENDPOINT.dot) => {
  const c = caretAt(x, y)
  return { x: c.x, y0: c.y + clear, originDot: clear === ENDPOINT.dot }
}

// Where a branch lands — see ENDPOINT for what `clear` is.
export const branchTo = (x, y, clear = ENDPOINT.dot) => {
  const c = caretAt(x, y)
  return { x: c.x - clear, y: c.y, dot: clear === ENDPOINT.dot }
}

// And a room, which is a line of text rather than a box: the branch takes the
// shorter ROOM_STEP and is capped with a dot, with the name starting past it.
// ROOM_INDENT is the same measurement read from the list's own left edge.
//
// `depth` is 0 for a row hanging off the card and 1 for one inside a ROOM GROUP
// — the list is two deep at most, because a room group is (see data/tree.js).
export const branchToRoom = (cardX, cardY, i, depth = 0) => ({
  x: cardX + GUIDE_X + ROOM_STEP * (depth + 1),
  y: cardY + ROW_HEIGHT + ROOM_LIST_TOP + i * ROOM_LINE_HEIGHT + ROOM_LINE_HEIGHT / 2,
  dot: true,
})

// Where a room's NAME starts inside the list, which is itself inset by ROW_INSET
// like every other row: the step, then the dot, then the air before the text.
export const ROOM_INDENT = DEPT_CARET / 2 + ROOM_STEP + GUIDE_DOT / 2 + GUIDE_GAP
// One more step for a row inside a room group, so its dot lands where
// branchToRoom puts it at depth 1.
export const ROOM_GROUP_STEP = ROOM_STEP

// THE WHOLE TREE INSIDE AN OPEN CARD, from its rows. The rows at depth 0 hang
// off the card's own caret; a ROOM GROUP row is itself the parent of the rows
// stepped in under it, and takes a dot rather than a caret because the card's
// caret is what opened the lot.
//
// Both canvases call this: the card is drawn once (DepartmentCardFace) and its
// tree has to be built once too, or the two tabs branch differently to the same
// list. See data/tree.js for what a room group is.
export function roomBranches(cardX, cardY, rows) {
  const at = (i, depth) => branchToRoom(cardX, cardY, i, depth)
  const top = rows.map((row, i) => ({ row, i })).filter(({ row }) => !row.depth)
  const out = [{ ...branchFrom(cardX, cardY, ENDPOINT.caret), children: top.map(({ i }) => at(i, 0)) }]

  top.forEach(({ row, i }) => {
    if (!row.group) return
    const children = []
    for (let j = i + 1; j < rows.length && rows[j].depth; j += 1) children.push(at(j, 1))
    // A group with nothing under it would be a line ending in air — the one
    // thing this tree never draws.
    if (children.length === 0) return
    const from = at(i, 0)
    out.push({ x: from.x, y0: from.y, originDot: true, children })
  })
  return out
}
// One alpha for every segment. The ink is already a PAIRED colour, so it has
// contrast in hand: 0.35 threw most of it away and the section level all but
// disappeared, 1 made a hairline out-shout the names it sits under.
export const GUIDE_ALPHA = 0.55

// THE AIR BETWEEN TWO SECTIONS, side by side in a building's band. Wider than
// the GAP between boxes stacked INSIDE a section, and deliberately: a section is
// a whole department list read top to bottom, so the eye has to know where one
// stops without a rule to tell it. Derived, like CARD_GAP — the relation between
// the two is what makes the nesting legible.
export const SECTION_GAP = GAP * 3

// The air between a building's core section and the band proper. It is the only
// thing saying the core is not one of the sections in the row, so it has to be
// wider than the air BETWEEN those sections — derived from it for that reason,
// or widening the row silently turns the core into the first of them.
export const CORE_GAP = SECTION_GAP * 1.5

// A building's heading is a title, not a card header — see CanvasBandHeading.
// It gets its own height because 30px cannot hold 30px type.
export const BUILDING_LABEL_HEIGHT = 52

// The air between two buildings, far wider than the GAP between boxes inside
// one. Buildings are the only thing stacked down the canvas, and with no box
// around them this gap is most of what separates one from the next — at GAP the
// bands ran together and the headings stopped reading as titles.
export const BUILDING_GAP = 88

// Content starts PADDING below the header and ends PADDING above the bottom
// edge. The SIDES are not PADDING and no longer can be: they are the nesting
// steps, NEST_LEFT and NEST_RIGHT, which is what the figure datum is built on.
const CONTENT_TOP = LABEL_HEIGHT + PADDING

// A group box: a header, then cards stacked down it, CARD_GAP apart — closer
// than the GAP between the group boxes themselves.
//
// `childHeight` is a number when every card is the same — the Tree tab — or a
// function of the child when they differ, which is how the option canvas draws a
// ghost shorter than a card carrying figures. The stack is walked cumulatively
// either way rather than stepping by a pitch.
//
// COLLAPSED, the box is its header and nothing else, and it places no children
// at all — both canvases then emit no department nodes for it. Which groups are
// collapsed lives above this, in the canvas, for the same reason an open room
// list does: a group's height is what its section stacks the next group by, so a
// box that closed itself would climb over its neighbours.
export function layoutGroupBox(children, childHeight, { collapsed = false } = {}) {
  const heightOf = typeof childHeight === 'function' ? childHeight : () => childHeight

  const width = NODE_WIDTH + NEST_LEFT + NEST_RIGHT

  if (collapsed) {
    return {
      width,
      height: LABEL_HEIGHT,
      childPositions: [],
      isEmpty: children.length === 0,
      collapsed: true,
    }
  }

  const childPositions = []
  let y = CONTENT_TOP
  children.forEach((entry) => {
    childPositions.push({ entry, x: NEST_LEFT, y, height: heightOf(entry) })
    y += heightOf(entry) + CARD_GAP
  })

  const bodyHeight = children.length === 0 ? EMPTY_HEIGHT : y - CARD_GAP - CONTENT_TOP

  return {
    width,
    height: CONTENT_TOP + bodyHeight + PADDING,
    childPositions,
    isEmpty: children.length === 0,
    collapsed: false,
  }
}

// A section box: a header, then group boxes, which vary in height and so can't
// use the fixed pitch above.
export function layoutSectionBox(groupBoxes) {
  const inner = NODE_WIDTH + NEST_LEFT + NEST_RIGHT
  const width =
    NEST_LEFT + NEST_RIGHT + Math.max(inner, ...(groupBoxes.length ? groupBoxes.map((gb) => gb.width) : [0]))

  let runningY = CONTENT_TOP
  const placed = groupBoxes.map((gb) => {
    const y = runningY
    runningY += gb.height + GAP
    return { ...gb, x: NEST_LEFT, y }
  })

  const contentBottom = groupBoxes.length === 0 ? CONTENT_TOP + EMPTY_HEIGHT : runningY - GAP
  return {
    width,
    height: contentBottom + PADDING,
    placed,
    isEmpty: groupBoxes.length === 0,
  }
}

// A building band: a heading, then section boxes side by side beneath it.
//
// The same shape as layoutSectionBox with the axes swapped — groups stack
// downwards inside a section, sections run across inside a building. Boxes vary
// in both dimensions here, so the band is as tall as its tallest child.
//
// `labelHeight` because a building's heading is a title rather than a card
// header, and needs the room for it.
//
// No PADDING on the left: with no box around a building, there is no edge to be
// inset from, and its heading and its first section must start on the same
// line as every other building's.
export function layoutRowBox(boxes, labelHeight = LABEL_HEIGHT) {
  const contentTop = labelHeight + PADDING

  let runningX = 0
  const placed = boxes.map((box) => {
    const x = runningX
    runningX += box.width + SECTION_GAP
    return { ...box, x, y: contentTop }
  })

  const contentRight = boxes.length === 0 ? NODE_WIDTH + PADDING * 2 : runningX - SECTION_GAP
  const tallest = boxes.length === 0 ? EMPTY_HEIGHT : Math.max(...boxes.map((b) => b.height))

  return {
    width: contentRight,
    height: contentTop + tallest,
    placed,
    isEmpty: boxes.length === 0,
  }
}
