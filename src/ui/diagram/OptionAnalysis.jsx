// The option's area, by department, as a pie chart. A placeholder: the real
// analysis view is whatever the EnergyPlus export ends up producing, and this
// is here so "View Analysis" has something behind it before that exists.
//
// Plain SVG, no charting library — the previous 3D diagram pulled in three.js
// for a view no one asked for again; this one draws four arcs and doesn't
// need a dependency to do it.

import { useMemo } from 'react'
import { useCatalog } from '../../data/catalog.jsx'
import { summarize } from '../../data/optionData.js'
import { AREA_UNIT, formatArea } from '../map/area.js'

const PALETTE = ['#4f7cac', '#e08e45', '#5fa777', '#c0563f', '#8266a8', '#c9a227', '#4a9b9b', '#a6588a']

const SIZE = 260
const RADIUS = 100
const CENTER = SIZE / 2

function arcPath(startAngle, endAngle) {
  const start = {
    x: CENTER + RADIUS * Math.cos(startAngle),
    y: CENTER + RADIUS * Math.sin(startAngle),
  }
  const end = {
    x: CENTER + RADIUS * Math.cos(endAngle),
    y: CENTER + RADIUS * Math.sin(endAngle),
  }
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
  return `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}

export default function OptionAnalysis({ departments, buildingFactors }) {
  const { sections, buildings } = useCatalog()

  const slices = useMemo(() => {
    const { perDepartment } = summarize(departments, { sections, buildings, buildingFactors })
    const withArea = perDepartment.filter((d) => d.areaSqft > 0)
    const total = withArea.reduce((sum, d) => sum + d.areaSqft, 0)
    if (total <= 0) return []

    let angle = -Math.PI / 2
    return withArea
      .sort((a, b) => b.areaSqft - a.areaSqft)
      .map((d, i) => {
        const start = angle
        const fraction = d.areaSqft / total
        angle += fraction * Math.PI * 2
        return {
          key: d.instanceId,
          name: d.name,
          areaSqft: d.areaSqft,
          fraction,
          path: arcPath(start, angle),
          color: PALETTE[i % PALETTE.length],
        }
      })
  }, [departments, sections, buildings, buildingFactors])

  if (slices.length === 0) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: '#999' }}>
        Nothing to chart yet — add rooms and areas to this option's departments.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', padding: 24, overflow: 'auto', height: '100%' }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ flexShrink: 0 }}>
        {slices.map((s) => (
          <path key={s.key} d={s.path} fill={s.color} stroke="#fff" strokeWidth={1} />
        ))}
      </svg>
      <div style={{ fontSize: 12, lineHeight: 1.6, minWidth: 160 }}>
        {slices.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{s.name}</span>
            <span style={{ color: '#666' }}>
              {formatArea(s.areaSqft)} {AREA_UNIT} ({Math.round(s.fraction * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
