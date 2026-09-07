// The frame around a React Flow canvas: a vertical scrollbar down the LEFT and
// a horizontal one along the bottom, each in a gutter of its own.
//
// The gutters are real regions of the layout, not an overlay. A bar floating on
// the canvas sits on top of the drawing, catches drags meant for a card, and
// moves whenever the pane resizes; a gutter takes its own strip of the box and
// the canvas simply gets what is left.
//
// React Flow pans by drag and wheel alone, which says nothing about where in the
// drawing you are. The knub says it: its centre is the centre of what is on
// screen, expressed as a fraction of the whole drawing. Drag it to pan.
//
// A FIXED-SIZE KNUB, not a proportional bar. A real scrollbar's length is how
// much of the document is in view — but this canvas zooms, so that length would
// change under the pointer on every wheel notch, and the thing you were dragging
// would grow and shrink as you dragged it. One size, one meaning: position.
//
// Left, not right, because side is on the right — the two would have ended up
// as a double rule down the middle of the screen, and the canvas's own controls
// belong on the edge you are not reading towards.
//
// Must be rendered INSIDE a <ReactFlowProvider> (the gutters are outside
// <ReactFlow>, so they cannot rely on its implicit one).

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReactFlow, useStore } from 'reactflow'
import { RULE_INNER } from '../layout.js'

export const GUTTER = 14
// The knub is FATTER than its gutter by 10%, so it overhangs the track slightly
// on both edges and reads as a control sitting on the frame rather than as a
// mark inside a groove. Its cross-axis offset below is what centres the
// overhang, and goes negative on purpose.
const THUMB = Math.round(GUTTER * 1.1)
const KNUB = 34

// Hold SHIFT for a fifth of the speed. A short track mapped onto a long drawing
// is sensitive by arithmetic — a 600px gutter describing 6000px of canvas moves
// ten flow units per pixel and no layout fixes that. What fixes it is a gear:
// coarse to get across, fine to land.
const FINE = 0.2

// Dark track, light knub — the inverse of a browser scrollbar, because these
// gutters frame a pale canvas: a light track would have merged into it and left
// the frame reading as empty margin. The knub is the lit thing on a dark band.
const TRACK_BG = '#c9c9c9'
const KNUB_BG = 'rgba(255,255,255,0.72)'
const KNUB_BG_HOT = '#fff'

// What the wheel does, decided by WHICH DEVICE turned it. Both canvases spread
// this, so neither can answer a gesture differently.
//
// The two devices want opposite things from the same event, and there is no
// setting that serves both:
//
//   A MOUSE has one axis and detents. Its wheel means zoom — the app's original
//   behaviour, and the only thing a single wheel can usefully do on a canvas.
//   Binding it to pan left no way to zoom but a modifier.
//   A TOUCHPAD swipe is also a wheel event, in two axes and pixel-fine. It means
//   pan. Bound to zoom, a two-finger scroll zoomed the drawing — the one gesture
//   nobody means, which is where this started.
//
// So detect the device from the events themselves and switch. Both keep
// zoomOnPinch (pinch, and ctrl/⌘ + wheel, which React Flow routes here) and drop
// zoomOnDoubleClick: on a canvas of cards a double-click is a mis-click, and it
// lands you at a zoom you did not ask for.
const MOUSE_INPUT = { zoomOnScroll: true, panOnScroll: false, zoomOnPinch: true, zoomOnDoubleClick: false }
const PAD_INPUT = { zoomOnScroll: false, panOnScroll: true, zoomOnPinch: true, zoomOnDoubleClick: false }

// A wheel event's own shape says which device sent it. Nothing else does — the
// browser exposes no device identity — so this is a heuristic, and it is written
// to hold its answer until something CONCLUSIVE says otherwise rather than
// flickering between the two mid-gesture.
//
//   deltaMode !== 0   lines or pages, never pixels: a mouse.
//   |deltaY| >= 100 and a whole number, with no deltaX: a detent. A mouse.
//   deltaX, or a fractional deltaY: two axes and sub-pixel precision, which a
//                     wheel cannot produce. A touchpad.
//
// Anything else is left alone. A mouse is the default, because it is what the
// wheel did before this existed and the wrong guess is cheap either way: one
// scroll re-decides it, including when a mouse is plugged into a laptop later.
function deviceFrom(e) {
  if (e.ctrlKey) return null // A pinch, or a deliberate zoom. Says nothing.
  if (e.deltaMode !== 0) return 'mouse'
  if (e.deltaX !== 0 || !Number.isInteger(e.deltaY)) return 'pad'
  if (Math.abs(e.deltaY) >= 100) return 'mouse'
  return null
}

export function useCanvasInput() {
  const [device, setDevice] = useState('mouse')

  useEffect(() => {
    const onWheel = (e) => {
      const next = deviceFrom(e)
      if (next) setDevice((d) => (d === next ? d : next))
    }
    // Capture and passive: this only observes. React Flow's own handler runs
    // regardless, and must not be delayed by ours.
    window.addEventListener('wheel', onWheel, { capture: true, passive: true })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  return device === 'pad' ? PAD_INPUT : MOUSE_INPUT
}

// The drawing's extent in flow coordinates. Every node counts, nested ones
// included — a child sticking out of its parent is still something to scroll to.
function contentBounds(nodeInternals) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  nodeInternals.forEach((n) => {
    const p = n.positionAbsolute ?? n.position
    if (!p) return
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + (n.width ?? 0))
    maxY = Math.max(maxY, p.y + (n.height ?? 0))
  })
  return minX === Infinity ? null : { minX, minY, maxX, maxY }
}

