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

// HOW FAR A HEADER'S AREA FIGURE SITS FROM ITS CARD'S RIGHT EDGE, at each of
// the two levels — and the two are chosen so the figures land in ONE COLUMN
// down the nesting, not so each is tidy within its own box.
//
// A card that reserves the control column pays for the column and the gap
// before it; one that does not is inset by PADDING inside its parent instead,
// and pays that back. So:
//
//     section:  CARD_CONTROL_INSET + HEADER_GAP + CARD_CONTROL
//     group:    the same, less the PADDING it is already inset by
//
//   >>> These two are a PAIR. Change the control size, the gap or PADDING and
//   >>> the figures stagger again — which is exactly what "nearly aligned"
//   >>> looked like, and it is only a few pixels, so it reads as a mistake
//   >>> rather than as a difference.
export const FIGURE_INSET = CARD_CONTROL_INSET + HEADER_GAP + CARD_CONTROL
export const FIGURE_INSET_NESTED = FIGURE_INSET - PADDING
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
// The air between the name row and the first room line.
const ROOM_LIST_TOP = 4
export const roomListHeight = (count) => (count === 0 ? 0 : ROOM_LIST_TOP + count * ROOM_LINE_HEIGHT)

// A card with nothing listed: one name, centred in it, which is what both tabs
// drew before there was a list.
export const DEPT_HEAD_HEIGHT = 60
// With a list, the card is laid out top-down instead — the same inset above the
// name and below the last room. The card carries no vertical padding of its own:
// these are its only two, so departmentCardHeight is the whole sum.
export const DEPT_HEAD_INSET = 14
export const DEPT_NAME_ROW = 20

// What a card has to be to hold its list. The card must draw at exactly this
// height or every card below it in the group stops lining up, so the face and
// both layouts read the one function.
export const departmentCardHeight = (roomCount) =>
  roomCount === 0
    ? DEPT_HEAD_HEIGHT
    : DEPT_HEAD_INSET * 2 + DEPT_NAME_ROW + roomListHeight(roomCount)

// How far the name and the area figure stop short of the card's content edge, to
// clear the × (or +) pinned in the corner — CARD_CONTROL wide at a 4px inset, so
// this is what is left of it plus a gap. Without it the area figure sits under
// the button at the exact moment it is longest.
export const DEPT_CONTROL_INSET = 12

// The disclosure caret's column, RESERVED WHETHER OR NOT A CARD HAS ONE — a
// department with no rooms would otherwise start its name 18px left of every
// other card in the group, which reads as a different kind of card rather than
// as an empty one.
//
// The room list is indented by the whole column, so a room name starts exactly
// under the department's name, and the rule down the list runs through the
// caret's own centre.
export const DEPT_CARET = 12
export const DEPT_CARET_COL = DEPT_CARET + HEADER_GAP

// The air between a building's core section and the band proper. Wider than
// GAP because it is the only thing saying the core is not one of the sections
// in the row — at GAP it read as the first of them.
export const CORE_GAP = GAP * 2

// A building's heading is a title, not a card header — see CanvasBandHeading.
// It gets its own height because 30px cannot hold 30px type.
export const BUILDING_LABEL_HEIGHT = 52

// The air between two buildings, far wider than the GAP between boxes inside
// one. Buildings are the only thing stacked down the canvas, and with no box
// around them this gap is most of what separates one from the next — at GAP the
// bands ran together and the headings stopped reading as titles.
export const BUILDING_GAP = 88

// Content starts PADDING below the header and ends PADDING above the bottom
// edge, matching the PADDING used left and right — so a card is inset by the
// same amount on all four sides of its container.
const CONTENT_TOP = LABEL_HEIGHT + PADDING

// A group box: a header, then cards stacked down it.
//
// `childHeight` is a number when every card is the same — the Tree tab — or a
// function of the child when they differ, which is how the option canvas draws a
// ghost shorter than a card carrying figures. The stack is walked cumulatively
// either way rather than stepping by a pitch.
export function layoutGroupBox(children, childHeight) {
  const heightOf = typeof childHeight === 'function' ? childHeight : () => childHeight

  const childPositions = []
  let y = CONTENT_TOP
  children.forEach((entry) => {
    childPositions.push({ entry, x: PADDING, y, height: heightOf(entry) })
    y += heightOf(entry) + GAP
  })

  const bodyHeight = children.length === 0 ? EMPTY_HEIGHT : y - GAP - CONTENT_TOP

  return {
    width: NODE_WIDTH + PADDING * 2,
    height: CONTENT_TOP + bodyHeight + PADDING,
    childPositions,
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
    runningX += box.width + GAP
    return { ...box, x, y: contentTop }
  })

  const contentRight = boxes.length === 0 ? NODE_WIDTH + PADDING * 2 : runningX - GAP
  const tallest = boxes.length === 0 ? EMPTY_HEIGHT : Math.max(...boxes.map((b) => b.height))

  return {
    width: contentRight,
    height: contentTop + tallest,
    placed,
    isEmpty: boxes.length === 0,
  }
}
