// The HUD: the bottom eighth of side, on every tab.
//
// Everything above it changes with what you clicked — a department, a group, a
// project, the catalog. This doesn't. It answers the one question you keep
// asking while you work, wherever you are in the app: how big is this, and how
// does that compare to the land.
//
// For now that is areas alone. It's a fixed slot, so anything added later has
// to earn its place against what's already here rather than being appended.
//
// It was a QUARTER of side and is now half that. A row of figures did not need
// the height, and every pixel of it came out of the panel above, which is where
// the work happens — a department with many rooms was scrolling in a letterbox.
// The type below is sized for the slot: shrinking the region without shrinking
// the figures would just have hidden two of them behind a scrollbar.

import { phaseRows, summarize } from '../data/optionData.js'
import { useCatalog } from '../data/catalog.jsx'
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
      <div style={{ fontSize: 15, fontWeight: 700, color: muted ? '#bbb' : '#222', whiteSpace: 'nowrap' }}>
        {value}
        {unit && <span style={{ fontSize: 10, fontWeight: 400, color: '#8a8a8a', marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  )
}

export default function Hud({
  projectName,
  siteGeojson,
  optionName,
  departments,
  // This option's per-building factor overrides — the built-area factor grosses
  // every department and the floor-area one grosses each building's total, so
  // no area figure is right without them. See data/factors.js.
  buildingFactors,
  phaseCount = 1,
}) {
  // The in-memory departments, as summarize() requires — the wire format has no
  // areas in it (see data/optionData.js).
  // The catalog too, not just the option: a department's grossing factor may be
  // the one stated on its tree node rather than one set here, and a total that
  // skipped that would disagree with every panel — see data/factors.js.
  const { sections, buildings } = useCatalog()
  const { areaSqft, roomCount, objectCount, perPhase } = summarize(departments ?? [], {
    sections,
    buildings,
    buildingFactors,
  })
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
        // Fills its eighth of side rather than sizing to its content, so the
        // 7:1 split holds whatever the figures happen to say.
        flex: 1,
        minHeight: 0,
        borderTop: RULE,
        background: '#fff',
        padding: '8px 16px',
        overflowY: 'auto',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: '#8a8a8a',
          marginBottom: 6,
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', minWidth: 0 }}>
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
