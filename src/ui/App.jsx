// Top-level shell: auth gate, then a 75/25 split of map-or-canvas on the left
// and the project/option controls on the right.
//
// App owns exactly one piece of cross-cutting state — which department is
// selected — because three panes need to agree on it. Everything else lives in
// the component that uses it, or in the catalog provider.

import { useEffect, useState } from 'react'
import { supabase } from '../data/supabase.js'
import { useUrlState } from '../url.js'
import { useIsAdmin, useSession } from '../data/auth.js'
import { CatalogProvider } from '../data/catalog.jsx'
import Login from './Login.jsx'
import MapPanel from './MapPanel.jsx'
import ProjectBand from './ProjectBand.jsx'
import ProjectSummary from './map/ProjectSummary.jsx'
import Hud from './Hud.jsx'
import ConfirmModal from './primitives/ConfirmModal.jsx'
import { PanelNote } from './panel/panelParts.jsx'
import OptionChooser from './option/OptionChooser.jsx'
import InstanceBuilder from './option/InstanceBuilder.jsx'
import RoomLinkPanel from './tree/RoomLinkPanel.jsx'
import { TreeEditorProvider } from './tree/useTreeEditor.jsx'
import LoadingOverlay from './primitives/LoadingOverlay.jsx'
import AppFooter from './AppFooter.jsx'
import AppHeader from './AppHeader.jsx'
import { APP_STYLE } from './appStyle.js'
import { ADD_BUTTON_STYLE } from './primitives/AddButton.jsx'
import { REMOVE_BUTTON_STYLE } from './primitives/RemoveButton.jsx'
import { RIBBON_STYLE } from './primitives/UndoRedoRibbon.jsx'

export default function App() {
  const { session, loading } = useSession()

  if (loading) return <LoadingOverlay />

  if (!session) {
    return (
      <>
        <Login />
        <LoadingOverlay />
      </>
    )
  }

  return (
    <CatalogProvider>
      <SignedInApp session={session} />
    </CatalogProvider>
  )
}

