// What's inside a building, a section or a group, read-only.
//
// Side shows one of five things on the Project tab, decided by what you last
// clicked on the canvas: a department (editable, DepartmentBlock), a group, a
// section, a building, or — with nothing selected — the option's totals. This
// file is the middle three: an outline you read, not a form you fill. Editing
// happens on the department, which is one click away on the canvas.
//
// It lists only what is IN the option. The canvas already shows what could be
// added, as ghosts; repeating those here would make the panel a second, worse
// copy of the canvas rather than a summary of the thing you've built.

import { deptNodeIndex, resolveNodePlacement } from '../../data/tree.js'
import { functionColours } from '../../data/functions.js'
import { buildingAreaSqft, departmentAreaSqft } from '../../data/optionData.js'
import { resolveBuildingFactors } from '../../data/factors.js'
import { CountField } from '../panel/panelParts.jsx'
import ResetButton from '../primitives/ResetButton.jsx'
import { PanelNote } from '../panel/panelParts.jsx'
import { formatArea } from '../map/area.js'

// Deliberately NOT a local sum. This file kept its own — objects added up
// across a department's rooms — and it went silently wrong the day area became
// a figure typed on the room and multiplied by its count. Every area in the app
// now comes from the one function, so a building, a section and a group cannot
// report a different total than the HUD does for the same departments.
//
// A container's own total is just its departments added up: a building, a
// section and a group have no area of their own, only what is placed in them.
// Each department is already grossed by its own factor before it gets here.
// Each entry carries the catalog node it is anchored to, because a grossing
// factor may be stated there rather than on the option — see data/factors.js.
// Without it every inherited factor would silently read as 1 here and this
// panel would disagree with the HUD again.
function totalAreaOf(entries) {
  return entries.reduce((sum, e) => sum + departmentAreaSqft(e.dept, e.node, e.building, e.overrides), 0)
}

// A building's own total: its departments, then its FLOOR-area factor once.
// Section and group totals do not get it — it is a fact about a whole building,
// and applying it to a part of one would report a figure nothing adds up to.
function buildingTotalOf(entries, building, overrides) {
  return buildingAreaSqft(totalAreaOf(entries), building, overrides)
}

function summaryOf(entries, area = null) {
  const n = entries.length
  const sqft = area == null ? totalAreaOf(entries) : area
  return `${n} department${n === 1 ? '' : 's'} · ${formatArea(sqft)} sqft`
}

// A group or section heading inside a larger outline, with its own subtotal.
function SubHeading({ name, entries }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: '#555' }}>{name}</div>
      <span style={{ fontSize: 11, color: '#777', whiteSpace: 'nowrap' }}>
        {formatArea(totalAreaOf(entries))} sqft
      </span>
    </div>
  )
}

// A building's two grossing factors, resolved catalog-default-then-override in
// exactly the way a department's are — see data/factors.js.
//
// This is the only editable thing in an otherwise read-only panel, and
// deliberately so: the factors belong to the BUILDING, and a building has no
// other pane. Everything else here is edited one click away on the canvas.
//
// Unlike a room or a department, these persist as soon as the field is left
// rather than waiting for Save Data — that button watches the focused
// department and would never see them.
function BuildingFactors({ building, overrides, onChange }) {
  if (!building || !onChange) return null

  return (
    <div style={{ marginTop: 8 }}>
      {resolveBuildingFactors(building, overrides).map((f) => (
        <div
          key={f.key}
          className="spp-hover-reveal"
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, minWidth: 0, fontSize: 13 }}
        >
          <span style={{ flex: 1, minWidth: 0, color: '#555' }}>{f.label}</span>
          <span
            // Muted and underlined while it is the catalog's answer rather than
            // one given here; typing it IS the override.
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              opacity: f.source === 'inherited' ? 0.6 : 1,
              borderBottom: f.source === 'inherited' ? '1px dashed #bbb' : '1px solid transparent',
            }}
          >
            <CountField
              value={f.value}
              colour="#555"
              min={f.min}
              step={0.05}
              decimals={2}
              prefix="×"
              title={f.describe(building.name)}
              onChange={(value) => onChange(building.id, f, value)}
              // Left the field: write it. See the note above.
              onCommit={(value) => onChange(building.id, f, value, { persist: true })}
            />
          </span>
          {f.source === 'option' && (
            <ResetButton
              onReset={() => onChange(building.id, f, null, { persist: true })}
              title={f.inherited != null ? `Back to the catalog's ${f.inherited}` : 'Back to the catalog'}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function Header({ label, name, colours, right }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 6,
        background: colours.background,
        color: colours.color,
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.8 }}>{label}</span>
      <strong style={{ flex: 1, minWidth: 0, fontSize: 14, overflowWrap: 'anywhere' }}>{name}</strong>
      {right && <span style={{ fontSize: 11, opacity: 0.85, whiteSpace: 'nowrap' }}>{right}</span>}
    </div>
  )
}

