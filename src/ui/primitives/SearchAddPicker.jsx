import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AddButton from './AddButton.jsx'
import { Z } from './zIndex.js'

// A type-to-filter combobox for lists too long to scroll (500+ rooms), kept
// behind a single + button.
//
// The search field is the exception, not the resting state: a panel showing a
// department's rooms and every room's objects would otherwise be mostly search
// boxes, one per room, each as wide as the panel and none of them in use.
// Clicking + opens the field in a popover; typing filters; clicking an option
// adds it immediately and closes.
//
// An option may carry a `path` — where in the catalog it sits — which is drawn
// as a quiet second line and searched alongside the name. A definition placed
// twice gives two rows identical in every other respect, so without it the
// pickers that list PLACEMENTS rather than definitions would offer a column of
// indistinguishable "Lobby"s. Options without one draw exactly as they always
// did: a single line.
//
// THE POPOVER IS A PORTAL, AND HAS TO BE
//
// It used to be absolutely positioned inside this component, and the last room
// in a department opened a list cut off at the panel's edge, with the HUD
// beneath appearing to be painted over it. That is not a z-index fight and no
// z-index fixes it: `side` is an `overflowY: auto` column (see App.jsx), and a
// scroll container CLIPS its descendants whatever they are stacked at.
//
// So the popover is rendered into document.body, out of that container, and
// positioned from the trigger's bounding rect. The cost is that it no longer
// moves with the panel on its own, which is why it tracks scroll and resize
// below, and why `position: fixed` is what those coordinates are in.
export function SearchAddPicker({ options, placeholder, onAdd, label, title = 'Add', size, width = 260 }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(null)
  const wrapRef = useRef(null)
  const popRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q
      ? options.filter(
          (o) => o.name.toLowerCase().includes(q) || (o.path ?? '').toLowerCase().includes(q)
        )
      : options
    return pool.slice(0, 50)
  }, [options, query])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  // Where the popover sits, in viewport coordinates, measured from the trigger.
  //
  // It flips ABOVE the trigger when there is not enough room below — the last
  // room in a long department sits near the bottom of the panel, which is
  // exactly where a downward list would run off the screen. Clamped so a narrow
  // panel cannot push it off either edge.
  const place = useCallback(() => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const height = popRef.current?.offsetHeight ?? 260
    const flip = below < height + 12 && r.top > below
    setAt({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      top: flip ? undefined : r.bottom + 4,
      bottom: flip ? window.innerHeight - r.top + 4 : undefined,
    })
  }, [width])

  // Measured before paint, so it never renders in the wrong place first.
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  // A portal does not move with the panel, so it is re-placed on anything that
  // could move the trigger. Capture phase, because that catches scrolls on the
  // side column itself and not just the window — the column scrolling is the
  // whole reason the popover had to leave it.
  useEffect(() => {
    if (!open) return undefined
    const onMove = () => place()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, place])

  // Clicking anywhere outside dismisses, the way the field's own blur used to.
  // The popover is no longer inside `wrapRef`, so it has to be asked separately
  // — without this, clicking the search box would close the box.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target) && !popRef.current?.contains(e.target)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginTop: 8, minWidth: 0 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <AddButton onClick={() => (open ? close() : setOpen(true))} title={title} expanded={open} size={size} />
        {label && <span style={{ fontSize: 12, color: '#888' }}>{label}</span>}
      </span>

      {open &&
        createPortal(
          <div
            ref={popRef}
            style={{
              // Fixed, not absolute: these are viewport coordinates, and the
              // popover has no positioned ancestor to be absolute to now.
              position: 'fixed',
              zIndex: Z.dropdown,
              left: at?.left ?? -9999,
              top: at?.top,
              bottom: at?.bottom,
              // Hidden until measured, so the first paint is never in the wrong
              // place.
              visibility: at ? 'visible' : 'hidden',
              width,
              maxWidth: 'calc(100vw - 16px)',
              background: '#fff',
              border: '1px solid #ccc',
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
          >
            <input
              type="text"
              autoFocus
              value={query}
              placeholder={placeholder}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') close()
                // Enter takes the only remaining match — the fast path once the
                // query has narrowed the list to one.
                if (e.key === 'Enter' && filtered.length === 1) {
                  onAdd(filtered[0])
                  close()
                }
              }}
              style={{
                width: '100%',
                padding: '6px 8px',
                boxSizing: 'border-box',
                fontSize: 13,
                border: 'none',
                borderBottom: '1px solid #eee',
                outline: 'none',
              }}
            />
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '6px 10px', fontSize: 12, color: '#999' }}>No matches</div>
              ) : (
                filtered.map((opt) => (
                  <div
                    key={opt.id}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onAdd(opt)
                      close()
                    }}
                    style={{ padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f2f7ff')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                  >
                    <div>{opt.name}</div>
                    {opt.path && (
                      <div style={{ fontSize: 11, color: '#999', overflowWrap: 'anywhere' }}>{opt.path}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