function SignedInApp({ session }) {
  const isAdmin = useIsAdmin(session.user.id)

  // Which tab, project and option you're looking at lives in the address bar
  // rather than in state, so every screen has a shareable link and survives a
  // reload. See src/url.js.
  const [{ view, projectId: selectedProjectId, optionId: selectedOptionId }, navigate] = useUrlState()

  const [optionsRefreshKey, setOptionsRefreshKey] = useState(0)
  const [mapRefreshKey, setMapRefreshKey] = useState(0)
  const [isDrawingSite, setIsDrawingSite] = useState(false)
  const [drawnSiteGeometry, setDrawnSiteGeometry] = useState(null)

  // Which department definition is selected...
  const [highlightedDepartmentId, setHighlightedDepartmentId] = useState(null)
  // ...and, when the selection came from a specific placement on a canvas, that
  // placement's tree node id. The rooms panel needs the placement, not the
  // definition, since rooms hang off the placement. A selection carrying no
  // node (there's no one placement it refers to) clears this.
  const [selectedDeptInstanceId, setSelectedDeptInstanceId] = useState(null)

  // Exposed by InstanceBuilder so the canvases can add and remove departments
  // without App owning the option's state.
  const [builderState, setBuilderState] = useState({
    departments: [],
    sectionIds: [],
    departmentDefs: [],
    optionName: '',
    addDepartments: () => {},
    removeDepartment: () => {},
    addSection: () => {},
    removeSection: () => {},
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
    dirty: false,
    saving: false,
    saveError: null,
    save: () => {},
  })

  // The projects, with their geometry. Fetched here rather than in MapPanel
  // because side needs the same list — the map draws the sites, side counts and
  // measures them.
  const [projects, setProjects] = useState([])
  const [projectsError, setProjectsError] = useState(null)

  useEffect(() => {
    // A refresh triggered by creating a project can overtake the one before it;
    // take only the newest answer.
    let cancelled = false
    supabase
      .from('sp_project_geojson')
      .select('id, name, site_geojson, context_geojson')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setProjectsError(error.message)
        else setProjects(data)
      })
    return () => {
      cancelled = true
    }
  }, [mapRefreshKey])

  // What side is showing on the Project tab, set by what was last clicked on
  // its canvas: a department, a group box, a section box, or nothing at all.
  // Null means nothing — the canvas's own empty space — and side falls back to
  // the option's totals.
  const [selection, setSelection] = useState(null)

  // ANY change that takes the edited department off the side panel asks first.
  //
  // Room and object edits live only in memory until Save Data is pressed, and
  // the panel shows one department at a time — so clicking another department,
  // clicking the canvas, selecting a group or section, switching tab, option or
  // project all replace what you were editing. Every one of them goes through
  // here, and none of them proceeds until you've said save or discard.
  //
  // Structural edits write themselves, so `dirty` only ever means rooms,
  // objects and counts.
  //
  // The pending action is held as `{ run }` rather than bare, because a bare
  // function passed to setState is taken as an updater and called immediately.
  const [pending, setPending] = useState(null)

  function guard(run) {
    if (builderState.dirty) setPending({ run })
    else run()
  }

  const leaveOption = (next) => guard(() => navigate(next))
  const changeView = (next) => guard(() => navigate({ view: next }))

  function handleSelectDepartment(defId, treeNodeId) {
    const select = () => {
      setHighlightedDepartmentId(defId)
      setSelectedDeptInstanceId(treeNodeId ?? null)
      setSelection({ kind: 'department', id: treeNodeId ?? defId })
    }
    // Clicking the department already open changes nothing, so it needn't ask.
    const same =
      selection?.kind === 'department' && (treeNodeId ? treeNodeId === selectedDeptInstanceId : defId === highlightedDepartmentId)
    if (same) select()
    else guard(select)
  }

  // Changing project clears the option, since an option belongs to one project.
  //
  // It stays on whatever tab you're on. From UHDP — clicking a site on the map,
  // or picking from the band — that means you see the project's numbers in side
  // and go on to the program deliberately, with the Space Program button, never
  // by a stray click on the map.
  function handleSelectProject(id) {
    leaveOption({ projectId: id, optionId: null })
  }

  // A link can be trimmed down to just the option (they're globally unique), so
  // fill the project back in from the option rather than leaving the app in a
  // half-selected state where saving is silently disabled.
  useEffect(() => {
    if (!selectedOptionId || selectedProjectId) return

    let cancelled = false
    supabase
      .from('sp_option')
      .select('project_id')
      .eq('id', selectedOptionId)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        navigate({ projectId: data.project_id }, { replace: true })
      })

    return () => {
      cancelled = true
    }
  }, [selectedOptionId, selectedProjectId, navigate])

  return (
    <TreeEditorProvider>
    {/* The four regions — header, main, side, footer — and the three
        regulating lines between them. See CLAUDE.md. */}
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      <style>{APP_STYLE + REMOVE_BUTTON_STYLE + ADD_BUTTON_STYLE + RIBBON_STYLE}</style>

      <AppHeader
        onHome={() => leaveOption({ view: 'map', projectId: null, optionId: null })}
        email={session.user.email}
        onSignOut={() => supabase.auth.signOut()}
      />

      {/* main | side */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <MapPanel
          projectId={selectedProjectId}
          onSelectProject={handleSelectProject}
          drawMode={isDrawingSite}
          onSiteDrawn={setDrawnSiteGeometry}
          optionId={selectedOptionId}
          optionName={builderState.optionName}
          departments={builderState.departments}
          departmentDefs={builderState.departmentDefs}
          onAddDepartments={builderState.addDepartments}
          onRemoveDepartment={builderState.removeDepartment}
          sectionIds={builderState.sectionIds}
          onAddSection={builderState.addSection}
          onRemoveSection={builderState.removeSection}
          selection={selection}
          onSelectContainer={(next) => guard(() => setSelection(next))}
          onClearSelection={() => guard(() => setSelection(null))}
          onSelectDepartment={handleSelectDepartment}
          highlightedDepartmentId={highlightedDepartmentId}
          selectedDeptInstanceId={selectedDeptInstanceId}
          view={view}
          isAdmin={isAdmin}
          projects={projects}
          error={projectsError}
          band={
            // The Tree tab has carousels of its own; the other two share
            // this one.
            view === 'tree' ? null : (
              <ProjectBand
                canCreate={isAdmin}
                selectedProjectId={selectedProjectId}
                onSelectProject={handleSelectProject}
                onProjectCreated={() => setMapRefreshKey((k) => k + 1)}
                isDrawingSite={isDrawingSite}
                onStartDrawSite={() => {
                  setDrawnSiteGeometry(null)
                  setIsDrawingSite(true)
                }}
                onStopDrawSite={() => setIsDrawingSite(false)}
                drawnSiteGeometry={drawnSiteGeometry}
                optionsRefreshKey={optionsRefreshKey}
                selectedOptionId={selectedOptionId}
                onSelectOption={(optionId) => leaveOption({ optionId })}
              />
            )
          }
          optionChooser={
            selectedProjectId ? (
              <OptionChooser
                projectId={selectedProjectId}
                refreshKey={optionsRefreshKey}
                onSelectOption={(optionId) => leaveOption({ optionId })}
              />
            ) : (
              <PanelNote pad>Select a project to begin.</PanelNote>
            )
          }
        />

        {/* Side is split 3:1. The top three quarters change with what you
            clicked; the bottom quarter is the HUD, which never does. */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            background: '#fafafa',
          }}
        >
        <div style={{ flex: 3, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          {/* Side reports on what main is showing: the site's numbers on UHDP,
              the open option on Project, the selected department's rooms on
              Tree. Selecting happens in main. */}
          {view === 'map' && (
            <div style={{ padding: 16, minWidth: 0 }}>
              <ProjectSummary
                projects={projects}
                selectedProjectId={selectedProjectId}
                selectedOptionId={selectedOptionId}
                optionsRefreshKey={optionsRefreshKey}
                option={{
                  name: builderState.optionName,
                  departments: builderState.departments,
                  sectionIds: builderState.sectionIds,
                }}
                onOpenProgram={() => navigate({ view: 'project' })}
              />
            </div>
          )}

          {/* Hidden rather than unmounted off the Project tab, so switching
              tabs doesn't discard unsaved option edits. */}
          <div style={{ display: view === 'project' ? 'block' : 'none', padding: 16, minWidth: 0 }}>
            {selectedOptionId && (
              <InstanceBuilder
                loadOptionId={selectedOptionId}
                selection={selection}
                onSaved={() => setOptionsRefreshKey((k) => k + 1)}
                onSelectDepartment={handleSelectDepartment}
                highlightedDepartmentId={highlightedDepartmentId}
                selectedDeptInstanceId={selectedDeptInstanceId}
                onExposeActions={setBuilderState}
              />
            )}
          </div>

          {view === 'tree' && (
            <div style={{ padding: 16, minWidth: 0 }}>
              <RoomLinkPanel selectedDeptInstanceId={selectedDeptInstanceId} canEdit={isAdmin} />
            </div>
          )}
        </div>

        <Hud
          projectName={projects.find((p) => p.id === selectedProjectId)?.name}
          siteGeojson={projects.find((p) => p.id === selectedProjectId)?.site_geojson}
          optionName={builderState.optionName}
          departments={builderState.departments}
        />
        </div>
      </div>

      <AppFooter
        view={view}
        canEdit={isAdmin}
        builder={builderState}
        onViewChange={(next) => navigate({ view: next })}
      />

      {pending && (
        <ConfirmModal
          title="Unsaved changes"
          tone="primary"
          confirmLabel={builderState.saving ? 'Saving…' : 'Save and continue'}
          confirmDisabled={builderState.saving}
          onConfirm={async () => {
            const saved = await builderState.save()
            // A refused write — a version conflict, or the network — must not
            // then throw the changes away. Stay put and let them see why.
            if (saved === false) return
            const run = pending.run
            setPending(null)
            run()
          }}
          secondaryLabel="Discard"
          onSecondary={() => {
            const run = pending.run
            setPending(null)
            run()
          }}
          onCancel={() => setPending(null)}
        >
          {builderState.editingName ? `"${builderState.editingName}"` : 'This department'} has room and object changes
          that aren't saved. Leaving discards them.
        </ConfirmModal>
      )}

      <LoadingOverlay />
    </div>
    </TreeEditorProvider>
  )
}
