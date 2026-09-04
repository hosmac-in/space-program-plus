// The right-hand pane of the Tree tab when a BUILDING's band is selected.
//
// The other face of this pane is RoomLinkPanel, for a department. A building is
// the one thing on this canvas that is not part of sp_section.tree — it is a
// row in sp_building — so this is the only place in the app that edits a
// definition table directly (see data/buildings.js).
//
// EVERY EDIT IS A WRITE, as everywhere else on this tab. There is no draft and
// no Save button; leaving a field writes it.
//
//   >>> THESE ARE CATALOG DEFAULTS, NOT THIS PROJECT'S NUMBERS. A building's
//   >>> factors are shared by every option in every project. An option that
//   >>> needs different ones overrides them on the Project tab, where a
//   >>> building's panel shows the same two rows.
//
// No undo. The footer ribbon drives the tree editor's stack, which holds
// inverse edits against sp_section.tree; a column on another table is not one
// of those. Deliberate rather than missing — the same reason function_id has
// never had one — but say so out loud if the stack ever grows to cover it.

import { useState } from 'react'
import { useCatalog } from '../../data/catalog.jsx'
import { functionColours } from '../../data/functions.js'
import { BUILDING_FACTORS, resolveBuildingFactors } from '../../data/factors.js'
import { writeBuildingFactor } from '../../data/buildings.js'
import { CountField, PanelHeading, PanelNote, PanelShell } from '../panel/panelParts.jsx'
import { useToast } from '../primitives/Toast.jsx'

export default function BuildingPanel({ buildingId, canEdit }) {
  const { buildings, functions, reloadBuildings } = useCatalog()
  const pushToast = useToast()
  const [error, setError] = useState(null)

  const building = buildings.find((b) => b.id === buildingId)
  if (!building) return <PanelNote pad>This building no longer exists.</PanelNote>

  const colours = functionColours(functions, building.function_id)

  // Serialised by being one field at a time and writing one column: two factors
  // are two columns, so unlike a tree edit there is nothing to read-modify-write
  // and no way for two of these to compute from the same stale copy.
  const set = async (factor, value) => {
    const message = await writeBuildingFactor(building.id, factor, value)
    if (message) {
      setError(message)
      return
    }
    setError(null)
    await reloadBuildings()
    pushToast(`${building.name}: ${factor.label.toLowerCase()} ${value ? 'set' : 'cleared'}`)
  }

  // No option in the picture here — this IS what options inherit — so every
  // resolved row is either stated by the catalog or not stated at all.
  const rows = resolveBuildingFactors(building, null)

  return (
    <PanelShell colours={colours}>
      <PanelHeading name={building.name} path="Building" />

      {error && <p style={{ color: 'red', fontSize: 12 }}>{error}</p>}

      {rows.map((f) => (
        <div
          key={f.key}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, minWidth: 0, fontSize: 13 }}
        >
          <span style={{ flex: 1, minWidth: 0, opacity: 0.85 }}>{f.label}</span>
          <CountField
            // Keyed by BUILDING as well as factor. Without the building in the
            // key, React reuses one field instance across buildings and its
            // local draft comes with it — so every building showed whatever was
            // last typed into any of them, and they looked linked. The `value`
            // effect does not save this: two buildings that both read 1.00 mean
            // the value never changes, so it never fires.
            key={`${building.id}:${f.key}`}
            value={f.value}
            canEdit={canEdit}
            min={f.min}
            step={0.05}
            decimals={2}
            prefix="×"
            colour="inherit"
            title={f.describe(building.name)}
            // Written when the field is left, not per keystroke: this one goes
            // straight to the database rather than into memory first.
            onChange={() => {}}
            // Leaving a field always commits, including when nothing was typed
            // — so the two no-ops are filtered here rather than writing,
            // reloading and toasting every time someone tabs past.
            onCommit={(value) => {
              // Unchanged.
              if (value === f.inherited) return
              // Typing the fallback into a field the catalog says nothing about
              // states nothing: 1 is what an unset factor already means.
              if (f.inherited == null && value === f.fallback) return
              set(f, value)
            }}
          />
        </div>
      ))}

      <PanelNote>
        Shared by every option. An option can override these on the Project tab.
      </PanelNote>

      {BUILDING_FACTORS.length === 0 && <PanelNote>No building factors are defined.</PanelNote>}
    </PanelShell>
  )
}
