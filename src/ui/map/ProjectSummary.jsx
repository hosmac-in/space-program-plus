// Side, on UHDP: the numbers behind what main is showing, narrowing as you
// choose.
//
// Nothing selected: how many projects there are. A project: its site, including
// the area that used to float in a small card over the map — it reads better
// here, since that card covered the very thing it described. An option as well:
// what that option currently programs onto the site.
//
// Selecting a project deliberately does NOT leave this screen any more. You see
// what you picked first, and go on to the program when you choose to — that's
// what the Space Program button is for.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../data/supabase.js'
import OptionStats from '../option/OptionStats.jsx'
import { Stat, StatCard } from '../primitives/Stat.jsx'
import { AREA_UNIT, formatArea, siteAreas } from './area.js'

export default function ProjectSummary({
  projects,
  selectedProjectId,
  selectedOptionId,
  optionsRefreshKey,
  // The open option's in-memory departments and name, straight from
  // InstanceBuilder — which stays mounted on this tab, so these stay current as
  // the option is edited. summarize() must have the in-memory array: the wire
  // format carries no areas (see data/optionData.js).
  option,
  onOpenProgram,
  // Editing the site's GeoJSON — admin only, and the map's draw mode is shared
  // with New Project, so a drawn shape lands in whichever form is open.
  canEdit = false,
  isDrawingSite,
  onStartDrawSite,
  onStopDrawSite,
  drawnSiteGeometry,
  onSiteSaved,
}) {
  const [editing, setEditing] = useState(false)
  // A different project closes the editor rather than carrying it across.
  useEffect(() => setEditing(false), [selectedProjectId])
  // How many options each project has. Only the selected project's count is
  // shown, but the query is one round trip either way, and this panel is the
  // only thing that needs it.
  const [optionCounts, setOptionCounts] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('sp_option')
      .select('project_id')
      .then(({ data, error }) => {
        if (cancelled || error) return
        const counts = new Map()
        data.forEach((row) => counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1))
        setOptionCounts(counts)
      })
    return () => {
      cancelled = true
    }
  }, [optionsRefreshKey, projects])

  const selected = projects.find((p) => p.id === selectedProjectId)

  // Home is one number. The rest — areas, option counts — belongs to a project,
  // and is shown once you pick one.
  if (!selected) {
    return (
      <>
        <StatCard title="All projects">
          <Stat label="Projects" value={projects.length} />
        </StatCard>
        <p style={{ fontSize: 12, color: '#999', margin: '0 16px' }}>
          Pick a project on the map, or from the band above it, to see its site.
        </p>
      </>
    )
  }

  const areas = siteAreas(selected.site_geojson)
  const options = optionCounts?.get(selected.id) ?? 0

  return (
    <>
      {editing && (
        <SiteEditor
          key={selected.id}
          project={selected}
          isDrawingSite={isDrawingSite}
          onStartDrawSite={onStartDrawSite}
          onStopDrawSite={onStopDrawSite}
          drawnSiteGeometry={drawnSiteGeometry}
          onClose={() => {
            onStopDrawSite?.()
            setEditing(false)
          }}
          onSaved={() => {
            onStopDrawSite?.()
            setEditing(false)
            onSiteSaved?.()
          }}
        />
      )}
      <StatCard
        title={
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0 }}>{selected.name}</span>
            {canEdit && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                style={{ fontSize: 11, fontWeight: 400, padding: '2px 8px', cursor: 'pointer' }}
              >
                Edit site
              </button>
            )}
          </span>
        }
      >
        {areas ? (
          <>
            <Stat label="Site area" value={formatArea(areas.sqft)} unit={AREA_UNIT} />
            <Stat label="" value={formatArea(areas.sqm)} unit="sqm" />
            <Stat label="" value={formatArea(areas.acre, 2)} unit="acres" />
          </>
        ) : (
          <span style={{ fontSize: 12, color: '#999' }}>No site drawn for this project yet.</span>
        )}
        <Stat label="Context drawn" value={selected.context_geojson ? 'Yes' : 'No'} />
        <Stat label="Options" value={optionCounts ? options : '—'} />
      </StatCard>

      {/* An option is open: what it currently programs onto that site. Live —
          edit the option on the Project tab and these follow. The same card
          side shows on the Project tab, plus how much of the site it covers,
          which is the comparison this screen exists for. */}
      {selectedOptionId && (
        <OptionStats
          name={option?.name}
          departments={option?.departments}
          sectionCount={option?.sectionIds?.length}
          buildingCount={option?.buildingIds?.length}
          phaseCount={option?.phaseCount}
          buildingFactors={option?.buildingFactors}
          siteSqft={areas?.sqft ?? null}
        />
      )}

      {/* The way on from looking at a site to programming it. */}
      <button
        type="button"
        onClick={onOpenProgram}
        style={{
          width: '100%',
          padding: '12px 16px',
          fontSize: 15,
          fontWeight: 600,
          color: '#fff',
          background: '#1a73e8',
          border: '1px solid #1558b0',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Space Program →
      </button>
    </>
  )
}

function extractGeometry(parsed) {
  if (parsed?.type === 'Feature') return parsed.geometry
  if (parsed?.type === 'FeatureCollection') return parsed.features[0]?.geometry
  return parsed
}

// The site's GeoJSON as text, editable by hand or redrawn on the map. Context is
// optional: left blank it is kept as it is, never cleared.
function SiteEditor({ project, isDrawingSite, onStartDrawSite, onStopDrawSite, drawnSiteGeometry, onClose, onSaved }) {
  const [siteText, setSiteText] = useState(() =>
    project.site_geojson ? JSON.stringify(project.site_geojson, null, 2) : ''
  )
  const [contextText, setContextText] = useState(() =>
    project.context_geojson ? JSON.stringify(project.context_geojson, null, 2) : ''
  )
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (drawnSiteGeometry) setSiteText(JSON.stringify(drawnSiteGeometry, null, 2))
  }, [drawnSiteGeometry])

  async function save() {
    setError(null)
    let site, context
    try {
      site = extractGeometry(JSON.parse(siteText))
      context = contextText.trim() === '' ? null : extractGeometry(JSON.parse(contextText))
    } catch {
      setError('Site and context (if provided) must be valid GeoJSON.')
      return
    }
    if (!site?.type || !site?.coordinates) {
      setError('Could not find a geometry in the Site input.')
      return
    }
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    const { error } = await supabase.rpc('update_project_site', {
      project_id: project.id,
      site_geojson: site,
      context_geojson: context,
    })
    savingRef.current = false
    setSaving(false)
    if (error) setError(error.message)
    else onSaved()
  }

  const box = { width: '100%', fontFamily: 'monospace', fontSize: 11, boxSizing: 'border-box' }
  return (
    <StatCard title={`Edit site — ${project.name}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
        <span>Site (GeoJSON)</span>
        {isDrawingSite ? (
          <button type="button" onClick={onStopDrawSite}>Done drawing</button>
        ) : (
          <button type="button" onClick={onStartDrawSite}>Redraw on map</button>
        )}
      </div>
      <textarea value={siteText} onChange={(e) => setSiteText(e.target.value)} rows={8} style={box} />
      <span style={{ fontSize: 12 }}>Context (GeoJSON, optional)</span>
      <textarea value={contextText} onChange={(e) => setContextText(e.target.value)} rows={4} style={box} />
      {error && <span style={{ fontSize: 12, color: '#c5221f' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save site'}</button>
      </div>
    </StatCard>
  )
}
