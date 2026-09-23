// The option's area as a treemap: one tile per department GROUP, its
// departments tiled inside it, every tile sized by area. A placeholder: the
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

const GAP = 3
const GROUP_HEAD = 22

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

export default function OptionAnalysis({ departments, buildingFactors }) {
  const { sections, buildings, groups: groupDefs, functions } = useCatalog()
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()
  const boxRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [ahuOnly, setAhuOnly] = useState(false)

  const { groups, total } = useMemo(() => {
    const { perDepartment } = summarize(departments, { sections, buildings, buildingFactors })
    // department placement instance_id -> its group placement
    const groupOf = new Map()
    ;(sections ?? []).forEach((section) => {
      ;(section.tree?.groups ?? []).forEach((g) => {
        ;(g.departments ?? []).forEach((d) => d.instance_id && groupOf.set(d.instance_id, g))
      })
    })

    const deptById = new Map(departments.map((d) => [d.instanceId, d]))
    const byGroup = new Map()
    perDepartment.forEach((summary) => {
      const d = ahuOnly ? { ...summary, areaSqft: ahuAreaSqft(deptById.get(summary.instanceId)) } : summary
      if (!(d.areaSqft > 0)) return
      const g = groupOf.get(d.treeNodeId) ?? null
      const key = g?.instance_id ?? 'none'
      if (!byGroup.has(key)) {
        const def = g ? groupDefs.find((x) => x.id === g.group_def_id) : null
        byGroup.set(key, {
          key,
          name: def?.name ?? (g ? 'Unnamed group' : 'Not in the tree'),
          functionId: def?.function_id ?? null,
          value: 0,
          departments: [],
        })
      }
      const bucket = byGroup.get(key)
      bucket.value += d.areaSqft
      // One tile per phase entry: a department in two phases is two figures.
      bucket.departments.push({ key: d.instanceId, name: d.name, phase: d.phase, value: d.areaSqft })
    })

    const list = [...byGroup.values()].sort((a, b) => b.value - a.value)
    list.forEach((g) => g.departments.sort((a, b) => b.value - a.value))
    return { groups: list, total: list.reduce((s, g) => s + g.value, 0) }
  }, [departments, sections, buildings, buildingFactors, groupDefs, ahuOnly])

  const hasData = groups.length > 0

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const phased = departments.some((d) => (d.phase ?? 1) > 1)
  const area = (sqft) => `${formatArea(toDisplay(sqft))} ${AREA_UNIT}`

  const tiles = squarify(groups, 0, 0, size.w, size.h)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16, boxSizing: 'border-box', gap: 8 }}>
      <div style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Left, not right: the View Space Program button sits top-right. */}
        <Toggle checked={ahuOnly} onChange={setAhuOnly} title="Scale by AHU room area only" />
        <span>Only AHU rooms</span>
        <span style={{ marginLeft: 12 }}>
          {ahuOnly ? 'AHU room area' : 'Area'} by department group
          {hasData && <> — {area(total)} across {groups.length} group{groups.length === 1 ? '' : 's'}</>}
        </span>
      </div>
      {!hasData && (
        <div style={{ padding: 8, fontSize: 13, color: '#999' }}>
          {ahuOnly
            ? 'No AHU rooms with an area in this option.'
            : "Nothing to chart yet — add rooms and areas to this option's departments."}
        </div>
      )}
      <div ref={boxRef} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {tiles.map(({ item: g, x, y, w, h }) => {
          const c = functionColours(functions, g.functionId)
          const iw = w - GAP
          const ih = h - GAP
          const showHead = ih > GROUP_HEAD + 8 && iw > 40
          const inner = showHead ? squarify(g.departments, 0, 0, iw - 2 * GAP, ih - GROUP_HEAD - GAP) : []
          return (
            <div
              key={g.key}
              title={`${g.name}: ${area(g.value)} (${Math.round((g.value / total) * 100)}%)`}
              style={{
                position: 'absolute', left: x, top: y, width: iw, height: ih,
                background: c.background, color: c.color, borderRadius: 4, overflow: 'hidden',
              }}
            >
              {showHead && (
                <div style={{
                  height: GROUP_HEAD, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{g.name}</span>
                  <span style={{ fontWeight: 400, opacity: 0.85 }}>
                    {area(g.value)} · {Math.round((g.value / total) * 100)}%
                  </span>
                </div>
              )}
              {inner.map(({ item: d, x: dx, y: dy, w: dw, h: dh }) => {
                const tw = dw - GAP
                const th = dh - GAP
                const label = phased ? `${d.name} · P${d.phase}` : d.name
                return (
                  <div
                    key={d.key}
                    title={`${label}: ${area(d.value)}`}
                    style={{
                      position: 'absolute', left: GAP + dx, top: GROUP_HEAD + dy, width: tw, height: th,
                      background: c.wash(0.8), color: '#222', borderRadius: 3, overflow: 'hidden',
                      padding: '3px 5px', boxSizing: 'border-box', fontSize: 11, lineHeight: 1.3,
                    }}
                  >
                    {tw > 44 && th > 18 && (
                      <>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{label}</div>
                        {th > 32 && <div style={{ color: '#555' }}>{area(d.value)}</div>}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
