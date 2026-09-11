// A band: a labelled strip of controls across the top or bottom of main.
//
// The Tree tab's carousels are bands, and so is the Canvas tab's project
// and option bar. They are the same thing — a heavy rule against the canvas, a
// stack of labelled rows divided by lighter ones — so they are one component
// rather than two that drift.
//
// A band holds rows; a row is a fixed-width label and whatever controls belong
// beside it. Mark the last row so the band's own edge isn't doubled by a
// divider directly above it.

import { useCallback, useEffect, useRef, useState } from 'react'

import { RULE, RULE_INNER } from '../layout.js'

export function Band({ edge = 'bottom', children }) {
  return (
    <div
      style={{
        flexShrink: 0,
        background: '#fff',
        [edge === 'top' ? 'borderTop' : 'borderBottom']: RULE,
      }}
    >
      {children}
    </div>
  )
}

// A wheel notch is ~100px, barely half a card, and these lists run to dozens of
// them. Geared up so one notch clears a couple of cards.
const WHEEL_GEAR = 3

// An end arrow. Hidden rather than removed at the end of the track, so the row
// keeps its width and the items under it never shift as you scroll.
function ScrollArrow({ dir, show, onClick }) {
  return (
    <button
      type="button"
      aria-label={dir < 0 ? 'Scroll left' : 'Scroll right'}
      tabIndex={show ? 0 : -1}
      onClick={onClick}
      style={{
        flexShrink: 0,
        width: 20,
        height: 24,
        display: 'grid',
        placeItems: 'center',
        border: 'none',
        background: 'none',
        padding: 0,
        fontSize: 14,
        lineHeight: 1,
        color: '#888',
        cursor: 'pointer',
        visibility: show ? 'visible' : 'hidden',
      }}
    >
      {dir < 0 ? '‹' : '›'}
    </button>
  )
}

// `scroller` turns the row into a carousel: no scrollbar, an arrow at each end,
// and the wheel moving ALONG the list.
//
// The wheel is bound here rather than left to the browser because this strip is
// one line tall and horizontal: a mouse's only axis is deltaY, so without this
// a wheel over the carousel scrolls whatever is behind it and the list cannot be
// reached at all. Not a canvas — see ui/canvas for the two-device problem there.
export function BandRow({ title, last = false, scroller = false, children }) {
  const ref = useRef(null)
  const [ends, setEnds] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    // A pixel of slack: fractional scroll positions never land exactly on the
    // end, and an arrow that stays lit at the end is worse than one that goes
    // dark a pixel early.
    const max = el.scrollWidth - el.clientWidth
    setEnds({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!scroller || !el) return

    // Non-passive: the default would scroll the page as well as the list.
    const onWheel = (e) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (!delta) return
      e.preventDefault()
      el.scrollLeft += delta * WHEEL_GEAR
    }
    el.addEventListener('wheel', onWheel, { passive: false })

    // The arrows answer to content and width, not just to scrolling — items
    // arrive from the catalog after the first render, and side is a fixed width
    // but main is not.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    Array.from(el.children).forEach((c) => ro.observe(c))
    measure()

    return () => {
      el.removeEventListener('wheel', onWheel)
      ro.disconnect()
    }
  }, [scroller, measure, children])

  const nudge = (dir) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 12px',
        borderBottom: last ? undefined : RULE_INNER,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#888',
          // Every label the same width, so the controls beside them line up
          // down the band however long each label is.
          width: 90,
          flexShrink: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {title}
      </span>
      {scroller && <ScrollArrow dir={-1} show={ends.left} onClick={() => nudge(-1)} />}
      <div
        ref={ref}
        className={scroller ? 'spp-noscrollbar' : undefined}
        onScroll={scroller ? measure : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          overflowX: 'auto',
          flex: 1,
          minWidth: 0,
          paddingBottom: 2,
        }}
      >
        {children}
      </div>
      {scroller && <ScrollArrow dir={1} show={ends.right} onClick={() => nudge(1)} />}
    </div>
  )
}
