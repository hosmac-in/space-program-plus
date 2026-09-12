// THE EDITOR — the full app: four tabs, the map, the catalog, the questionnaire.
//
// The other app is the Rhino Companion (src/companion/), which shows one option
// and nothing else. Both are assembled from src/ui/; what they share about an
// option is `useOptionWorkspace`, `OptionCanvas` and `OptionPanel`, so the two
// cannot drift in what they show. See CLAUDE.md, Rhino Companion.
//
// This shell owns what only it has: the tabs, the map's state, and the
// selections the Tree and Questions tabs make. Everything about the open option
// comes from the workspace hook.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../data/supabase.js'
import { resolveNodePlacement } from '../data/tree.js'
import { useUrlState } from '../url.js'
import { useIsAdmin, useIsViewer } from '../data/auth.js'
import { ReadOnlyProvider } from '../readOnly.jsx'
import { useCatalog } from '../data/catalog.jsx'
import SessionGate from './SessionGate.jsx'
import MapPanel from './MapPanel.jsx'
import ProjectBand from './ProjectBand.jsx'
import ProjectSummary from './map/ProjectSummary.jsx'
import Hud from './Hud.jsx'
import ConfirmModal from './primitives/ConfirmModal.jsx'
import { PanelNote } from './panel/panelParts.jsx'
import OptionChooser from './option/OptionChooser.jsx'
import OptionCanvas from './option/OptionCanvas.jsx'
import OptionPanel from './option/OptionPanel.jsx'
import { useOptionWorkspace } from './option/useOptionWorkspace.js'
import RoomLinkPanel from './tree/RoomLinkPanel.jsx'
import BuildingPanel from './tree/BuildingPanel.jsx'
import { TreeEditorProvider } from './tree/useTreeEditor.jsx'
import QuestionDetail from './questions/QuestionDetail.jsx'
import { QuestionnaireEditorProvider } from './questions/useQuestionnaireEditor.jsx'
import LoadingOverlay from './primitives/LoadingOverlay.jsx'
import AppFooter from './AppFooter.jsx'
import AppHeader from './AppHeader.jsx'
import { RULE, SIDE_WIDTH } from './layout.js'
import { SHARED_STYLE } from './appStyles.js'

export default function App() {
  return <SessionGate>{(session) => <SignedInApp session={session} />}</SessionGate>
}

function SignedInApp({ session }) {
  // The editor's one reason nothing may be written. The Companion has the other
  // — it is read-only by construction. See src/readOnly.jsx.
  const readOnly = useIsViewer(session.user.id)
  // An admin who cannot write is not an admin for any purpose the UI has: the
  // tabs that check this are exactly the ones whose controls write.
  const isAdmin = useIsAdmin(session.user.id) && !readOnly
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

  // Which building's band is selected on the TREE tab. Never set at the same
  // time as a department: the two are the pane's two faces there, and holding
  // both would leave it showing one while the canvas highlighted the other.
  //
  // Not the same thing as `selection`, which is the Project canvas's — that one
  // has four kinds and drives a different panel entirely. It is also the one
  // piece of the workspace's selection that is tab-specific, which is why the
  // hook takes `onSelect` rather than knowing about it.
  const [selectedTreeBuildingId, setSelectedTreeBuildingId] = useState(null)

  // Everything about the open option, shared with the Companion so the two
  // cannot show different things — see ui/option/useOptionWorkspace.js.
  const workspace = useOptionWorkspace({ onSelect: () => setSelectedTreeBuildingId(null) })
  const {
    highlightedDepartmentId,
    selectedDeptInstanceId,
    setSelectedDeptInstanceId,
    selectedPhase,
    builderState,
    pending,
    setPending,
    guard,
    selectDepartment: handleSelectDepartment,
  } = workspace

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

  const leaveOption = (next) => guard(() => navigate(next))

  function handleSelectTreeBuilding(buildingId) {
    setSelectedTreeBuildingId(buildingId)
    // The pane shows one or the other. No guard: the Tree tab writes every edit
    // as it is made, so there is never anything unsaved to ask about.
    setSelectedDeptInstanceId(null)
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
    <ReadOnlyProvider readOnly={readOnly}>
    <TreeEditorProvider>
    {/* Both editors are held above the columns, not inside one: each tab's
        outline and its detail panel are one editing session and must share one
        write queue. See the note in useQuestionnaireEditor.jsx. */}
    <QuestionnaireEditorProvider buildingId={questionBuildingId}>
    {/* The four regions — header, main, side, footer — and the three
        regulating lines between them. See CLAUDE.md. */}
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      <style>
        {SHARED_STYLE}
      </style>

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
          optionCanvas={<OptionCanvas workspace={workspace} onSelectDepartment={handleSelectDepartment} diagram />}
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

        {/* A fixed SIDE_WIDTH, split 7:1. Everything above changes with what
            you clicked; the bottom eighth is the HUD, which never does — it was
            a quarter, which was more than a row of figures needed and came out
            of the panel doing the work. */}
        <div
          style={{
            width: SIDE_WIDTH,
            flexShrink: 0,
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
              <OptionPanel
                workspace={workspace}
                optionId={selectedOptionId}
                onSelectDepartment={handleSelectDepartment}
                onSaved={() => setOptionsRefreshKey((k) => k + 1)}
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
    </ReadOnlyProvider>
  )
}
