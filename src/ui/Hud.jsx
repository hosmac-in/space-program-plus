// The HUD: the bottom quarter of side, on every tab.
//
// Everything above it changes with what you clicked — a department, a group, a
// project, the catalog. This doesn't. It answers the one question you keep
// asking while you work, wherever you are in the app: how big is this, and how
// does that compare to the land.
//
// For now that is areas alone. It's a fixed slot, so anything added later has
// to earn its place against what's already here rather than being appended.

import { phaseRows, summarize } from '../data/optionData.js'
import { siteAreas, formatArea } from './map/area.js'
import { RULE } from './layout.js'

function Figure({ label, value, unit, muted = false }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: '#8a8a8a',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: muted ? '#bbb' : '#222', whiteSpace: 'nowrap' }}>
        {value}
        {unit && <span style={{ fontSize: 11, fontWeight: 400, color: '#8a8a8a', marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  )
}

export default function Hud({ projectName, siteGeojson, optionName, departments, phaseCount = 1 }) {
  // The in-memory departments, as summarize() requires — the wire format has no
  // areas in it (see data/optionData.js).
  const { areaSqft, roomCount, objectCount, perPhase } = summarize(departments ?? [])
  const site = siteAreas(siteGeojson)
  const coverage = site ? (areaSqft / site.sqft) * 100 : null

  // Empty until the option declares more than one phase. This is a fixed slot
  // and the figures above are the ones you always want; splitting the programmed
  // area by phase earns its place when phasing exists and not before. A declared
  // phase with nothing in it still gets a row — a zero there is the point.
  const phases = phaseRows(perPhase, phaseCount)

  return (
    <div
      style={{
        // Fills its quarter of side rather than sizing to its content, so the
        // 3:1 split holds whatever the figures happen to say.
        flex: 1,
        minHeight: 0,
        borderTop: RULE,
        background: '#fff',
        padding: '12px 16px',
        overflowY: 'auto',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: '#8a8a8a',
          marginBottom: 10,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {projectName ?? 'No project'}
        {optionName ? ` · ${optionName}` : ''}
      </div>

      {/* Wraps rather than scrolls sideways: side is narrow, and a figure half
          off the edge is worse than one on a second row. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 24px', minWidth: 0 }}>
        <Figure label="Programmed" value={formatArea(areaSqft)} unit="sqft" muted={areaSqft === 0} />
        <Figure
          label="Site"
          value={site ? formatArea(site.sqft) : '—'}
          unit={site ? 'sqft' : undefined}
          muted={!site}
        />
        <Figure
          label="Of site"
          value={coverage != null ? formatArea(coverage, 1) : '—'}
          unit={coverage != null ? '%' : undefined}
          muted={coverage == null}
        />
        <Figure label="Rooms" value={roomCount} muted={roomCount === 0} />
        <Figure label="Objects" value={objectCount} muted={objectCount === 0} />
        {phases.map(({ key, label, totals }) => (
          <Figure
            key={key}
            label={label}
            value={formatArea(totals.areaSqft)}
            unit="sqft"
            // A phase nothing is staged in yet reads as a quiet zero rather
            // than as a figure among the ones that matter.
            muted={totals.departmentCount === 0}
          />
        ))}
      </div>
    </div>
  )
}
