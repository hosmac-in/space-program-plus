// THE TREE, DOWN THE SIDE PANEL — ONE DRAWING, over the whole panel.
//
// The same tree both canvases draw, and every number for it is IMPORTED from
// ui/canvas/canvasLayout.js rather than restated: two trees with two ideas of
// what an indent is are two trees.
//
// >>> IT WAS DRAWN IN SEGMENTS FIRST — each row painting the piece of line
// >>> inside its own box — and it broke exactly where CanvasGuides.jsx says it
// >>> broke on the canvas. A tree is a single object: it has to be drawn as one.
// >>> Do not go back to pieces that are meant to meet.
//
// A canvas can do that easily, because it knows every box's y before it draws
// one. A panel is flow and knows none of them, so the geometry is MEASURED:
// every branch registers the element it belongs to, the layer measures them all
// against its own box, and one SVG is drawn over the top from those points. It
// re-measures whenever the panel changes size, which is what opening a room,
// adding an object or resizing the window all are.
//
// The SVG takes no pointer. A caret's TARGET is a transparent button the branch
// itself renders, in its own coordinates — the drawing and the hit area are two
// things, as they are on the canvas (see DisclosureCaret's `blank`).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ADD_ENDPOINT, CARET_RING, GUIDE_DOT, GUIDE_GAP, GUIDE_INK, ROOM_STEP, ROW_INSET } from '../canvas/canvasLayout.js'
import { CARET_HIT } from '../primitives/DisclosureCaret.jsx'
import { removeHint } from '../primitives/RemoveButton.jsx'
import { useLeaving } from '../primitives/Presence.jsx'

// TWO COLUMNS, AND EVERY LEVEL USES BOTH. Measured from the left edge of the box
// they are drawn in — the panel's own content box, then a room block, then the
// next thing down.
//
//   the spine   a box's own column, which is where its children hang from. It is
//               the box's OWN endpoint, so the line leaves the control that
//               opened the thing rather than starting beside it.
//   the end     where those children's branches stop: the caret or the dot.
//               ROOM_STEP, the canvas's shorter step, because everything the
//               panel branches to is a ROW — a room block is a row with a box
//               drawn round it, not a box with rows inside.
export const BRANCH_SPINE_X = ROW_INSET
export const BRANCH_X = BRANCH_SPINE_X + ROOM_STEP

// THE AIR BESIDE THE LINE — between the spine and anything drawn ALONGSIDE it,
// which is most of a panel: a room's parameter band, its area row, the
// department's factors. Wider than GUIDE_GAP, which is the air at the end of a
// branch POINTING AT something. A hairline running down the side of a column of
// text at 3px reads as part of the text.
export const BRANCH_MARGIN = 8

// A box's own column, from its left edge. Half a ring puts the ring exactly
// inside the box — and exactly AGAINST its edge, which is what made every card
// read as cramped: the caret touched the left wall and the name started a ring's
// width later with nothing either side of it. Half the standard margin again
// gives the ring air inside its own box, and every card gets it from this one
// number: it sets where the branch lands, where the name starts after it, and
// how far in the box's own body begins.
export const BOX_SPINE_X = CARET_RING / 2 + BRANCH_MARGIN / 2
// How far a child BOX is inset, so that column lands directly under the caret
// its branch ended on and the line carries on inside it.
export const BRANCH_BOX = BRANCH_X - BOX_SPINE_X
// Where a child ROW's content starts: clear of the ring the branch lands on. A
// dot ends well short of this and still takes the same column — one indent, or
// the names would step by whether they happen to open.
export const BRANCH_CONTENT = BRANCH_X + CARET_RING / 2 + GUIDE_GAP
// Where the row that owns the whole tree starts its own text, and where
// everything under it starts: beside the line, not against it.
export const BRANCH_ORIGIN_CONTENT = BRANCH_SPINE_X + BRANCH_MARGIN

// THE SAME COLUMN, READ FROM SOMEWHERE INSIDE THE BOX. A room's objects are
// drawn in its body, which sits `inset` in from the block's own edge, so the
// column shifts back by exactly that — which puts the spine in the body's
// padding, clear of everything written in it.
export const insideBox = (inset) => ({ endX: BRANCH_X - inset })
// And how far in that body has to start: past its own box's column, with the
// same air beside the line as everywhere else.
export const BOX_CONTENT = BOX_SPINE_X + BRANCH_MARGIN

