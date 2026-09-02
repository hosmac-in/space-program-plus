// What's inside a group or a section, read-only.
//
// Side shows one of four things on the Project tab, decided by what you last
// clicked on the canvas: a department (editable, DepartmentBlock), a group,
// a section, or — with nothing selected — the option's totals. This file is the
// middle two: an outline you read, not a form you fill. Editing happens on the
// department, which is one click away on the canvas.
//
// It lists only what is IN the option. The canvas already shows what could be
// added, as ghosts; repeating those here would make the panel a second, worse
// copy of the canvas rather than a summary of the thing you've built.

import { resolveNodePlacement } from '../../data/tree.js'
import { functionColours } from '../../data/functions.js'
import { PanelNote } from '../panel/panelParts.jsx'
import { formatArea } from '../map/area.js'

function areaOf(dept) {
  return (dept.rooms ?? []).reduce(
    (sum, r) => sum + (r.objects ?? []).reduce((s, o) => s + o.count * (o.areaSqft ?? 0), 0),
    0
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

// One department and everything under it. Rooms are always listed; objects sit
// under their room with their count, since a room's contents are the whole
// reason to look at this panel rather than the canvas.
function DepartmentEntry({ dept }) {
  const rooms = dept.rooms ?? []

  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid #eee', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>
          {dept.name}
        </span>
        <span style={{ fontSize: 11, color: '#777', whiteSpace: 'nowrap' }}>{formatArea(areaOf(dept))} sqft</span>
      </div>

      {rooms.length === 0 ? (
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>No rooms yet</div>
      ) : (
        rooms.map((room) => (
          <div key={room.instanceId} style={{ marginTop: 6, paddingLeft: 10, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#444' }}>{room.name}</div>
            {(room.objects ?? []).length === 0 ? (
              <div style={{ fontSize: 11, color: '#bbb', paddingLeft: 10 }}>No objects</div>
            ) : (
              room.objects.map((obj) => (
                <div
                  key={obj.instanceId}
                  style={{
                    display: 'flex',
                    gap: 8,
                    paddingLeft: 10,
                    fontSize: 11,
                    color: '#777',
                    minWidth: 0,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{obj.name}</span>
                  <span style={{ whiteSpace: 'nowrap' }}>× {obj.count}</span>
                </div>
              ))
            )}
          </div>
        ))
      )}
    </div>
  )
}

export default function OptionOutline({ selection, departments, sections, groupDefs, functions }) {
  // Where each department sits, resolved live from the tree rather than from
  // anything frozen in the option — moving a department on the Tree tab moves
  // it here too.
  const placed = departments.map((d) => ({ dept: d, at: resolveNodePlacement(sections, d.treeNodeId, groupDefs) }))

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
          right={`${inGroup.length} department${inGroup.length === 1 ? '' : 's'}`}
        />
        {inGroup.length === 0 ? (
          <PanelNote>Nothing from this group is in the option yet. Add a department on the canvas.</PanelNote>
        ) : (
          inGroup.map(({ dept }) => <DepartmentEntry key={dept.instanceId} dept={dept} />)
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
        right={`${inSection.length} department${inSection.length === 1 ? '' : 's'}`}
      />
      {groupNodes.length === 0 ? (
        <PanelNote>This section is empty. Add a department on the canvas.</PanelNote>
      ) : (
        groupNodes.map((groupNode) => {
          const def = groupDefs.find((g) => g.id === groupNode.group_def_id)
          const depts = inSection.filter((p) => p.at.groupInstanceId === groupNode.instance_id)
          return (
            <div key={groupNode.instance_id} style={{ marginTop: 12, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>{def?.name ?? 'Group'}</div>
              {depts.map(({ dept }) => (
                <DepartmentEntry key={dept.instanceId} dept={dept} />
              ))}
            </div>
          )
        })
      )}
    </div>
  )
}
