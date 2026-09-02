// Renders its controls and nothing around them — see ProjectPicker. The
// heading is the container's too: a band row labels it, the chooser titles it.
//
// Two sizes of the same list. `compact` is the row of chips in the band, always
// available while you work. `large` is the chooser you land on when a project
// has no option open yet — the only thing on screen, so it is sized to be the
// thing you act on rather than a strip to be found.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../data/supabase.js'
import AddButton from '../primitives/AddButton.jsx'
import Modal from '../primitives/Modal.jsx'
import { PanelNote } from '../panel/panelParts.jsx'

import { SCHEMA_VERSION } from '../../data/optionData.js'

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
}) {
  const [options, setOptions] = useState([])
  const [error, setError] = useState(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newOptionName, setNewOptionName] = useState('')
  const [duplicateFromId, setDuplicateFromId] = useState('')
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false)
  const [createError, setCreateError] = useState(null)

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

  async function handleCreate() {
    // A ref, not the `creating` state: state disables the button on the NEXT
    // render, which a fast second click beats — and two inserts are two options.
    if (creatingRef.current) return
    creatingRef.current = true
    setCreateError(null)
    setCreating(true)

    let data = { departments: [] }

    if (duplicateFromId) {
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
      data = source.data
    }

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
            return (
              <button
                key={o.id}
                type="button"
                className="spp-option"
                onClick={() => onSelectOption?.(o.id)}
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
              </button>
            )
          })}
        </div>
      )}

      <AddButton
        onClick={() => setShowCreateModal(true)}
        title={options.length === 0 ? 'Create the first option' : 'New option'}
        size={large ? 56 : 22}
      />

      {showCreateModal && (
        <Modal title="New Option" onClose={() => setShowCreateModal(false)}>
          <div style={{ marginBottom: 12 }}>
            <label>Option name</label>
            <input
              type="text"
              value={newOptionName}
              onChange={(e) => setNewOptionName(e.target.value)}
              style={{ width: '100%', padding: 6 }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label>Duplicate from (optional)</label>
            <select
              value={duplicateFromId}
              onChange={(e) => setDuplicateFromId(e.target.value)}
              style={{ width: '100%', padding: 6 }}
            >
              <option value="">Start blank</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.option_name}
                </option>
              ))}
            </select>
          </div>

          {createError && <p style={{ color: 'red' }}>{createError}</p>}

          <button type="button" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Option'}
          </button>
        </Modal>
      )}
    </>
  )
}