// How much of the elbow a terminator eats. A dot is drawn ON the line's end; a
// ring and a + are drawn AROUND it, so a line run to their centre strikes
// through them. Same table as the canvas's ENDPOINT.
const CLEAR = { dot: 0, caret: CARET_RING / 2, add: ADD_ENDPOINT / 2, none: 0 }

const INK = GUIDE_INK
const INK_W = 1

const LayerCtx = createContext(null)
// Who a branch hangs off. Every Branch provides its own id to its subtree, so a
// room's objects find the room without anyone passing anything.
const ParentCtx = createContext(null)

// --- The drawing -------------------------------------------------------------

// One parent and the children hanging off it, as the canvas's path() does it:
// down the parent's own column from just below its caret, then across to each
// child.
function path(parent, kids) {
  const last = kids[kids.length - 1]
  const d = [`M ${parent.x} ${parent.y + CLEAR[parent.endpoint]}`, `L ${parent.x} ${last.y}`]
  kids.forEach((c) => d.push(`M ${parent.x} ${c.y}`, `L ${c.x - CLEAR[c.endpoint]} ${c.y}`))
  return d.join(' ')
}

// A caret, drawn by the tree. The ring is what a branch lands on and it never
// moves; the arrow turns inside it, so the meeting point is the same open or
// shut. A path about its own centre, not a glyph — ▶ is centred by its line box
// rather than by its ink, so it sits off-centre in anything drawn around it and
// rotating swings that offset around the circle.
function Caret({ x, y, expanded }) {
  return (
    <g
      style={{
        transform: expanded ? 'rotate(90deg)' : 'none',
        transformOrigin: `${x}px ${y}px`,
        transition: 'transform 150ms ease',
      }}
    >
      <path d={`M ${x - 1.8} ${y - 3.4} L ${x + 3} ${y} L ${x - 1.8} ${y + 3.4} Z`} fill={INK} stroke="none" />
    </g>
  )
}

function Drawing({ nodes }) {
  if (!nodes || nodes.length === 0) return null

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const kidsOf = new Map()
  nodes.forEach((n) => {
    if (!n.parentId || !byId.has(n.parentId)) return
    const list = kidsOf.get(n.parentId) ?? []
    list.push(n)
    kidsOf.set(n.parentId, list)
  })

  const ds = []
  kidsOf.forEach((kids, parentId) => {
    kids.sort((a, b) => a.y - b.y)
    ds.push(path(byId.get(parentId), kids))
  })

  // A dot marks the end of a branch, or the start of one. A row with neither —
  // the root of a panel that has nothing under it — gets no mark at all.
  const dots = nodes.filter((n) => n.endpoint === 'dot' && (byId.has(n.parentId) || kidsOf.has(n.id)))
  const carets = nodes.filter((n) => n.endpoint === 'caret')

  return (
    <svg
      // Over everything it crosses, and taking no pointer — the canvas's rule.
      // An elbow lands on a caret drawn INSIDE a room block, which is the whole
      // reason the segmented version could not join up.
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'visible' }}
      aria-hidden
    >
      <g fill="none" stroke={INK} strokeWidth={INK_W} strokeLinecap="round">
        {ds.map((d, i) => (
          <path key={i} d={d} />
        ))}
        {carets.map((c) => (
          <circle key={`r${c.id}`} cx={c.x} cy={c.y} r={CARET_RING / 2} />
        ))}
      </g>
      {dots.map((p) => (
        <circle key={`d${p.id}`} cx={p.x} cy={p.y} r={GUIDE_DOT / 2} fill={INK} />
      ))}
      {carets.map((c) => (
        <Caret key={`c${c.id}`} x={c.x} y={c.y} expanded={c.expanded} />
      ))}
    </svg>
  )
}

// --- The layer ---------------------------------------------------------------

// Everything a branch has to be measured by, and the one place it is drawn.
// Wraps a whole panel — see PanelShell, which is the only caller.
// The layer's re-measure, for a caller animating a block the tree runs through:
// a slide moves every row under it, and nothing else tells the layer so.
export function useTreeMeasure() {
  return useContext(LayerCtx)?.measure ?? null
}

