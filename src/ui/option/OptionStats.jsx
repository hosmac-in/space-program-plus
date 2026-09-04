// What an option currently programs: its totals.
//
// Shown in two places, which is why it isn't written inline in either: in side
// on UHDP, under the project's site figures so the two can be read against each
// other, and in side on Project whenever nothing on the canvas is selected —
// the resting state of that panel.
//
// summarize() must be given the IN-MEMORY departments (see data/optionData.js):
// the wire format carries no areas and would total to zero.

import { phaseRows, summarize } from '../../data/optionData.js'
import { useCatalog } from '../../data/catalog.jsx'
import { Stat, StatCard } from '../primitives/Stat.jsx'
import { formatArea } from '../map/area.js'

export default function OptionStats({
  name,
  departments,
  sectionCount,
  buildingCount,
  phaseCount = 1,
  siteSqft = null,
  // See the note in Hud.jsx: no area figure is right without these.
  buildingFactors,
}) {
  // Sections as well as departments: a grossing factor may be inherited from
  // the catalog — see data/factors.js.
  const { sections, buildings } = useCatalog()
  const { departmentCount, roomCount, objectCount, areaSqft, perPhase } = summarize(departments ?? [], {
    sections,
    buildings,
    buildingFactors,
  })
  const coverage = siteSqft ? (areaSqft / siteSqft) * 100 : null
  const phases = phaseRows(perPhase, phaseCount)

  return (
    <StatCard title={name || 'Open option'}>
      {buildingCount != null && <Stat label="Buildings" value={buildingCount} />}
      {sectionCount != null && <Stat label="Sections" value={sectionCount} />}
      {/* A department staged in three phases is three of these: each is
          programmed separately, so each is a thing this option holds. The
          per-phase rows below are what breaks the figure down. */}
      <Stat label={phaseCount > 1 ? 'Departments (all phases)' : 'Departments'} value={departmentCount} />
      <Stat label="Rooms" value={roomCount} />
      <Stat label="Objects" value={objectCount} />
      <Stat label="Programmed area" value={formatArea(areaSqft)} unit="sqft" />
      {phases.map(({ key, label, totals }) => (
        <Stat key={key} label={label} value={formatArea(totals.areaSqft)} unit="sqft" />
      ))}
      {coverage != null && <Stat label="Of site area" value={formatArea(coverage, 1)} unit="%" />}
    </StatCard>
  )
}
