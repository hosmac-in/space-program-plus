// Renders its controls and nothing around them — see ProjectPicker. The
// heading is the container's too: a band row labels it, the chooser titles it.
//
// Two sizes of the same list. `compact` is the row of chips in the band, always
// available while you work. `large` is the chooser you land on when a project
// has no option open yet — the only thing on screen, so it is sized to be the
// thing you act on rather than a strip to be found.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../data/supabase.js'
import { useCatalog } from '../../data/catalog.jsx'
import AddButton from '../primitives/AddButton.jsx'
import { useReadOnly } from '../../readOnly.jsx'
import Modal from '../primitives/Modal.jsx'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import { PanelNote } from '../panel/panelParts.jsx'

import {
  clampPhaseCount,
  DEFAULT_PHASE_COUNT,
  MAX_PHASE_COUNT,
  SCHEMA_VERSION,
} from '../../data/optionData.js'

// How many phases an option is built in. The same control does both jobs —
// chosen when the option is created, changed afterwards — for the same reason
// BuildingChecklist does: they are the same question, and two copies of one
// field is how things drift.
//
// A number, not a list of phases to name: a phase has no name (see
// data/optionData.js). Lowering it is what makes a phase stop existing, and it
// takes what was staged in it, so the caller warns first.
function PhaseCountField({ value, onChange, note }) {
  return (
    <label style={{ display: 'block', fontSize: 13 }}>
      <span style={{ display: 'block', marginBottom: 4 }}>Phases</span>
      <input
        type="number"
        min={DEFAULT_PHASE_COUNT}
        max={MAX_PHASE_COUNT}
        value={value}
        onChange={(e) => onChange(clampPhaseCount(parseInt(e.target.value, 10)))}
        style={{ width: 72, padding: 6 }}
      />
      {note && <span style={{ marginLeft: 10, fontSize: 12, color: '#777' }}>{note}</span>}
    </label>
  )
}

// FSI and ground cover: two plain numbers with no catalog default to inherit
// and no per-room override chain — see AREA METRICS in data/optionData.js.
// Typed here alongside phases, on the same one-Save dialog, for the reason
// PhaseCountField gives: chosen at creation, changed afterwards, one field
// either way.
function AreaMetricsFields({ fsi, groundCover, onChangeFsi, onChangeGroundCover }) {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <label style={{ display: 'block', fontSize: 13 }}>
        <span style={{ display: 'block', marginBottom: 4 }}>FSI</span>
        <input
          type="number"
          min={0}
          step="any"
          value={fsi ?? ''}
          onChange={(e) => onChangeFsi(e.target.value === '' ? null : parseFloat(e.target.value))}
          style={{ width: 72, padding: 6 }}
        />
      </label>
      <label style={{ display: 'block', fontSize: 13 }}>
        <span style={{ display: 'block', marginBottom: 4 }}>Ground cover</span>
        <input
          type="number"
          min={0}
          step="any"
          value={groundCover ?? ''}
          onChange={(e) => onChangeGroundCover(e.target.value === '' ? null : parseFloat(e.target.value))}
          style={{ width: 72, padding: 6 }}
        />
      </label>
    </div>
  )
}