export function TreeLayer({ children }) {
  const hostRef = useRef(null)
  // The registry. A ref, not state: registering must not re-render, or every
  // branch mounting would redraw the panel. `version` is what asks for a
  // re-measure when the SHAPE of the tree changes.
  const items = useRef(new Map())
  const [version, setVersion] = useState(0)
  const [nodes, setNodes] = useState([])

  const register = useCallback((id, node) => {
    items.current.set(id, node)
    setVersion((v) => v + 1)
    return () => {
      items.current.delete(id)
      setVersion((v) => v + 1)
    }
  }, [])

  // MEASURED AGAINST THE HOST, with getBoundingClientRect rather than offsets:
  // the panel sits in a scrolling column and the rows are nested inside boxes
  // that are positioned, padded and transformed independently.
  const measure = useCallback(() => {
    const host = hostRef.current
    if (!host) return
    const hb = host.getBoundingClientRect()
    const next = []
    items.current.forEach((n, id) => {
      const el = n.ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      next.push({
        id,
        parentId: n.parentId,
        endpoint: n.endpoint,
        expanded: n.expanded,
        // `absX` is measured from the PANEL, not from the element — the root's
        // column is the panel's own, while the element it is measured by is the
        // department's name, which is already indented past that column. Reading
        // x off that element put the whole spine 16px right, on top of the very
        // text it was supposed to run beside, and every elbow backwards.
        x: n.absX != null ? n.absX : r.left - hb.left + n.endX,
        // A row one line tall is measured by its own middle; anything taller —
        // a room block, whose height is its contents — states where its head is.
        y: r.top - hb.top + (n.head == null ? r.height / 2 : n.head),
      })
    })
    setNodes((prev) => (same(prev, next) ? prev : next))
  }, [])

  // After every render of the panel, and after any registration. A layout effect
  // so the drawing is never one frame behind what it describes.
  useLayoutEffect(measure, [measure, version])

  // The panel's own height is what changes when a room opens, an object is
  // added or the window is resized — one observer catches all three.
  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [measure])

  const api = useMemo(() => ({ register, measure }), [register, measure])

  return (
    <LayerCtx.Provider value={api}>
      <div ref={hostRef} style={{ position: 'relative', minWidth: 0 }}>
        <Drawing nodes={nodes} />
        {children}
      </div>
    </LayerCtx.Provider>
  )
}

function same(a, b) {
  if (a.length !== b.length) return false
  return a.every((n, i) => {
    const m = b[i]
    return n.id === m.id && n.x === m.x && n.y === m.y && n.endpoint === m.endpoint && n.expanded === m.expanded
  })
}

// --- One branch --------------------------------------------------------------

