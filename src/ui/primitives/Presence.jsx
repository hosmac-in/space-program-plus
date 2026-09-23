import { createContext, useContext, useEffect, useRef, useState } from 'react'

// A LIST WHOSE ROWS SLIDE OPEN WHEN THEY ARRIVE AND SHUT WHEN THEY GO — the
// option canvas's motion, for a list in flow. The option cards' own timing, so
// the two tabs move alike.
//
// A row that leaves is KEPT, drawn from its last known item, until its slide
// has finished; it sits after the neighbour it had. Rows present when the list
// first mounts do not animate: a nested list mounts inside a parent that is
// already sliding open, and animating both reads as a stutter.
//
// THE DIFF IS MADE DURING RENDER, not in an effect. Made in an effect, the row
// is dropped for one render and remounted — already shut, so it never slides.
//
// Height by a 0fr -> 1fr grid row (.spp-slide), for the reason index.css gives,
// and so reduced motion switches it off with everything else.
export const PRESENCE_MS = 450
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

// TRUE INSIDE A ROW THAT IS LEAVING. PanelTree's Branch reads it and drops out
// of the drawing at once: the tree is one SVG over the panel, not inside the
// row, so a leaving row's lines and carets would otherwise stay at full ink and
// pile onto its neighbours while its text faded.
export const LeavingCtx = createContext(false)
export const useLeaving = () => useContext(LeavingCtx)

export default function Presence({ items, keyOf, children }) {
  const keys = items.map(keyOf)
  const sig = keys.join('\u0000')
  const [state, setState] = useState(() => ({ sig, keys, items, leaving: [] }))
  const timers = useRef(new Map())
  const initial = useRef(new Set(keys))

  let { leaving } = state
  if (state.sig !== sig) {
    const gone = state.keys
      .map((key, i) => ({ key, item: state.items[i], after: state.keys[i - 1] ?? null }))
      .filter((g) => !keys.includes(g.key))
    leaving = [...state.leaving.filter((l) => !keys.includes(l.key) && !gone.some((g) => g.key === l.key)), ...gone]
    setState({ sig, keys, items, leaving })
  } else if (state.items !== items) {
    // Same rows, fresh figures: keep the last items current for when one goes.
    setState({ ...state, items })
  }

  // Timers follow the leaving list: one per row still sliding shut, cancelled
  // if it comes back.
  useEffect(() => {
    const live = new Set(leaving.map((l) => l.key))
    timers.current.forEach((t, key) => {
      if (live.has(key)) return
      clearTimeout(t)
      timers.current.delete(key)
    })
    live.forEach((key) => {
      if (timers.current.has(key)) return
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key)
          setState((s) => ({ ...s, leaving: s.leaving.filter((l) => l.key !== key) }))
        }, PRESENCE_MS)
      )
    })
  }, [leaving])

  useEffect(() => {
    const t = timers.current
    return () => t.forEach(clearTimeout)
  }, [])

  const shown = items.map((item, i) => ({ key: keys[i], item, gone: false }))
  leaving.forEach((l) => {
    if (shown.some((s) => s.key === l.key)) return
    const at = l.after == null ? -1 : shown.findIndex((s) => s.key === l.after)
    shown.splice(at + 1, 0, { key: l.key, item: l.item, gone: true })
  })

  return shown.map(({ key, item, gone }) => (
    <Grow key={key} appear={!initial.current.has(key)} gone={gone}>
      {children(item)}
    </Grow>
  ))
}

function Grow({ appear, gone, children }) {
  const [open, setOpen] = useState(!appear)
  const [settled, setSettled] = useState(!appear)
  const outer = useLeaving()

  useEffect(() => {
    if (open) return undefined
    // Two frames, so the closed state is painted before the open one is asked
    // for — otherwise the browser has no start to transition from.
    let second
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setOpen(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shut = gone || !open
  return (
    <LeavingCtx.Provider value={outer || gone}>
      <div
        className="spp-slide"
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !shut) setSettled(true)
        }}
        style={{
          gridTemplateRows: shut ? '0fr' : '1fr',
          opacity: shut ? 0 : 1,
          transition: `grid-template-rows ${PRESENCE_MS}ms ${EASE}, opacity ${PRESENCE_MS}ms ${EASE}`,
        }}
      >
        {/* Clipped only while moving: a settled row must not clip a caret's hit
            area or anything else drawn past its edge. */}
        <div style={{ minHeight: 0, overflow: settled && !shut ? 'visible' : 'hidden' }}>{children}</div>
      </div>
    </LeavingCtx.Provider>
  )
}