// Which buildings an option contains, as a checkbox each.
//
// The same list does both jobs — picked when the option is created, changed
// afterwards — because they are the same question, and two lists of the same
// checkboxes is how things drift.
function BuildingChecklist({ buildings, selected, onToggle, countFor }) {
  if (buildings.length === 0) {
    return <PanelNote>No buildings yet — run sql/building_setup.sql.</PanelNote>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {buildings.map((b) => {
        const on = selected.includes(b.id)
        // Only ever set when editing an existing option: how much would be lost
        // by unticking this. Said here, next to the tick, rather than only in
        // the confirmation after you have already decided.
        const losing = !on && (countFor?.(b.id) ?? 0)
        return (
          <label key={b.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={on} onChange={() => onToggle(b.id)} />
            <span style={{ flex: 1, minWidth: 0 }}>{b.name}</span>
            {losing > 0 && (
              <span style={{ fontSize: 11, color: '#c0392b', whiteSpace: 'nowrap' }}>
                drops {losing} department{losing === 1 ? '' : 's'}
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}

// WHICH DISEASE MANAGEMENT GROUPS THE OPTION TARGETS. The canvas offers the
// untagged groups always and the tagged ones only when ticked here — see
// data/dmg.js. Unticking hides ghosts only, so it costs nothing and asks nothing.
function DmgChecklist({ dmgs, selected, onToggle }) {
  if (dmgs.length === 0) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <label>Disease management groups</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        {dmgs.map((d) => (
          <label key={d.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={selected.includes(d.id)} onChange={() => onToggle(d.id)} />
            <span style={{ flex: 1, minWidth: 0 }}>{d.name ?? 'Unnamed'}</span>
          </label>
        ))}
      </div>
      <p style={{ fontSize: 12, color: '#777', marginTop: 6 }}>
        Groups with no DMG are always offered. Anything already added stays whatever is ticked.
      </p>
    </div>
  )
}

export default function OptionList({
  projectId,
  refreshKey,
  selectedOptionId,
  onSelectOption,
  variant = 'compact',
  // How many options this project has, reported after each load. The chooser
  // words itself differently for a project with none, and this list is what
  // knows.
  onCount,
  // The OPEN option's buildings and phase count, and how to set them — from
  // InstanceBuilder via App. Absent in the large chooser, where no option is
  // open yet, which is exactly when there is nothing to edit.
  openBuildingIds,
  openPhaseCount = DEFAULT_PHASE_COUNT,
  openFsi = null,
  openGroundCover = null,
  // Null is an option from before DMGs: no filter, which the dialog shows as
  // every box ticked, since that is what it offers.
  openDmgIds = null,
  onSetOptionSettings,
  departmentCountByBuilding,
  departmentCountByPhase,
  // Opens the option creator on one building's questionnaire — see App.
  onStartCreator,
}) {
  const { buildings, dmgs } = useCatalog()
  const [editDmgIds, setEditDmgIds] = useState([])
  // Picking an option is reading; creating one is not. See src/readOnly.jsx.
  const readOnly = useReadOnly()
  const [options, setOptions] = useState([])
  const [error, setError] = useState(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newOptionName, setNewOptionName] = useState('')
  const [duplicateFromId, setDuplicateFromId] = useState('')
  // The one building the option creator will run the questionnaire of.
  const [newBuildingId, setNewBuildingId] = useState(null)
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false)
  const [createError, setCreateError] = useState(null)

  // The settings editor for the option already open. Null when closed; an array
  // of ids while open, so ticking is local until Save. The phase count is
  // edited alongside it and committed by the same button.
  const [editBuildingIds, setEditBuildingIds] = useState(null)
  const [editPhaseCount, setEditPhaseCount] = useState(DEFAULT_PHASE_COUNT)
  const [editFsi, setEditFsi] = useState(null)
  const [editGroundCover, setEditGroundCover] = useState(null)
  const [confirmDrop, setConfirmDrop] = useState(null)

  // Returns its own canceller: a response for the project you just left must
  // not overwrite the one you are on.
  function loadOptions() {
    if (!projectId) {
      setOptions([])
      onCount?.(0)
      return undefined
    }

    let cancelled = false
    supabase
      .from('sp_option')
      .select('id, option_name')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
        } else {
          setOptions(data)
          onCount?.(data.length)
        }
      })

    return () => {
      cancelled = true
    }
  }

  useEffect(() => loadOptions(), [projectId, refreshKey])

  // A NEW OPTION IS MADE BY THE QUESTIONNAIRE, and only by it — the option
  // creator (ui/questions/createOption.js). The one thing this dialog still
  // writes itself is a DUPLICATE, which copies an option that already exists.
  async function handleDuplicate() {
    // A ref, not the `creating` state: state disables the button on the NEXT
    // render, which a fast second click beats — and two inserts are two options.
    if (creatingRef.current || !duplicateFromId) return
    creatingRef.current = true
    setCreateError(null)
    setCreating(true)

    const { data: source, error: sourceError } = await supabase
      .from('sp_option')
      .select('data')
      .eq('id', duplicateFromId)
      .single()

    if (sourceError) {
      // Release the guard on every exit, or the button never works again.
      creatingRef.current = false
      setCreateError(sourceError.message)
      setCreating(false)
      return
    }
    const data = source.data

    const { data: inserted, error: insertError } = await supabase
      .from('sp_option')
      .insert({
        project_id: projectId,
        option_name: newOptionName || 'Untitled option',
        schema_version: SCHEMA_VERSION,
        data,
      })
      .select('id')
      .single()

    creatingRef.current = false
    setCreating(false)

    if (insertError) {
      setCreateError(insertError.message)
      return
    }

    setShowCreateModal(false)
    setNewOptionName('')
    setDuplicateFromId('')
    loadOptions()
    onSelectOption?.(inserted.id)
  }

  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  // Clicking the option you already have open is what opens its building list.
  // A first click selects, as it always did; only the chip that is already
  // selected does this, so nothing you click changes an option you cannot see.
  function handleOptionClick(id) {
    // Re-selecting opens the list only where there is an open option to edit —
    // the band. The large chooser has no handler, so a click there stays a
    // plain select however many times you make it.
    if (id === selectedOptionId && onSetOptionSettings) {
      setEditBuildingIds([...(openBuildingIds ?? [])])
      setEditPhaseCount(openPhaseCount)
      setEditFsi(openFsi)
      setEditGroundCover(openGroundCover)
      setEditDmgIds(openDmgIds ?? dmgs.map((d) => d.id))
      return
    }
    onSelectOption?.(id)
  }

  // All four settings go in one call: one Save, one undo step, one write.
  function applySettings(buildingIds, phaseCount, fsi, groundCover) {
    // Untouched on an old option with every box still ticked, the key stays
    // absent — so opening the dialog and saving it changes nothing about it.
    const allTicked = openDmgIds === null && dmgs.every((d) => editDmgIds.includes(d.id))
    onSetOptionSettings({ buildingIds, phaseCount, fsi, groundCover, dmgIds: allTicked ? null : [...editDmgIds] })
    setEditBuildingIds(null)
  }

  function commitSettings() {
    const dropped = (openBuildingIds ?? []).filter((id) => !editBuildingIds.includes(id))
    const losingBuildings = dropped.reduce((sum, id) => sum + (departmentCountByBuilding?.[id] ?? 0), 0)
    // Every entry staged in a phase that would no longer exist.
    const losingPhases = Object.entries(departmentCountByPhase ?? {}).reduce(
      (sum, [phase, count]) => (Number(phase) > editPhaseCount ? sum + count : sum),
      0
    )

    // Nothing to lose, so nothing to ask about.
    if (losingBuildings === 0 && losingPhases === 0) {
      applySettings(editBuildingIds, editPhaseCount, editFsi, editGroundCover)
      return
    }
    setConfirmDrop({
      ids: [...editBuildingIds],
      phases: editPhaseCount,
      fsi: editFsi,
      groundCover: editGroundCover,
      losingBuildings,
      losingPhases,
    })
  }

  if (!projectId) return null

  const large = variant === 'large'

  return (
    <>
      {error && <span style={{ color: '#c0392b', fontSize: 13 }}>{error}</span>}

      {options.length === 0 ? (
        // Nothing to list, so the + is the whole control — no "none yet" text
        // beside a button that says the same thing.
        !large && <PanelNote>No options saved yet.</PanelNote>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: large ? 12 : 8,
            minWidth: 0,
            justifyContent: large ? 'center' : undefined,
          }}
        >
          {options.map((o) => {
            const selected = o.id === selectedOptionId
            const editable = selected && !!onSetOptionSettings && !readOnly
            return (
              <button
                key={o.id}
                type="button"
                className="spp-option"
                title={
                  editable ? `${o.option_name} — click again to set its buildings and phases` : o.option_name
                }
                onClick={() => handleOptionClick(o.id)}
                style={{
                  padding: large ? '18px 24px' : '6px 12px',
                  minWidth: large ? 160 : undefined,
                  borderRadius: large ? 10 : 16,
                  border: selected ? '1px solid #1a73e8' : '1px solid #ccc',
                  background: selected ? '#e8f0fe' : '#fff',
                  color: selected ? '#1a73e8' : '#333',
                  fontWeight: selected || large ? 600 : 400,
                  fontSize: large ? 16 : 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: large ? '0 1px 4px rgba(0,0,0,0.12)' : undefined,
                }}
              >
                {o.option_name}
                {/* The only hint that the open chip does something more. A
                    count, not an icon: it says what the second click is about
                    as well as that there is one. */}
                {editable && (
                  <span style={{ marginLeft: 8, fontWeight: 400, opacity: 0.7 }}>
                    {(openBuildingIds ?? []).length} bldg
                    {/* Only when there is something to say: every option has
                        buildings, but most have one phase. */}
                    {openPhaseCount > 1 && ` · ${openPhaseCount} ph`}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {!readOnly && (
      <AddButton
        onClick={() => setShowCreateModal(true)}
        title={options.length === 0 ? 'Create the first option' : 'New option'}
        size={large ? 56 : 22}
      />
      )}

      {showCreateModal && (
        <Modal title="New Option" onClose={() => setShowCreateModal(false)}>
          <div style={{ marginBottom: 12 }}>
            <label>Start from</label>
            <select
              value={duplicateFromId}
              onChange={(e) => setDuplicateFromId(e.target.value)}
              style={{ width: '100%', padding: 6 }}
            >
              <option value="">The questionnaire</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  A copy of {o.option_name}
                </option>
              ))}
            </select>
          </div>

          {/* THE QUESTIONNAIRE ASKS EVERYTHING ELSE — the name, the phases, FSI,
              ground cover and the DMGs are its General questions now. What it
              cannot ask is which building's questionnaire to run, so that is
              the one thing chosen here. One building per run. */}
          {!duplicateFromId ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <label>Building</label>
                {buildings.length === 0 ? (
                  <PanelNote>No buildings yet — run sql/building_setup.sql.</PanelNote>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    {buildings.map((b) => (
                      <label key={b.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
                        <input
                          type="radio"
                          name="newOptionBuilding"
                          checked={newBuildingId === b.id}
                          onChange={() => setNewBuildingId(b.id)}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>{b.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={!newBuildingId || !onStartCreator}
                onClick={() => {
                  setShowCreateModal(false)
                  onStartCreator?.(newBuildingId)
                }}
              >
                Start the questionnaire
              </button>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label>Option name</label>
                <input
                  type="text"
                  value={newOptionName}
                  onChange={(e) => setNewOptionName(e.target.value)}
                  style={{ width: '100%', padding: 6 }}
                />
              </div>

              {createError && <p style={{ color: 'red' }}>{createError}</p>}

              <button type="button" onClick={handleDuplicate} disabled={creating}>
                {creating ? 'Creating...' : 'Duplicate'}
              </button>
            </>
          )}
        </Modal>
      )}

      {editBuildingIds && (
        <Modal title="This option" onClose={() => setEditBuildingIds(null)}>
          <BuildingChecklist
            buildings={buildings}
            selected={editBuildingIds}
            onToggle={(id) => setEditBuildingIds((prev) => toggle(prev, id))}
            countFor={(id) => departmentCountByBuilding?.[id] ?? 0}
          />

          <p style={{ fontSize: 12, color: '#777', marginTop: 12 }}>
            The canvas draws the buildings ticked here, and offers the sections inside them.
          </p>

          <div style={{ marginTop: 12 }}>
            <PhaseCountField
              value={editPhaseCount}
              onChange={setEditPhaseCount}
              // Said next to the field, before you commit — the same courtesy
              // the building rows pay.
              note={
                editPhaseCount < openPhaseCount
                  ? `drops ${Object.entries(departmentCountByPhase ?? {}).reduce(
                      (sum, [phase, count]) => (Number(phase) > editPhaseCount ? sum + count : sum),
                      0
                    )} staged departments`
                  : null
              }
            />
            <p style={{ fontSize: 12, color: '#777', marginTop: 6 }}>
              Each department card is divided into this many phases, and each phase is programmed on its own.
            </p>
          </div>

          <div style={{ marginTop: 12 }}>
            <AreaMetricsFields
              fsi={editFsi}
              groundCover={editGroundCover}
              onChangeFsi={setEditFsi}
              onChangeGroundCover={setEditGroundCover}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <DmgChecklist
              dmgs={dmgs}
              selected={editDmgIds}
              onToggle={(id) => setEditDmgIds((prev) => toggle(prev, id))}
            />
          </div>

          <button type="button" onClick={commitSettings}>
            Save
          </button>
        </Modal>
      )}

      {confirmDrop && (
        <ConfirmModal
          title="Remove from this option?"
          onConfirm={() => {
            applySettings(confirmDrop.ids, confirmDrop.phases, confirmDrop.fsi, confirmDrop.groundCover)
            setConfirmDrop(null)
          }}
          onCancel={() => setConfirmDrop(null)}
        >
          {confirmDrop.losingBuildings > 0 && (
            <>
              That removes {confirmDrop.losingBuildings} department
              {confirmDrop.losingBuildings === 1 ? '' : 's'} from this option, with their rooms and objects —
              everything in the buildings you unticked.{' '}
            </>
          )}
          {confirmDrop.losingPhases > 0 && (
            <>
              Cutting to {confirmDrop.phases} phase{confirmDrop.phases === 1 ? '' : 's'} drops{' '}
              {confirmDrop.losingPhases} staged department
              {confirmDrop.losingPhases === 1 ? '' : 's'} from the phases that go, with their rooms and objects.{' '}
            </>
          )}
          You can undo this after.
        </ConfirmModal>
      )}
    </>
  )
}
