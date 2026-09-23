// Expand all / collapse all, pressed in the footer, obeyed by every level that
// opens and shuts: a canvas's groups and room lists, and a panel's rooms and
// room groups. A SIGNAL, not a state — each level still owns its own open/shut
// (the canvases because their layout stacks by it, RoomBlock because rooms are
// rendered in a .map), and a press only overwrites it once. `n` counts presses
// so pressing the same button twice fires twice.

import { createContext, useContext, useEffect, useRef, useState } from 'react'

const ExpandAllContext = createContext({ signal: null, fire: null })

export function ExpandAllProvider({ children }) {
  const [signal, setSignal] = useState(null)
  const fire = (open) => setSignal((s) => ({ open, n: (s?.n ?? 0) + 1 }))
  return <ExpandAllContext.Provider value={{ signal, fire }}>{children}</ExpandAllContext.Provider>
}

// Null with no provider, so a caller can leave its buttons out.
export const useExpandAllFire = () => useContext(ExpandAllContext).fire

// Every group and department placement id in the catalog — what a canvas's
// open Sets are keyed by (both key rooms by the department's instance_id).
// A superset of what is drawn is harmless: an id nothing draws is never read.
export function catalogOpenIds(sections = []) {
  const groups = new Set()
  const departments = new Set()
  sections.forEach((s) =>
    (s.tree?.groups ?? []).forEach((g) => {
      if (g.instance_id) groups.add(g.instance_id)
      ;(g.departments ?? []).forEach((d) => d.instance_id && departments.add(d.instance_id))
    })
  )
  return { groups, departments }
}

// Calls onSignal(open) once per press made while this component is mounted —
// never for a press made before it mounted, or opening a panel would replay it.
export function useExpandAll(onSignal) {
  const { signal } = useContext(ExpandAllContext)
  const seen = useRef(signal?.n ?? 0)
  const handler = useRef(onSignal)
  handler.current = onSignal
  useEffect(() => {
    if (!signal || signal.n === seen.current) return
    seen.current = signal.n
    handler.current(signal.open)
  }, [signal])
}
