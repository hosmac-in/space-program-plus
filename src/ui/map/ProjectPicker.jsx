// Renders its controls and nothing around them: on UHDP the caller wraps it in
// a card in side, on Canvas in a band row across the top of main. Chrome is the
// container's business.

import { useEffect, useState } from 'react'
import { supabase } from '../../data/supabase.js'
import AddButton from '../primitives/AddButton.jsx'
import Modal from '../primitives/Modal.jsx'
import NewProject from './NewProject.jsx'

export default function ProjectPicker({
  canCreate,
  selectedProjectId,
  onSelectProject,
  onProjectCreated,
  isDrawingSite,
  onStartDrawSite,
  onStopDrawSite,
  drawnSiteGeometry,
}) {
  const [projects, setProjects] = useState([])
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)

  async function loadProjects() {
    const { data, error } = await supabase
      .from('sp_project')
      .select('id, name')
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setProjects(data)
  }

  useEffect(() => {
    loadProjects()
  }, [])

  function handleCreated(project) {
    setShowModal(false)
    loadProjects()
    onSelectProject?.(project.id)
    onProjectCreated?.()
  }

  return (
    <>
      <select
        value={selectedProjectId ?? ''}
        onChange={(e) => onSelectProject?.(e.target.value || null)}
        style={{ padding: 8, flex: 1, minWidth: 0, maxWidth: 420, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
      >
        <option value="">Select a project...</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {canCreate && <AddButton onClick={() => setShowModal(true)} title="New project" size={22} />}

      {error && <span style={{ color: '#c0392b', fontSize: 13 }}>{error}</span>}

      {showModal && (
        <Modal
          title="New Project"
          onClose={() => {
            setShowModal(false)
            onStopDrawSite?.()
          }}
          overlayLeft="75%"
        >
          <NewProject
            onCreated={handleCreated}
            isDrawingSite={isDrawingSite}
            onStartDrawSite={onStartDrawSite}
            onStopDrawSite={onStopDrawSite}
            drawnSiteGeometry={drawnSiteGeometry}
          />
        </Modal>
      )}
    </>
  )
}
