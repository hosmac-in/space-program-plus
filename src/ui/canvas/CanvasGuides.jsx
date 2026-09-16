// THE TREE — ONE DRAWING, over the whole canvas.
//
// It was drawn in segments once, each box painting the piece of line inside
// itself in that box's own ink. The geometry met exactly and it still read as
// four unrelated drawings, because a line that changes colour at every wall is
// not one line. A tree is a single object: it has to be drawn as one.
//
// So this is a layer of its own, in canvas coordinates, ABOVE the boxes — one
// stroke, one ink, from a parent's caret down and across into each child's. The
// boxes no longer know it exists, and it grows and shrinks with them because
// every branch is derived from the same layout pass that placed them.
//
// IT BRINGS ITS OWN GROUND. The line crosses bare canvas, a section's pale tint,
// a group's SOLID function colour — which may be near-black — and a card's pale
// wash, so no single ink survives all four. A white halo under a dark hairline
// does, which is the rule this app already follows wherever a colour has to work
// on an unknown background (see the link ring's plate in CLAUDE.md).
//
// Nothing here takes a pointer: the layer covers the cards.

import { CARET_RING, GUIDE_DOT, GUIDE_INK } from './canvasLayout.js'

// One ink, no backing. A white halo under the line was tried and read as a glow
// around it: on every surface this app actually paints — pale tints and pale
// washes — solid black at a hairline is legible on its own.
const INK = GUIDE_INK
const INK_W = 1

// A branch is one parent and the children hanging off it:
//
//   { x, y0, originDot, children: [{ x, y, dot }] }
//
// `x` is the spine — the parent's caret centre. `y0` is where it leaves that
// caret. Each child gives the point its elbow ends at, which is just short of
// its own caret, or on the dot that stands in for one.
function path(branch) {
  const last = branch.children[branch.children.length - 1]
  const d = [`M ${branch.x} ${branch.y0}`, `L ${branch.x} ${last.y}`]
  branch.children.forEach((c) => d.push(`M ${branch.x} ${c.y}`, `L ${c.x} ${c.y}`))
  return d.join(' ')
}

// A caret, drawn BY THE TREE rather than by the card it belongs to. The ring is
// what a branch lands on and it never moves; the arrow turns inside it, so the
// meeting point is the same open or shut. Drawn here because a line and the
// thing it touches cannot be drawn by two different components and be relied on
// to meet — the card keeps only the behaviour (DisclosureCaret, `blank`).
//
// NO FILL. A disc would have to be a colour, and every one it could be is wrong
// on some function hue — the ring is an outline, like the rest of the tree.
//
// The arrow is a PATH about its own centre, not a glyph: ▶ is centred by its
// line box rather than by its ink, so it sits off-centre in anything drawn
// around it and rotating swings that offset around the circle. Same reason
// AddButton draws its cross.
function Caret({ x, y, expanded }) {
  return (
    <g
      style={{
        transform: expanded ? 'rotate(90deg)' : 'none',
        transformOrigin: `${x}px ${y}px`,
        transition: 'transform 150ms ease',
      }}
    >
      <path
        d={`M ${x - 1.8} ${y - 3.4} L ${x + 3} ${y} L ${x - 1.8} ${y + 3.4} Z`}
        fill={INK}
        stroke="none"
      />
    </g>
  )
}

function GuideLayer({ data }) {
  const branches = data.branches ?? []
  const carets = data.carets ?? []
  if (branches.length === 0 && carets.length === 0) return null

  // Every dot in the drawing: a branch's origin where its parent has no caret to
  // come out of, and the end of any elbow that has no caret to point at.
  const dots = []
  branches.forEach((b) => {
    if (b.originDot) dots.push({ x: b.x, y: b.y0 })
    b.children.forEach((c) => c.dot && dots.push({ x: c.x, y: c.y }))
  })

  const ds = branches.map(path)

  return (
    // IN FLOW, AND SIZED — not an absolutely-positioned child. React Flow keeps
    // a node hidden until it has measured one, and a layer that positioned
    // itself measured 0×0 and stayed invisible for ever.
    //
    // `viewBox` is what lets the paths keep the canvas's own coordinates while
    // the node sits at the drawing's top-left corner rather than at the origin —
    // which keeps the scrollable extent (CanvasFrame) the size of the content.
    <svg
      width={data.width}
      height={data.height}
      viewBox={`${data.origin.x} ${data.origin.y} ${data.width} ${data.height}`}
      style={{ display: 'block', pointerEvents: 'none', overflow: 'visible' }}
    >
      <g fill="none" stroke={INK} strokeWidth={INK_W} strokeLinecap="round">
        {ds.map((d, i) => (
          <path key={i} d={d} />
        ))}
        {carets.map((c, i) => (
          <circle key={`cr${i}`} cx={c.x} cy={c.y} r={CARET_RING / 2} />
        ))}
      </g>
      {dots.map((p, i) => (
        <circle key={`d${i}`} cx={p.x} cy={p.y} r={GUIDE_DOT / 2} fill={INK} />
      ))}
      {carets.map((c, i) => (
        <Caret key={`c${i}`} {...c} />
      ))}
    </svg>
  )
}

export const GUIDE_NODE_TYPE = 'guides'
// Above the cards (30), so an elbow reaches a caret INSIDE its box rather than
// stopping at the border — which is the whole reason the segmented version could
// not join up.
const GUIDE_Z = 35

// The node both canvases emit. One per canvas, at the origin, holding the whole
// tree; it is not draggable, not selectable and takes no pointer, so it is
// invisible to every other thing the canvases do with their node lists.
export function guideNode(branches, carets = []) {
  if (!branches.length && !carets.length) return null

  // The drawing's own bounds. The node is placed at its top-left and sized to
  // it, rather than spanning the canvas from the origin: React Flow needs a
  // measured size to show a node at all, and CanvasFrame's scrollable extent is
  // the union of every node's box — a layer pinned at 0,0 would stretch it.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  branches.forEach((b) => {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y0)
    b.children.forEach((c) => {
      minX = Math.min(minX, c.x)
      maxX = Math.max(maxX, c.x)
      maxY = Math.max(maxY, c.y)
    })
  })
  carets.forEach((c) => {
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x)
    maxY = Math.max(maxY, c.y)
  })

  // Room for the rings and dots, which straddle the points above.
  const pad = CARET_RING
  const origin = { x: minX - pad, y: minY - pad }
  const width = maxX - origin.x + pad
  const height = maxY - origin.y + pad

  return {
    id: 'canvas-guides',
    type: GUIDE_NODE_TYPE,
    position: origin,
    width,
    height,
    style: { width, height, pointerEvents: 'none' },
    data: { branches, carets, origin, width, height },
    zIndex: GUIDE_Z,
    draggable: false,
    selectable: false,
  }
}

export const guideNodeTypes = { [GUIDE_NODE_TYPE]: GuideLayer }
