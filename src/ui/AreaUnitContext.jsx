// A GLOBAL DISPLAY TOGGLE between ft² and m². Every area in this app is HELD
// in sqft (see CLAUDE.md, Area) — this converts for display only, at the
// point something is printed, and never touches what is stored or computed.
//
// The choice is a per-viewer convenience — which unit someone likes to read —
// so it lives in localStorage, not in any option or project. It has no effect
// on another viewer's session and none on what gets written to the database.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { SQM_PER_SQFT } from './map/area.js'

const STORAGE_KEY = 'spp.areaUnit'

const AreaUnitContext = createContext(null)

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ft2' ? 'ft2' : 'm2'
  } catch {
    return 'm2'
  }
}

export function AreaUnitProvider({ children }) {
  const [unit, setUnit] = useState(readStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, unit)
    } catch {
      // Private window, blocked storage — the toggle still works for the rest
      // of this session, it just won't be remembered next time.
    }
  }, [unit])

  const toggleUnit = useCallback(() => setUnit((u) => (u === 'ft2' ? 'm2' : 'ft2')), [])

  const value = useMemo(() => {
    // sqft, as held everywhere in the app, -> the number to print.
    const toDisplay = (sqft) => (unit === 'm2' ? Number(sqft ?? 0) * SQM_PER_SQFT : Number(sqft ?? 0))
    // The reverse: what someone typed, in the display unit, -> sqft to store.
    const toStored = (n) => (unit === 'm2' ? Number(n ?? 0) / SQM_PER_SQFT : Number(n ?? 0))
    return { unit, label: unit === 'm2' ? 'm²' : 'ft²', toggleUnit, toDisplay, toStored }
  }, [unit, toggleUnit])

  return <AreaUnitContext.Provider value={value}>{children}</AreaUnitContext.Provider>
}

export function useAreaUnit() {
  const ctx = useContext(AreaUnitContext)
  if (!ctx) throw new Error('useAreaUnit must be used within an AreaUnitProvider')
  return ctx
}