// `at` is 0..1: where the centre of the view sits in the drawing. The knub's own
// length never enters the arithmetic — it only shortens the travel, because the
// knub's ends must stay inside the track at either extreme.
function Knub({ axis, at, trackPx, onDrag }) {
  const [hot, setHot] = useState(false)
  const dragRef = useRef(null)
  const horizontal = axis === 'x'

  const travelPx = Math.max(0, trackPx - KNUB)

  return (
    <div
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = { from: horizontal ? e.clientX : e.clientY, at }
      }}
      // Accumulated step by step rather than measured from where the drag
      // started, so holding SHIFT part way through changes the rate from there
      // instead of yanking the canvas to a recomputed position.
      onPointerMove={(e) => {
        const d = dragRef.current
        if (!d || travelPx <= 0) return
        const pos = horizontal ? e.clientX : e.clientY
        const step = ((pos - d.from) / travelPx) * (e.shiftKey ? FINE : 1)
        d.from = pos
        d.at = Math.min(1, Math.max(0, d.at + step))
        onDrag(d.at)
      }}
      onPointerUp={() => (dragRef.current = null)}
      // The only modifier gesture in the app, so it has to say so somewhere.
      title="Drag to pan · hold Shift for fine control"
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      style={{
        position: 'absolute',
        [horizontal ? 'left' : 'top']: Math.min(1, Math.max(0, at)) * travelPx,
        [horizontal ? 'width' : 'height']: KNUB,
        [horizontal ? 'height' : 'width']: THUMB,
        [horizontal ? 'top' : 'left']: (GUTTER - THUMB) / 2,
        borderRadius: 5,
        background: hot ? KNUB_BG_HOT : KNUB_BG,
        transition: 'background 120ms',
        cursor: horizontal ? 'ew-resize' : 'ns-resize',
        touchAction: 'none',
      }}
    />
  )
}

export default function CanvasFrame({ children }) {
  const { setViewport } = useReactFlow()
  const nodeInternals = useStore((s) => s.nodeInternals)
  const transform = useStore((s) => s.transform)
  // The pane's own size, which is exactly each gutter's length — the gutters
  // take their strip first and the canvas gets the remainder.
  const paneWidth = useStore((s) => s.width)
  const paneHeight = useStore((s) => s.height)

  const [tx, ty, zoom] = transform

  // Centre this axis on `f` (0..1) of the drawing — the knub marks a centre, so
  // dropping it half way puts the middle of the drawing in the middle of the
  // canvas, whatever the zoom.
  const panTo = useCallback(
    (axis, f, span, visible, min) => {
      const at = min + f * span - visible / 2
      setViewport(axis === 'x' ? { x: -at * zoom, y: ty, zoom } : { x: tx, y: -at * zoom, zoom })
    },
    [setViewport, tx, ty, zoom]
  )

  const bounds = contentBounds(nodeInternals)
  let bars = null

  if (bounds && paneWidth && paneHeight) {
    const viewX = -tx / zoom
    const viewY = -ty / zoom
    const visW = paneWidth / zoom
    const visH = paneHeight / zoom

    // The range is the drawing plus HALF A SCREEN of slack at each end — enough
    // to bring an edge card off the rim, and no more.
    //
    // It used to be the drawing UNIONED with wherever you had panned to, which
    // made the range grow every time you overshot and never shrink back: one
    // stray swipe into empty space and the whole track was remapped onto a much
    // bigger world, so every later drag moved the canvas further per pixel. The
    // knub felt twitchy because it WAS, and progressively. A fixed range is
    // stable, and the knub simply clamps at 0 or 1 while you are outside it —
    // the next drag brings you back in.
    const minX = bounds.minX - visW / 2
    const spanX = bounds.maxX - bounds.minX + visW
    const minY = bounds.minY - visH / 2
    const spanY = bounds.maxY - bounds.minY + visH

    // Where the CENTRE of the view sits in that range — 0.5 when everything
    // fits and you have not panned, which is the honest reading of "you are
    // looking at all of it".
    bars = {
      x: {
        at: (viewX + visW / 2 - minX) / spanX,
        onDrag: (f) => panTo('x', f, spanX, visW, minX),
      },
      y: {
        at: (viewY + visH / 2 - minY) / spanY,
        onDrag: (f) => panTo('y', f, spanY, visH, minY),
      },
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: `${GUTTER}px minmax(0, 1fr)`,
        gridTemplateRows: `minmax(0, 1fr) ${GUTTER}px`,
      }}
    >
      <div
        style={{
          position: 'relative',
          background: TRACK_BG,
          borderRight: RULE_INNER,
        }}
      >
        {bars && <Knub axis="y" trackPx={paneHeight} {...bars.y} />}
      </div>

      <div style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>{children}</div>

      {/* The corner the two gutters meet in: filled, so the frame reads as one
          band turning a right angle rather than two bars that stop short. */}
      <div style={{ background: TRACK_BG, borderTop: RULE_INNER, borderRight: RULE_INNER }} />

      <div style={{ position: 'relative', background: TRACK_BG, borderTop: RULE_INNER }}>
        {bars && <Knub axis="x" trackPx={paneWidth} {...bars.x} />}
      </div>
    </div>
  )
}
