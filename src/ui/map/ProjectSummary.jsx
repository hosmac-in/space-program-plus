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

import { useEffect, useState } from 'react'
import { supabase } from '../../data/supabase.js'
import OptionStats from '../option/OptionStats.jsx'
import { Stat, StatCard } from '../primitives/Stat.jsx'
import { formatArea, siteAreas } from './area.js'

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
}) {
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
      <StatCard title={selected.name}>
        {areas ? (
          <>
            <Stat label="Site area" value={formatArea(areas.sqft)} unit="sqft" />
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