// Every count in this panel sits in one right-aligned column of this width —
// a room's and its objects'. They were mixed before: a room's count trailed its
// name inline while its objects' were flung to the row's edge, so nothing lined
// up with anything.
const COUNT_COL = 40

// A count, in that column.
function Count({ value }) {
  return (
    <span
      style={{
        width: COUNT_COL,
        flexShrink: 0,
        textAlign: 'right',
        fontStyle: 'italic',
        whiteSpace: 'nowrap',
      }}
    >
      × {value}
    </span>
  )
}

// One department and everything under it. Rooms are always listed; objects sit
// under their room with their count, since a room's contents are the whole
// reason to look at this panel rather than the canvas.
//
// Departments and rooms are drawn as boxes in a pale wash of their own function
// colour — the same `inverted` palette their cards wear on the canvas and in the
// department pane. An outline of plain text rows gave no clue what any of it
// was for; the colour is the fastest thing to read here and it was the one thing
// this panel threw away.
function DepartmentEntry({
  dept,
  node = null,
  building = null,
  overrides = null,
  phaseCount = 1,
  functions,
  departmentDefs = [],
  roomDefs = [],
}) {
  const rooms = dept.rooms ?? []
  const colours = functionColours(functions, departmentDefs.find((d) => d.id === dept.defId)?.function_id)

  return (
    <div
      style={{
        marginTop: 8,
        padding: 8,
        borderRadius: 6,
        minWidth: 0,
        background: colours.inverted.background,
        border: `1px solid ${colours.inverted.border}`,
        color: colours.inverted.color,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>
          {dept.name}
        </span>
        {/* One department staged in several phases is several rows here, each
            with its own rooms. Without this they are indistinguishable. */}
        {phaseCount > 1 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#777',
              background: '#f0f0f0',
              borderRadius: 3,
              padding: '1px 4px',
              whiteSpace: 'nowrap',
            }}
          >
            P{dept.phase}
          </span>
        )}
        <span style={{ fontSize: 11, opacity: 0.8, whiteSpace: 'nowrap' }}>
          {formatArea(departmentAreaSqft(dept, node, building, overrides))} sqft
        </span>
      </div>

      {rooms.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>No rooms yet</div>
      ) : (
        rooms.map((room) => {
          const roomColours = functionColours(
            functions,
            roomDefs.find((d) => d.id === room.defId)?.function_id
          )
          return (
            <div
              key={room.instanceId}
              style={{
                marginTop: 6,
                padding: '3px 6px',
                borderRadius: 4,
                minWidth: 0,
                background: roomColours.inverted.background,
                border: `1px solid ${roomColours.inverted.border}`,
                color: roomColours.inverted.color,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, minWidth: 0 }}>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{room.name}</span>
                {/* Silent at one, which is what most rooms are — a "× 1" on
                    every line would be noise on the common case. The column is
                    still reserved, so the objects below stay aligned. */}
                {(room.count ?? 1) > 1 ? <Count value={room.count} /> : <span style={{ width: COUNT_COL, flexShrink: 0 }} />}
              </div>

              {(room.objects ?? []).length === 0 ? (
                <div style={{ fontSize: 11, opacity: 0.5, paddingLeft: 10 }}>No objects</div>
              ) : (
                room.objects.map((obj) => (
                  <div
                    key={obj.instanceId}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      paddingLeft: 10,
                      fontSize: 11,
                      opacity: 0.75,
                      minWidth: 0,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{obj.name}</span>
                    <Count value={obj.count} />
                  </div>
                ))
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

export default function OptionOutline({
  selection,
  departments,
  sections,
  groupDefs,
  buildingDefs = [],
  sectionIds = [],
  functions,
  departmentDefs = [],
  roomDefs = [],
  buildingFactors = {},
  onBuildingFactorChange,
  phaseCount = 1,
}) {
  // Where each department sits, resolved live from the tree rather than from
  // anything frozen in the option — moving a department on the Tree tab moves
  // it here too.
  //
  // Sorted by phase within a name, so the several phases of one department read
  // as one run down the list rather than scattered through it.
  const catalogNodes = deptNodeIndex(sections)
  const placed = departments
    .map((d) => {
      const placedNode = catalogNodes.get(d.treeNodeId) ?? null
      const buildingId = placedNode?.buildingId ?? null
      return {
        dept: d,
        node: placedNode?.node ?? null,
        // Carried per entry so every total here grosses exactly as the HUD
        // does — see data/factors.js.
        building: buildingDefs.find((b) => b.id === buildingId) ?? null,
        overrides: buildingFactors[buildingId] ?? null,
        at: resolveNodePlacement(sections, d.treeNodeId, groupDefs, buildingDefs),
      }
    })
    .sort((a, b) => a.dept.phase - b.dept.phase)

  // A building: the sections of it that are in the option, each with what it
  // holds. Sections are listed even when empty — an empty section is a real
  // state here, so leaving it out would make the panel disagree with the canvas.
  if (selection.kind === 'building') {
    const building = buildingDefs.find((b) => b.id === selection.id)
    const inBuilding = placed.filter((p) => p.at?.buildingId === selection.id)
    const ownSections = sections
      .filter((s) => s.building_id === selection.id && sectionIds.includes(s.id))
      .sort((a, b) => a.name.localeCompare(b.name))

    return (
      <div style={{ minWidth: 0 }}>
        <Header
          label="Building"
          name={building?.name ?? selection.name ?? 'Building'}
          colours={functionColours(functions, building?.function_id)}
          // The building's floor-area factor lands here and nowhere else.
          right={summaryOf(inBuilding, buildingTotalOf(inBuilding, building, buildingFactors[selection.id]))}
        />
        <BuildingFactors
          building={building}
          overrides={buildingFactors[selection.id]}
          onChange={onBuildingFactorChange}
        />
        {ownSections.length === 0 ? (
          <PanelNote>No sections of this building are in the option yet. Add one on the canvas.</PanelNote>
        ) : (
          ownSections.map((section) => {
            const depts = inBuilding.filter((p) => p.at.sectionId === section.id)
            return (
              <div key={section.id} style={{ marginTop: 12, minWidth: 0 }}>
                <SubHeading name={section.name} entries={depts} />
                {depts.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>Empty</div>
                ) : (
                  depts.map(({ dept, node, building: b, overrides }) => <DepartmentEntry
                      key={dept.instanceId}
                      dept={dept}
                      node={node}
                      building={b}
                      overrides={overrides}
                      phaseCount={phaseCount}
                      functions={functions}
                      departmentDefs={departmentDefs}
                      roomDefs={roomDefs}
                    />)
                )}
              </div>
            )
          })
        )}
      </div>
    )
  }

  if (selection.kind === 'group') {
    const inGroup = placed.filter((p) => p.at?.groupInstanceId === selection.id)
    const at = inGroup[0]?.at
    const group = groupDefs.find((g) => g.id === at?.groupDefId)

    return (
      <div style={{ minWidth: 0 }}>
        <Header
          label="Group"
          name={group?.name ?? selection.name ?? 'Group'}
          colours={functionColours(functions, group?.function_id)}
          right={summaryOf(inGroup)}
        />
        {inGroup.length === 0 ? (
          <PanelNote>Nothing from this group is in the option yet. Add a department on the canvas.</PanelNote>
        ) : (
          inGroup.map(({ dept, node, building: b, overrides }) => <DepartmentEntry
                      key={dept.instanceId}
                      dept={dept}
                      node={node}
                      building={b}
                      overrides={overrides}
                      phaseCount={phaseCount}
                      functions={functions}
                      departmentDefs={departmentDefs}
                      roomDefs={roomDefs}
                    />)
        )}
      </div>
    )
  }

  // A section: its groups, each with the departments under it. Group order
  // follows the section's tree, so it matches the canvas.
  const section = sections.find((s) => s.id === selection.id)
  const inSection = placed.filter((p) => p.at?.sectionId === selection.id)
  const groupNodes = (section?.tree?.groups ?? []).filter((g) =>
    inSection.some((p) => p.at.groupInstanceId === g.instance_id)
  )

  return (
    <div style={{ minWidth: 0 }}>
      <Header
        label="Section"
        name={section?.name ?? 'Section'}
        colours={functionColours(functions, section?.function_id)}
        right={summaryOf(inSection)}
      />
      {groupNodes.length === 0 ? (
        <PanelNote>This section is empty. Add a department on the canvas.</PanelNote>
      ) : (
        groupNodes.map((groupNode) => {
          const def = groupDefs.find((g) => g.id === groupNode.group_def_id)
          const depts = inSection.filter((p) => p.at.groupInstanceId === groupNode.instance_id)
          return (
            <div key={groupNode.instance_id} style={{ marginTop: 12, minWidth: 0 }}>
              <SubHeading name={def?.name ?? 'Group'} entries={depts} />
              {depts.map(({ dept, node, building: b, overrides }) => (
                <DepartmentEntry
                      key={dept.instanceId}
                      dept={dept}
                      node={node}
                      building={b}
                      overrides={overrides}
                      phaseCount={phaseCount}
                      functions={functions}
                      departmentDefs={departmentDefs}
                      roomDefs={roomDefs}
                    />
              ))}
            </div>
          )
        })
      )}
    </div>
  )
}
