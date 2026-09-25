// A program's area as a treemap — an option's, or a Test run's (TestRun.jsx
// builds its own rows for AreaTreemap below): one tile per department, sized by
// area — and by AHU area, tiled inside their groups. A placeholder: the
// real analysis view is whatever the EnergyPlus export ends up producing.
//
// Groups are keyed by their placement's instance_id, never group_def_id — a
// duplicable group under two sections is two tiles. Areas are summarize()'s
// per-department figures (grossed, before the building's floor-area factor),
// so a tile agrees with the department card. Plain divs, no charting library.

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useCatalog } from '../../data/catalog.jsx'
import { summarize, roomCountIn } from '../../data/optionData.js'
import { functionColours } from '../../data/functions.js'
import { formatArea } from '../map/area.js'
import { useAreaUnit } from '../AreaUnitContext.jsx'
import Toggle from '../primitives/Toggle.jsx'

// The AHU toggle scales by the NET area of rooms whose sp_room name is this,
// × their count — matched by name, since there is no room "type" to key on.
// Net because grossing a plant room says nothing about the plant.
const AHU_ROOM = 'ahu room'
const isAhu = (r) => (r.name ?? '').trim().toLowerCase() === AHU_ROOM
const ahuAreaSqft = (d) =>
  (d.rooms ?? []).filter(isAhu).reduce((s, r) => s + roomCountIn(d, r) * (r.areaSqft ?? 0), 0)
const ahuCountOf = (d) => (d.rooms ?? []).filter(isAhu).reduce((s, r) => s + roomCountIn(d, r), 0)

const GAP = 3
const GROUP_HEAD = 22

// A TITLE GROWS TO FILL ITS TILE'S WIDTH — never below TITLE_MIN, where it
// ellipses instead, and never taller than TITLE_H_SHARE of the tile. The figure
// is centred in what the title leaves, so the two cannot overlap.
const TITLE_MIN = 12
const TITLE_MAX = 44
const TITLE_H_SHARE = 0.18
const TITLE_PAD = 14
const TITLE_TOP = 8
const TITLE_FONT = (px) => `600 ${px}px sans-serif`
// One canvas, measured at TITLE_MIN; width scales linearly with font size.
let measureCtx = null
const titleWidths = new Map()
function titleWidthAtMin(text) {
  if (titleWidths.has(text)) return titleWidths.get(text)
  measureCtx ??= typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  if (!measureCtx) return text.length * TITLE_MIN * 0.6
  measureCtx.font = TITLE_FONT(TITLE_MIN)
  const w = measureCtx.measureText(text).width
  titleWidths.set(text, w)
  return w
}
function titleSize(text, w, h) {
  // 3% short of the edge, so a pixel of rounding never turns a fit into an ellipsis.
  const room = (w - 2 * TITLE_PAD) * 0.97
  const natural = titleWidthAtMin(text)
  if (!(room > 0) || !(natural > 0)) return TITLE_MIN
  return Math.max(TITLE_MIN, Math.min(TITLE_MAX, (h - TITLE_TOP) * TITLE_H_SHARE, (TITLE_MIN * room) / natural))
}

// Squarified treemap (Bruls et al.): lay items along the shorter side, adding
// to a row while it improves the worst aspect ratio. Items must be sorted
// descending and have value > 0.
function squarify(items, x, y, w, h) {
  const out = []
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total <= 0 || w <= 0 || h <= 0) return out
  const scale = (w * h) / total
  let rest = items.map((i) => ({ item: i, area: i.value * scale }))

  const worst = (row, side) => {
    const sum = row.reduce((s, r) => s + r.area, 0)
    let max = 0
    row.forEach((r) => {
      const a = Math.max((side * side * r.area) / (sum * sum), (sum * sum) / (side * side * r.area))
      if (a > max) max = a
    })
    return max
  }

  while (rest.length) {
    const side = Math.min(w, h)
    let row = [rest[0]]
    let i = 1
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) {
      row.push(rest[i])
      i += 1
    }
    rest = rest.slice(i)
    const sum = row.reduce((s, r) => s + r.area, 0)
    const thick = sum / side
    let offset = 0
    row.forEach((r) => {
      const len = r.area / thick
      out.push(w >= h
        ? { item: r.item, x, y: y + offset, w: thick, h: len }
        : { item: r.item, x: x + offset, y, w: len, h: thick })
      offset += len
    })
    if (w >= h) { x += thick; w -= thick } else { y += thick; h -= thick }
  }
  return out
}

