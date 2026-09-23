// FULL SCREEN, for screenshots and recordings — bottom-right, the corner the
// Tree search does not use, on the search button's round white plate. Escape
// leaves, as the browser always allows.
//
// It takes whatever `target` is, and the target decides what comes along: the
// canvas pane on the Tree tab (its search is inside it), the whole option view
// on the Project tab (View Analysis and the analysis view are). It also carries
// Collapse / Expand, so they come along into full screen.
//
// FullscreenRoot marks a subtree as already having a target, so CanvasFrame
// inside it does not draw a second button taking only the pane.

import { createContext, useContext, useEffect, useState } from 'react'
import { Z } from './zIndex.js'
import { useExpandAllFire } from '../expandAll.jsx'

const RootContext = createContext(false)
export const FullscreenRoot = ({ children }) => <RootContext.Provider value={true}>{children}</RootContext.Provider>
export const useHasFullscreenRoot = () => useContext(RootContext)

const plate = {
  height: 36,
  minWidth: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: '#fff',
  borderRadius: 18,
  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
}

// Collapse / Expand: a step down from the full-screen plate, centred on its row.
const small = { ...plate, height: 26, minWidth: 0, borderRadius: 13, padding: '0 10px', fontSize: 11 }

// `bottom` is the caller's: inside a canvas pane 12 is clear of everything, but
// a target that includes the frame's bottom gutter must add it, or the plate
// sits on the scrollbar rather than level with the search.
export default function FullscreenControls({ target, expandable = true, bottom = 12 }) {
  const [on, setOn] = useState(false)
  const fireExpandAll = useExpandAllFire()

  useEffect(() => {
    const sync = () => setOn(!!target.current && document.fullscreenElement === target.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [target])

  return (
    <div
      className="nodrag nopan"
      style={{ position: 'absolute', right: 12, bottom, zIndex: Z.mapControls, display: 'flex', alignItems: 'center', gap: 6 }}
    >
      {/* Always here, not only in full screen — this is where they live now. No
          provider (the Companion) means nothing would obey them, so none drawn. */}
      {expandable && fireExpandAll && (
        <>
          <button type="button" style={small} onClick={() => fireExpandAll(false)}>
            Collapse
          </button>
          <button type="button" style={small} onClick={() => fireExpandAll(true)}>
            Expand
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => (on ? document.exitFullscreen() : target.current?.requestFullscreen?.())}
        title={on ? 'Exit full screen (Esc)' : 'Full screen'}
        aria-label={on ? 'Exit full screen' : 'Full screen'}
        style={{ ...plate, fontSize: 16 }}
      >
        {on ? '🗗' : '⛶'}
      </button>
    </div>
  )
}
