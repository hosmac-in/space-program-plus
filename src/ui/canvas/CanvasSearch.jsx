// THE SEARCH, on both canvases — a 🔍 in the pane's bottom-left corner, inside
// the drawing and clear of the gutters (a scrollbar has no room for a control).
// It only takes the query; what a canvas finds, opens, pans to and pulses is its
// own, since the two canvases lay out different things. Enter searches, Escape
// clears and shuts, and it shuts itself when abandoned empty.

import { useEffect, useRef, useState } from 'react'
import { GUTTER } from './CanvasFrame.jsx'
import { Z } from '../primitives/zIndex.js'

// The ring a drop target flashes and the wash a found room row takes — the one
// "look here" in the app. Injected by each canvas that pulses anything.
export const PULSE_STYLE = `
  @keyframes treeDropPulse {
    0% { box-shadow: 0 0 0 0 var(--pulse-ring, rgba(26,115,232,0.55)); }
    100% { box-shadow: 0 0 0 16px transparent; }
  }
  .tree-drop-pulse { animation: treeDropPulse 450ms ease-out; }
  @keyframes treeRoomPulse {
    0% { background-color: rgba(26,115,232,0.35); }
    100% { background-color: transparent; }
  }
  .tree-room-pulse { animation: treeRoomPulse 900ms ease-out; border-radius: 3px; }
`

// Stands in for an expanded-Set when building a layout only to index it: a
// search must find what is behind a shut group, which the drawn layout omits.
export const ALWAYS_EXPANDED = { has: () => true }

export default function CanvasSearch({ onSearch, placeholder = 'Search a room, department, group…', title }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <div
      // nodrag/nopan, or React Flow claims the click before the input sees it.
      className="nodrag nopan"
      style={{
        position: 'absolute',
        left: GUTTER + 12,
        bottom: GUTTER + 12,
        zIndex: Z.mapControls,
        display: 'flex',
        alignItems: 'center',
        background: '#fff',
        borderRadius: open ? 8 : '50%',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      {open ? (
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch(query)
            else if (e.key === 'Escape') {
              setQuery('')
              setOpen(false)
            }
          }}
          onBlur={() => {
            if (!query) setOpen(false)
          }}
          style={{
            width: 220,
            boxSizing: 'border-box',
            padding: '8px 10px',
            fontSize: 13,
            border: 'none',
            outline: 'none',
            borderRadius: 8,
            background: 'transparent',
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={title ?? 'Search for a room, department, group, room group or section'}
          aria-label="Search"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          🔍
        </button>
      )}
    </div>
  )
}
