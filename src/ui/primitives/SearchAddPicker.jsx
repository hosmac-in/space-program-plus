import { useEffect, useMemo, useRef, useState } from 'react'
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
export function SearchAddPicker({ options, placeholder, onAdd, label, title = 'Add', size }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options
    return pool.slice(0, 50)
  }, [options, query])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  // Clicking anywhere outside dismisses, the way the field's own blur used to.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) close()
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

      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: Z.dropdown,
            top: '100%',
            left: 0,
            marginTop: 4,
            width: 260,
            maxWidth: '100%',
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
                  {opt.name}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
