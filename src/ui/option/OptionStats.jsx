// What an option currently programs: its totals.
//
// Shown in two places, which is why it isn't written inline in either: in side
// on UHDP, under the project's site figures so the two can be read against each
// other, and in side on Project whenever nothing on the canvas is selected —
// the resting state of that panel.
//
// summarize() must be given the IN-MEMORY departments (see data/optionData.js):
// the wire format carries no areas and would total to zero.

import { summarize } from '../../data/optionData.js'
import { Stat, StatCard } from '../primitives/Stat.jsx'
import { formatArea } from '../map/area.js'

export default function OptionStats({ name, departments, sectionCount, siteSqft = null }) {
  const { departmentCount, roomCount, objectCount, areaSqft } = summarize(departments ?? [])
  const coverage = siteSqft ? (areaSqft / siteSqft) * 100 : null

  return (
    <StatCard title={name || 'Open option'}>
      {sectionCount != null && <Stat label="Sections" value={sectionCount} />}
      <Stat label="Departments" value={departmentCount} />
      <Stat label="Rooms" value={roomCount} />
      <Stat label="Objects" value={objectCount} />
      <Stat label="Programmed area" value={formatArea(areaSqft)} unit="sqft" />
      {coverage != null && <Stat label="Of site area" value={formatArea(coverage, 1)} unit="%" />}
    </StatCard>
  )
}
