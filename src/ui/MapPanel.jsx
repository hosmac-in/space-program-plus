import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import DrawControl from './map/DrawControl.jsx'
import SiteClusterLayer from './map/SiteClusterLayer.jsx'
import DepartmentGraph from './option/DepartmentGraph.jsx'
import TreeCanvas from './tree/TreeCanvas.jsx'
import QuestionOutline from './questions/QuestionOutline.jsx'
import { RULE } from './layout.js'
import { Z } from './primitives/zIndex.js'

const INDIA_BOUNDS = [
  [6.5546079, 68.1113787],
  [35.6745457, 97.395561],
]

const BASE_LAYERS = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  },
}

function FlyToSelected({ selectedProjectId, projects, skipNextFlyRef }) {
  const map = useMap()

  useEffect(() => {
    if (skipNextFlyRef.current) {
      skipNextFlyRef.current = false
      return
    }

    const project = projects.find((p) => p.id === selectedProjectId)
    if (!project) return

    const layers = []
    if (project.site_geojson) layers.push(L.geoJSON(project.site_geojson))
    if (project.context_geojson) layers.push(L.geoJSON(project.context_geojson))
    if (layers.length === 0) return

    const bounds = L.featureGroup(layers).getBounds()
    if (bounds.isValid()) {
      map.flyToBounds(bounds, { padding: [20, 20], duration: 1.5 })
    }
  }, [selectedProjectId, projects, map, skipNextFlyRef])

  return null
}

export default function MapPanel({
  projectId,
  onSelectProject,
  drawMode,
  onSiteDrawn,
  optionId,
  optionName,
  departments,
  departmentDefs,
  onAddDepartments,
  onRemoveDepartment,
  sectionIds,
  onAddSection,
  onRemoveSection,
  buildingIds,
  phaseCount,
  selection,
  onSelectContainer,
  onClearSelection,
  onSelectDepartment,
  selectedDeptInstanceId,
  selectedPhase,
  // The Questions tab: which building is being authored, and which node in it
  // side is reporting on.
  questionBuildingId,
  onSelectQuestionBuilding,
  selectedQuestionId,
  onSelectQuestion,
  onLeaveQuestions,
  view,
  isAdmin,
  // The band across the top of main, when the open tab has one. Passed in
  // rather than built here: it's the Canvas tab's project and option pickers,
  // whose state belongs to App.
  band,
  // Shown in main instead of the department graph when a project is open but
  // no option is. Passed in like `band`: it lists and creates options, which is
  // App's data to wire.
  optionChooser,
  // The projects with their geometry. App fetches them, because side reports on
  // the same list — see ProjectSummary.
  projects,
  error,
}) {
  const [baseOpacity, setBaseOpacity] = useState(0.5)
  const [baseLayerType, setBaseLayerType] = useState('street')
  const skipNextFlyRef = useRef(false)

  const selectedProject = projects.find((p) => p.id === projectId)

  return (
    <div
      style={{
        width: '75%',
        height: '100%',
        flexShrink: 0,
        borderRight: RULE,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'visible',
      }}
    >
          {band}

          {/* Whatever the band leaves: every screen fills this box. */}
          <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          {view === 'project' && !optionId && <div style={{ position: 'absolute', inset: 0 }}>{optionChooser}</div>}

          {view === 'project' && optionId && (
            <div style={{ position: 'absolute', inset: 0 }}>
              <DepartmentGraph
                optionName={optionName}
                departments={departments}
                departmentDefs={departmentDefs}
                onAddDepartments={onAddDepartments}
                onRemoveDepartment={onRemoveDepartment}
                sectionIds={sectionIds}
                onAddSection={onAddSection}
                onRemoveSection={onRemoveSection}
                buildingIds={buildingIds}
                phaseCount={phaseCount}
                selection={selection}
                onSelectContainer={onSelectContainer}
                onClearSelection={onClearSelection}
                onSelectDepartment={onSelectDepartment}
                selectedDeptInstanceId={selectedDeptInstanceId}
                selectedPhase={selectedPhase}
              />
            </div>
          )}

          {view === 'tree' && (
            <div style={{ position: 'absolute', inset: 0 }}>
              <TreeCanvas
                onSelectDepartment={onSelectDepartment}
                selectedDeptInstanceId={selectedDeptInstanceId}
                canEdit={isAdmin}
              />
            </div>
          )}

          {view === 'questions' && (
            <div style={{ position: 'absolute', inset: 0 }}>
              <QuestionOutline
                buildingId={questionBuildingId}
                onSelectBuilding={onSelectQuestionBuilding}
                selectedId={selectedQuestionId}
                onSelect={onSelectQuestion}
                onLeave={onLeaveQuestions}
                canEdit={isAdmin}
              />
            </div>
          )}

          {view === 'map' && error && <p style={{ color: 'red', padding: 8 }}>{error}</p>}

          {view === 'map' && (
          <>
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: Z.mapControls,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              alignItems: 'flex-end',
            }}
          >
            <div
              style={{
                background: '#fff',
                padding: 8,
                borderRadius: 6,
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                fontSize: 12,
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <label>
                  Base opacity: {Math.round(baseOpacity * 100)}%
                  <br />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={baseOpacity * 100}
                    onChange={(e) => setBaseOpacity(Number(e.target.value) / 100)}
                    style={{ width: 140 }}
                  />
                </label>
              </div>
              <div>
                <label style={{ marginRight: 8 }}>
                  <input
                    type="radio"
                    name="baseLayerType"
                    checked={baseLayerType === 'street'}
                    onChange={() => setBaseLayerType('street')}
                  />{' '}
                  Street
                </label>
                <label>
                  <input
                    type="radio"
                    name="baseLayerType"
                    checked={baseLayerType === 'satellite'}
                    onChange={() => setBaseLayerType('satellite')}
                  />{' '}
                  Satellite
                </label>
              </div>
            </div>

          </div>

      <MapContainer
        bounds={INDIA_BOUNDS}
        style={{ width: '100%', height: '100%', backgroundColor: '#fff' }}
        zoomControl={false}
      >
        <ZoomControl position="bottomleft" />
        <TileLayer
          key={baseLayerType}
          attribution={BASE_LAYERS[baseLayerType].attribution}
          url={BASE_LAYERS[baseLayerType].url}
          opacity={baseOpacity}
        />

        {projects
          .filter((p) => p.site_geojson)
          .map((p) => (
            <GeoJSON
              key={`site-${p.id}`}
              data={p.site_geojson}
              style={{
                color: p.id === projectId ? '#1a73e8' : '#c0392b',
                weight: p.id === projectId ? 2 : 1,
                fillOpacity: p.id === projectId ? 0.15 : 0.05,
              }}
              eventHandlers={
                drawMode
                  ? {}
                  : {
                      click: () => {
                        skipNextFlyRef.current = true
                        onSelectProject?.(p.id)
                      },
                    }
              }
            />
          ))}

        {selectedProject?.context_geojson && (
          <GeoJSON
            key={`context-${selectedProject.id}`}
            data={selectedProject.context_geojson}
            style={{ color: '#888', weight: 1, dashArray: '4', fillOpacity: 0 }}
          />
        )}

        <SiteClusterLayer
          projects={projects}
          projectId={projectId}
          onSelectProject={onSelectProject}
          drawMode={drawMode}
          skipNextFlyRef={skipNextFlyRef}
        />

        <FlyToSelected selectedProjectId={projectId} projects={projects} skipNextFlyRef={skipNextFlyRef} />

        {drawMode && <DrawControl onChange={onSiteDrawn} />}
      </MapContainer>
          </>
          )}
          </div>
    </div>
  )
}