// The option's departments as treemap rows — see AreaTreemap.
export default function OptionAnalysis({ departments, buildingFactors }) {
  const { sections, buildings, groups: groupDefs } = useCatalog()

  const rows = useMemo(() => {
    const { perDepartment } = summarize(departments, { sections, buildings, buildingFactors })
    // department placement instance_id -> its group placement
    const groupOf = new Map()
    ;(sections ?? []).forEach((section) => {
      ;(section.tree?.groups ?? []).forEach((g) => {
        ;(g.departments ?? []).forEach((d) => d.instance_id && groupOf.set(d.instance_id, g))
      })
    })
    const deptById = new Map(departments.map((d) => [d.instanceId, d]))
    return perDepartment.map((d) => {
      const g = groupOf.get(d.treeNodeId) ?? null
      const def = g ? groupDefs.find((x) => x.id === g.group_def_id) : null
      return {
        key: d.instanceId,
        name: d.name,
        phase: d.phase,
        groupKey: g?.instance_id ?? 'none',
        groupName: def?.name ?? (g ? 'Unnamed group' : 'Not in the tree'),
        functionId: def?.function_id ?? null,
        areaSqft: d.areaSqft,
        ahuSqft: ahuAreaSqft(deptById.get(d.instanceId)),
        ahuCount: ahuCountOf(deptById.get(d.instanceId)),
      }
    })
  }, [departments, sections, buildings, buildingFactors, groupDefs])

  return <AreaTreemap rows={rows} emptyText="Nothing to chart yet — add rooms and areas to this option's departments." />
}

// The option cards' duration. Left to CSS, so a tile keeps its DOM node across
// the toggle and slides rather than being replaced.
const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const TWEEN = reducedMotion
  ? 'none'
  : ['left', 'top', 'width', 'height', 'opacity', 'background-color', 'color'].map((p) => `${p} 450ms ease`).join(', ')

// The rows bucketed by department group, each group's value `pick(row)` summed.
function byGroup(rows, pick) {
  const buckets = new Map()
  rows.forEach((row) => {
    const value = pick(row)
    if (!(value > 0)) return
    if (!buckets.has(row.groupKey)) {
      buckets.set(row.groupKey, { key: row.groupKey, name: row.groupName, functionId: row.functionId, value: 0, count: 0, departments: [] })
    }
    const bucket = buckets.get(row.groupKey)
    bucket.value += value
    bucket.count += row.ahuCount ?? 0
    // One tile per phase entry: a department in two phases is two figures.
    bucket.departments.push({ ...row, value })
  })
  const list = [...buckets.values()].sort((a, b) => b.value - a.value)
  list.forEach((g) => g.departments.sort((a, b) => b.value - a.value))
  return list
}

// BOTH VIEWS ARE ONE TILE PER DEPARTMENT GROUP, nothing inside it — sized by
// area, or by AHU room area. A group is the SAME element in both, so it slides
// between them; one absent from a view fades where the other put it.
function tileGroups(list, w, h) {
  const out = new Map()
  squarify(list, 0, 0, w, h).forEach(({ item, x, y, w: gw, h: gh }) =>
    out.set(item.key, { item, x, y, w: gw - GAP, h: gh - GAP })
  )
  return out
}

function layouts(rows, w, h) {
  const flatList = byGroup(rows, (r) => r.areaSqft)
  const ahuList = byGroup(rows, (r) => r.ahuSqft)
  return {
    flat: tileGroups(flatList, w, h),
    flatTotal: flatList.reduce((s, g) => s + g.value, 0),
    grouped: tileGroups(ahuList, w, h),
    ahuTotal: ahuList.reduce((s, g) => s + g.count, 0),
  }
}