// ONE CHILD, AND ITS PLACE IN THE DRAWING. It draws no line itself: it registers
// where its own end is and lets the layer draw the whole tree at once.
//
//   `endX`     its terminator's column, from this element's own left edge.
//   `head`     where its row's middle is. Omitted for an item that IS one row —
//              then it is measured, which is always right.
//   `padTop`   the air above it, as padding rather than as a margin on what is
//              inside: `head` is measured from this box's top.
//
// `last` and `first` are gone with the segments — the layer knows which child is
// last because it can see them all.
export function Branch({
  head,
  padTop = 0,
  endpoint = 'dot',
  expanded = false,
  onToggle,
  title,
  endX = BRANCH_X,
  // RIGHT-CLICK ON THE BRANCH'S END to remove what it points at. There is no ×
  // on a row in this panel: the canvases settled on this, and a second gesture
  // for one act is worse than one that has to be learnt. The caller ALWAYS
  // prompts.
  onRemove,
  removeTitle = removeHint(),
  // A + STANDING ON THE BRANCH'S END, for a ghost: the thing the tree points at
  // is the thing you press. Drawn by the tree, like the caret and for the same
  // reason — the line and the control it lands on cannot be placed by two
  // components and be relied on to meet. (The pickers use `endpoint="add"` with
  // no node here and put their own + in the content flow, which is why this is
  // optional rather than derived from the endpoint.)
  add = null,
  // Where this row's content starts. Defaulted from the terminator, so a caller
  // states it only to put something of its own on the branch's end — which is
  // what an add button does — or to hand the branch a BOX to enter.
  contentAt = endpoint === 'add' ? endX - ADD_ENDPOINT / 2 : endX + CARET_RING / 2 + GUIDE_GAP,
  children,
}) {
  const layer = useContext(LayerCtx)
  const parentId = useContext(ParentCtx)
  const id = useId()
  const ref = useRef(null)

  // A row sliding out of a Presence list leaves the drawing at once — see
  // LeavingCtx. False everywhere else.
  const leaving = useLeaving()

  useLayoutEffect(() => {
    if (!layer || leaving) return undefined
    return layer.register(id, { ref, endX, head, endpoint, expanded, parentId })
  }, [layer, id, endX, head, endpoint, expanded, parentId, leaving])

  const remove = onRemove
    ? (e) => {
        e.preventDefault()
        e.stopPropagation()
        onRemove()
      }
    : undefined

  return (
    <ParentCtx.Provider value={id}>
      <div ref={ref} style={{ position: 'relative', display: 'flow-root', paddingTop: padTop, paddingLeft: contentAt, minWidth: 0 }}>
        {/* THE TARGET, not the drawing. A 14px ring — or a 4px dot — is no
            pointer target at all, so the gesture is on the whole column it sits
            in, the width a finger or a moving pointer can actually land on. */}
        {(endpoint === 'caret' || (endpoint === 'dot' && onRemove)) && (
          <button
            type="button"
            onClick={onToggle ? (e) => { e.stopPropagation(); onToggle() } : undefined}
            onContextMenu={remove}
            title={[title, onRemove ? removeTitle : null].filter(Boolean).join(' — ')}
            aria-label={title}
            aria-expanded={endpoint === 'caret' ? expanded : undefined}
            style={{
              position: 'absolute',
              zIndex: 2,
              left: endX - CARET_HIT / 2,
              // A caret sits on its own row's head; a dot's column is the whole
              // row, since there is nothing else in it to hit.
              top: endpoint === 'caret' ? (head ?? 0) : 0,
              marginTop: endpoint === 'caret' && head != null ? -CARET_HIT / 2 : 0,
              height: endpoint === 'caret' ? CARET_HIT : undefined,
              bottom: endpoint === 'caret' ? undefined : 0,
              width: CARET_HIT,
              padding: 0,
              background: 'none',
              border: 'none',
              cursor: onToggle ? 'pointer' : 'default',
            }}
          />
        )}
        {add && (
          <span
            style={{
              position: 'absolute',
              zIndex: 2,
              left: endX - ADD_ENDPOINT / 2,
              top: head ?? 0,
              marginTop: head == null ? 0 : -ADD_ENDPOINT / 2,
              width: ADD_ENDPOINT,
              height: ADD_ENDPOINT,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {add}
          </span>
        )}
        {children}
      </div>
    </ParentCtx.Provider>
  )
}

// THE ROOT: what everything else hangs off — a department's heading. It has no
// caret of its own to come out of, so it takes a dot, exactly as the canvas's
// branchFrom does for a parent with none.
//
// It wraps the WHOLE panel, because the rooms are the heading's siblings rather
// than its children; the row it is measured by is handed back through
// `useRootAnchor`, which the heading attaches to its own name. A panel whose
// heading never asks for that anchor — a building's — registers nothing
// measurable and draws nothing.
const RootAnchorCtx = createContext(null)

// `head` is where the trunk starts, from the top of the anchored element. The
// default — its own middle — is right for a heading that is a line of text. A
// caller states it when the anchor is a BLOCK the line must not be drawn across:
// a section's title card, painted in its function colour, where a hairline over
// solid ink is either invisible or a scratch.
export function BranchRoot({ head = null, children }) {
  const layer = useContext(LayerCtx)
  const id = useId()
  const ref = useRef(null)

  useLayoutEffect(() => {
    if (!layer) return undefined
    return layer.register(id, { ref, absX: BRANCH_SPINE_X, head, endpoint: 'dot', parentId: null })
  }, [layer, id, head])

  return (
    <RootAnchorCtx.Provider value={ref}>
      <ParentCtx.Provider value={id}>{children}</ParentCtx.Provider>
    </RootAnchorCtx.Provider>
  )
}

// The element the root is measured by — the department's name, whose own middle
// is where the tree starts.
export function useRootAnchor() {
  return useContext(RootAnchorCtx)
}
