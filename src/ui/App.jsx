// Top-level shell: auth gate, then a 75/25 split of map-or-canvas on the left
// and the project/option controls on the right.
//
// App owns exactly one piece of cross-cutting state — which department is
// selected — because three panes need to agree on it. Everything else lives in
// the component that uses it, or in the catalog provider.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../data/supabase.js'
import { resolveNodePlacement } from '../data/tree.js'
import { useUrlState } from '../url.js'
import { useIsAdmin, useSession } from '../data/auth.js'
import { CatalogProvider, useCatalog } from '../data/catalog.jsx'
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
import BuildingPanel from './tree/BuildingPanel.jsx'
import { TreeEditorProvider } from './tree/useTreeEditor.jsx'
import QuestionDetail from './questions/QuestionDetail.jsx'
import { QuestionnaireEditorProvider } from './questions/useQuestionnaireEditor.jsx'
import LoadingOverlay from './primitives/LoadingOverlay.jsx'
import AppFooter from './AppFooter.jsx'
import AppHeader from './AppHeader.jsx'
import { RULE } from './layout.js'
import { APP_STYLE } from './appStyle.js'
import { ADD_BUTTON_STYLE } from './primitives/AddButton.jsx'
import { REMOVE_BUTTON_STYLE } from './primitives/RemoveButton.jsx'
import { RESET_BUTTON_STYLE } from './primitives/ResetButton.jsx'
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
  const { error: catalogError, sections, buildings } = useCatalog()

  // Which tab, project and option you're looking at lives in the address bar
  // rather than in state, so every screen has a shareable link and survives a
  // reload. See src/url.js.
  const [
    { view, projectId: selectedProjectId, optionId: selectedOptionId, buildingId: urlBuildingId },
    navigate,
  ] = useUrlState()

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
  // Which building's band is selected on the TREE tab. Never set at the same
  // time as a department: the two are the pane's two faces there, and holding
  // both would leave it showing one while the canvas highlighted the other.
  //
  // Not the same thing as `selection`, which is the Project canvas's — that one
  // has four kinds and drives a different panel entirely.
  const [selectedTreeBuildingId, setSelectedTreeBuildingId] = useState(null)
  // ...and which of the option's phases. A placement holds one entry per phase
  // it is staged in, each with its own rooms, so the node id alone no longer
  // names one department to edit. Meaningless on the Tree tab, which has no
  // phases — that panel reads the node id only.
  const [selectedPhase, setSelectedPhase] = useState(1)

  // Exposed by InstanceBuilder so the canvases can add and remove departments
  // without App owning the option's state.
  const [builderState, setBuilderState] = useState({
    departments: [],
    sectionIds: [],
    buildingIds: [],
    departmentDefs: [],
    optionName: '',
    addDepartments: () => {},
    removeDepartment: () => {},
    addSection: () => {},
    removeSection: () => {},
    phaseCount: 1,
    setOptionSettings: () => {},
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
    dirty: false,
    saving: false,
    saveError: null,
    save: () => {},
  })

  // How many of the open option's departments sit in each building, resolved
  // live from the tree. The building list dialog uses it to say what unticking
  // a building would cost before you tick it off, rather than only after.
  //
  // Counted by PLACEMENT, not by entry: a department staged in three phases is
  // three entries but one department, and "drops 3 departments" for what the
  // user sees as one card would misstate the cost.
  const departmentCountByBuilding = useMemo(() => {
    const counts = {}
    const seen = new Set()
    builderState.departments.forEach((d) => {
      if (seen.has(d.treeNodeId)) return
      seen.add(d.treeNodeId)
      const id = resolveNodePlacement(sections, d.treeNodeId)?.buildingId
      if (id) counts[id] = (counts[id] ?? 0) + 1
    })
    return counts
  }, [builderState.departments, sections])

  // How many department entries sit in each phase, for the same reason one
  // level along: lowering the phase count drops every entry above the new
  // number, and the dialog says so before you commit.
  const departmentCountByPhase = useMemo(() => {
    const counts = {}
    builderState.departments.forEach((d) => {
      counts[d.phase] = (counts[d.phase] ?? 0) + 1
    })
    return counts
  }, [builderState.departments])

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

  // Which building's questionnaire the Questions tab is authoring. From the URL,
  // falling back to the first building — the same rule the tab's chip row
  // follows, and the reason a `b` that names nothing is not an error.
  const questionBuildingId =
    buildings.find((b) => b.id === urlBuildingId)?.id ?? buildings[0]?.id ?? null

  // Which node in that questionnaire is open in side. Not in the URL, for the
  // same reason the department selection isn't: clicking down a list of
  // questions would flood the Back button.
  const [selectedQuestionId, setSelectedQuestionId] = useState(null)

  // What side is showing on the Project tab, set by what was last clicked on
  // its canvas: a department, a group box, a section box, or nothing at all.
  // Null means nothing — the canvas's own empty space — and side falls back to
  // the option's totals.
  const [selection, setSelection] = useState(null)

  // ANY change that takes the edited department off the side panel asks first.
  //
  // Room and object edits live only in memory until Save Data is pressed, and
  // the panel shows one department at a time — so clicking another department,
  // clicking the canvas, selecting a group or section, and switching option or
  // project all replace what you were editing. Every one of them goes through
  // here, and none of them proceeds until you've said save or discard.
  //
  // Switching TAB deliberately does not. The option panel is hidden rather than
  // unmounted off the Project tab (see the note below it), so a tab change loses
  // nothing and a prompt over it would be asking about a loss that isn't
  // happening. Every view change is therefore a bare navigate.
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

  function handleSelectTreeBuilding(buildingId) {
    setSelectedTreeBuildingId(buildingId)
    // The pane shows one or the other. No guard: the Tree tab writes every edit
    // as it is made, so there is never anything unsaved to ask about.
    setSelectedDeptInstanceId(null)
  }

  function handleSelectDepartment(defId, treeNodeId, phase = 1) {
    const select = () => {
      setSelectedTreeBuildingId(null)
      setHighlightedDepartmentId(defId)
      setSelectedDeptInstanceId(treeNodeId ?? null)
      setSelectedPhase(phase)
      setSelection({ kind: 'department', id: treeNodeId ?? defId })
    }
    // Clicking the department already open changes nothing, so it needn't ask.
    //
    // The PHASE is part of that: two strips of one card are two departments to
    // edit, with their own rooms, so moving between them must ask about unsaved
    // ones exactly as moving between two cards does.
    const same =
      selection?.kind === 'department' &&
      phase === selectedPhase &&
      (treeNodeId ? treeNodeId === selectedDeptInstanceId : defId === highlightedDepartmentId)
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
    {/* Both editors are held above the columns, not inside one: each tab's
        outline and its detail panel are one editing session and must share one
        write queue. See the note in useQuestionnaireEditor.jsx. */}
    <QuestionnaireEditorProvider buildingId={questionBuildingId}>
    {/* The four regions — header, main, side, footer — and the three
        regulating lines between them. See CLAUDE.md. */}
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      <style>{APP_STYLE + REMOVE_BUTTON_STYLE + RESET_BUTTON_STYLE + ADD_BUTTON_STYLE + RIBBON_STYLE}</style>

      <AppHeader
        onHome={() => leaveOption({ view: 'map', projectId: null, optionId: null })}
        email={session.user.email}
        onSignOut={() => supabase.auth.signOut()}
      />

      {/* The catalog is the shared vocabulary for every screen, so a failure to
          read it isn't a panel's problem — nothing works, and every screen goes
          quietly empty. It surfaces once, here, above all four regions.

          The case this exists for: a missing table after a deploy whose SQL
          hasn't been run yet. One table failing empties all of them, because
          reloadAll fetches them together. */}
      {catalogError && (
        <div
          style={{
            flexShrink: 0,
            padding: '8px 16px',
            background: '#fdecea',
            borderBottom: RULE,
            color: '#8a1c12',
            fontSize: 12,
          }}
        >
          Couldn't read the catalog: {catalogError}. If a table is missing, run the matching file in{' '}
          <code>sql/</code> — see <code>sql/README.md</code>.
        </div>
      )}

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
          buildingIds={builderState.buildingIds}
          buildingFactors={builderState.buildingFactors}
          phaseCount={builderState.phaseCount}
          selection={selection}
          onSelectContainer={(next) => guard(() => setSelection(next))}
          onSelectDepartment={handleSelectDepartment}
          onSelectTreeBuilding={handleSelectTreeBuilding}
          selectedTreeBuildingId={selectedTreeBuildingId}
          highlightedDepartmentId={highlightedDepartmentId}
          selectedDeptInstanceId={selectedDeptInstanceId}
          selectedPhase={selectedPhase}
          questionBuildingId={questionBuildingId}
          // Through the URL, not local state, so a link opens the building it
          // names — the same rule the project and option follow.
          onSelectQuestionBuilding={(id) => navigate({ buildingId: id })}
          selectedQuestionId={selectedQuestionId}
          onSelectQuestion={setSelectedQuestionId}
          // The way back out, and back to whatever you were doing: the Tree tab
          // is a toggle for the same reason.
          onLeaveQuestions={() => navigate({ view: selectedOptionId ? 'project' : 'map' })}
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
                openBuildingIds={builderState.buildingIds}
                openPhaseCount={builderState.phaseCount}
                // One guarded action, not two: the dialog sets both with one
                // Save, and `guard` holds a single pending action — two calls
                // would leave only the second waiting behind the prompt. It can
                // drop departments, including the one being edited, which is
                // what it is guarded for.
                onSetOptionSettings={(next) => guard(() => builderState.setOptionSettings(next))}
                departmentCountByBuilding={departmentCountByBuilding}
                // How many entries a lower phase count would drop, so the
                // dialog can say what it costs before you commit.
                departmentCountByPhase={departmentCountByPhase}
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

        {/* Side is split 7:1. Everything above changes with what you clicked;
            the bottom eighth is the HUD, which never does — it was a quarter,
            which was more than a row of figures needed and came out of the
            panel doing the work. */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            background: '#fafafa',
          }}
        >
        <div style={{ flex: 7, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
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
                  buildingIds: builderState.buildingIds,
                  phaseCount: builderState.phaseCount,
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
                selectedPhase={selectedPhase}
                onExposeActions={setBuilderState}
              />
            )}
          </div>

          {view === 'tree' && (
            <div style={{ padding: 16, minWidth: 0 }}>
              {selectedTreeBuildingId ? (
                <BuildingPanel buildingId={selectedTreeBuildingId} canEdit={isAdmin} />
              ) : (
                <RoomLinkPanel selectedDeptInstanceId={selectedDeptInstanceId} canEdit={isAdmin} />
              )}
            </div>
          )}

          {view === 'questions' && (
            <div style={{ padding: 16, minWidth: 0 }}>
              <QuestionDetail selectedId={selectedQuestionId} canEdit={isAdmin} />
            </div>
          )}
        </div>

        <Hud
          projectName={projects.find((p) => p.id === selectedProjectId)?.name}
          siteGeojson={projects.find((p) => p.id === selectedProjectId)?.site_geojson}
          optionName={builderState.optionName}
          departments={builderState.departments}
          buildingFactors={builderState.buildingFactors}
          phaseCount={builderState.phaseCount}
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
    </QuestionnaireEditorProvider>
    </TreeEditorProvider>
  )
}