// THE DRAWING, for any program: the option's, or what a Test run has built.
// `rows` is one per department (per phase entry): { key, name, phase, groupKey,
// groupName, functionId, areaSqft, ahuSqft }. Grouping, the AHU toggle and the
// layout are all here, so the two tabs cannot draw it differently.
//
// A BOX'S TITLE IS ITS NAME ALONE, and centred in it is one figure scaled to the
// tile: its % of the area, or its AHU room count.
export function AreaTreemap({ rows, emptyText }) {
  const { functions } = useCatalog()
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()
  const boxRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [ahuOnly, setAhuOnly] = useState(false)
  // The department under the pointer, drawn at once — a native title waits a
  // second and a tile's own label is cut short on most of them.
  const [hover, setHover] = useState(null)
  const track = (label) => (e) => {
    const box = boxRef.current?.getBoundingClientRect()
    if (box) setHover({ label, x: e.clientX - box.left, y: e.clientY - box.top })
  }

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { flat, flatTotal, grouped, ahuTotal } = useMemo(
    () => layouts(rows, size.w, size.h),
    [rows, size.w, size.h]
  )
  const shown = ahuOnly ? grouped : flat
  const other = ahuOnly ? flat : grouped
  const count = shown.size
  const hasData = count > 0

  const area = (sqft) => `${formatArea(toDisplay(sqft))} ${AREA_UNIT}`
  // A count, not an area: no decimal written unless there is one.
  const ahus = (n) => formatArea(n ?? 0, 2, 0)
  // The % is drawn separately, small — a full-size sign cost a fifth of the
  // width the figure is scaled to.
  const percent = (v) => formatArea(flatTotal > 0 ? (v / flatTotal) * 100 : 0, 1, 0)
  // THE FIGURE SCALES WITH ITS TILE: as large as the height under the title
  // allows and as its ~4 characters fit across, so a big group reads from
  // across the room.
  const figureSize = (w, h) => Math.min(120, h * 0.7, w / 2.6)

  // Every group either layout places, in one list so its node survives the
  // toggle; one the current layout leaves out fades where the other put it.
  const groupKeys = [...new Set([...flat.keys(), ...grouped.keys()])]
  const groupTiles = groupKeys.map((key) => ({
    key,
    rect: shown.get(key) ?? other.get(key),
    on: shown.has(key),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16, boxSizing: 'border-box', gap: 8 }}>
      <div style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Left, not right: the View Space Program button sits top-right. */}
        <Toggle checked={ahuOnly} onChange={(v) => { setHover(null); setAhuOnly(v) }} title="Scale by AHU room area only" />
        <span>Only AHU rooms</span>
        <span style={{ marginLeft: 12 }}>
          {ahuOnly ? 'AHU rooms by department group, count' :'Area by department group, % of total'}
          {hasData && (
            <>
              {' — '}
              {ahuOnly ? `${ahus(ahuTotal)} AHU room${ahuTotal === 1 ? '' : 's'}` : area(flatTotal)} across {count} group
              {count === 1 ? '' : 's'}
            </>
          )}
        </span>
      </div>
      {!hasData && (
        <div style={{ padding: 8, fontSize: 13, color: '#999' }}>
          {ahuOnly ? 'No AHU rooms with an area yet.' : emptyText}
        </div>
      )}
      <div ref={boxRef} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {groupTiles.map(({ key, rect, on }) => {
          const g = rect.item
          const c = functionColours(functions, g.functionId)
          // The name heads the box; centred in it, its share of the whole area
          // or its AHU room count. The count is read; the tile is still SIZED by
          // AHU room area.
          const head = rect.w > 44 && rect.h > 18
          const titlePx = titleSize(g.name, rect.w, rect.h)
          const titleLine = Math.max(GROUP_HEAD, Math.round(titlePx * 1.3))
          // What the title takes off the top; the figure has the rest.
          const titleH = head ? TITLE_TOP + titleLine : 0
          const fig = figureSize(rect.w, rect.h - titleH)
          return (
            <div
              key={key}
              // Its area on hover — the tile's own figure is a share, not a size.
              // In the AHU view that area is the AHU rooms', which the tile is sized by.
              onMouseMove={on ? track(`${g.name} · ${area(g.value)}${ahuOnly ? ' of AHU rooms' : ''}`) : undefined}
              onMouseLeave={() => setHover(null)}
              style={{
                position: 'absolute', left: rect.x, top: rect.y, width: Math.max(0, rect.w), height: Math.max(0, rect.h),
                background: c.background, color: c.color, borderRadius: 4, overflow: 'hidden',
                opacity: on ? 1 : 0, pointerEvents: on ? 'auto' : 'none', transition: TWEEN,
              }}
            >
              {head && (
                // A BLOCK, not flex: an ellipsis is never drawn on a flex box's text.
                <div style={{
                  padding: `${TITLE_TOP}px ${TITLE_PAD}px 0`, textAlign: 'center', lineHeight: `${titleLine}px`,
                  fontSize: titlePx, fontWeight: 600, fontFamily: 'sans-serif',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  transition: reducedMotion ? 'none' : 'font-size 450ms ease, line-height 450ms ease',
                }}>
                  {g.name}
                </div>
              )}
              {fig >= 10 && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, top: titleH, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: fig, fontWeight: 600, lineHeight: 1,
                  opacity: 0.9, pointerEvents: 'none', whiteSpace: 'nowrap',
                  transition: reducedMotion ? 'none' : 'font-size 450ms ease, top 450ms ease',
                }}>
                  {ahuOnly ? ahus(g.count) : (
                    <span>
                      {percent(g.value)}
                      {/* A small sign on the baseline: it says what the figure is
                          without costing the width it is scaled to. */}
                      <span style={{ fontSize: '0.3em', marginLeft: '0.08em' }}>%</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {hover && (
          <div
            style={{
              position: 'absolute',
              top: hover.y + 14,
              // Flips left past the middle, or it runs off the pane's right edge.
              ...(hover.x > size.w / 2 ? { right: size.w - hover.x + 10 } : { left: hover.x + 12 }),
              zIndex: 3, pointerEvents: 'none', whiteSpace: 'nowrap',
              padding: '4px 8px', fontSize: 12, background: '#222', color: '#fff', borderRadius: 4,
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            }}
          >
            {hover.label}
          </div>
        )}
      </div>
    </div>
  )
}
