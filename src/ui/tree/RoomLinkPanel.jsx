// The right-hand pane of the Tree tab: the rooms belonging to the department
// placement selected on the canvas, and the objects belonging to each room.
//
// Everything here lives inside sp_section.tree, three and four levels deep, on
// the ONE placement identified by selectedDeptInstanceId. Two placements of the
// same duplicable department have separate room lists, which is the whole point
// of the tree.
//
// EVERY + AND × HERE IS A WRITE. There is no draft and no Save button: the
// catalog is edited by acting on it, exactly as the canvas above it is. Each
// click hands the editor the room list it wants, which writes the section's
// jsonb and records one undo step holding the list as it was.
//
// That is the one place this panel differs from the Project tab's, whose room
// and object edits wait for Save Data because they belong to an option someone
// is composing. The chrome is literally the same (ui/panel/panelParts.jsx).

import { useCatalog } from '../../data/catalog.jsx'
import { findDeptContext, newObjectNode, newRoomNode, resolveNodePlacement } from '../../data/tree.js'
import { functionColours } from '../../data/functions.js'
import { useTreeEditorContext } from './useTreeEditor.jsx'
import { formatPath, ObjectRow, PanelHeading, PanelNote, PanelShell, RoomBlock } from '../panel/panelParts.jsx'
import { SearchAddPicker } from '../primitives/SearchAddPicker.jsx'

export default function RoomLinkPanel({ selectedDeptInstanceId, canEdit }) {
  const { rooms, objects, sections, groups, departments, functions } = useCatalog()
  const editor = useTreeEditorContext()

  const ctx = selectedDeptInstanceId ? findDeptContext(sections, selectedDeptInstanceId) : null
  const stored = ctx?.deptNode.rooms ?? []

  // Each edit is the whole room list, written immediately. `stored` is the
  // catalog's copy, so every action starts from what is actually saved rather
  // than from anything held here.
  const write = (rooms, message) => editor.setDeptRooms(selectedDeptInstanceId, rooms, { message })
  const editRoom = (roomInstanceId, updater, message) =>
    write(
      stored.map((r) => (r.instance_id === roomInstanceId ? updater(r) : r)),
      message
    )

  if (!selectedDeptInstanceId) {
    return <PanelNote pad>Click a department in the tree canvas to manage its rooms.</PanelNote>
  }
  if (!ctx) {
    return <PanelNote pad>This department placement no longer exists.</PanelNote>
  }

  const deptDef = departments.find((d) => d.id === ctx.deptNode.department_def_id)
  const colours = functionColours(functions, deptDef?.function_id)
  const placement = resolveNodePlacement(sections, selectedDeptInstanceId, groups)

  const linkedRooms = stored
    .map((node) => ({ node, def: rooms.find((r) => r.id === node.room_def_id) }))
    .filter((e) => e.def)
  const linkedRoomDefIds = new Set(linkedRooms.map((e) => e.def.id))

  return (
    <PanelShell colours={colours}>
      <PanelHeading
        name={deptDef?.name ?? 'Department'}
        path={formatPath(placement?.sectionName, placement?.groupName)}
      />

      {editor.error && <p style={{ color: 'red', fontSize: 12 }}>{editor.error}</p>}

      {canEdit && (
        <SearchAddPicker
          options={rooms.filter((r) => !linkedRoomDefIds.has(r.id))}
          placeholder="Search rooms..."
          title="Add a room to this department"
          label="Add a room"
          onAdd={(r) => write([...stored, newRoomNode(r.id)], `${r.name} added`)}
        />
      )}

      {linkedRooms.length === 0
        ? !canEdit && <PanelNote>No rooms linked yet</PanelNote>
        : linkedRooms.map(({ node, def }) => {
            const linked = (node.objects || [])
              .map((o) => ({ node: o, def: objects.find((x) => x.id === o.object_def_id) }))
              .filter((e) => e.def)
            const linkedIds = new Set(linked.map((e) => e.def.id))

            return (
              <RoomBlock
                key={node.instance_id}
                colours={functionColours(functions, def.function_id)}
                name={def.name}
                type={def.type}
                canEdit={canEdit}
                onRemove={() =>
                  write(
                    stored.filter((r) => r.instance_id !== node.instance_id),
                    `${def.name} removed`
                  )
                }
              >
                {linked.length === 0
                  ? // For an editor the labelled + below already says it's empty.
                    !canEdit && <PanelNote>No objects linked yet</PanelNote>
                  : linked.map((entry) => (
                      <ObjectRow
                        key={entry.node.instance_id}
                        name={entry.def.name}
                        type={entry.def.type}
                        canEdit={canEdit}
                        onRemove={() =>
                          editRoom(
                            node.instance_id,
                            (r) => ({
                              ...r,
                              objects: r.objects.filter((o) => o.instance_id !== entry.node.instance_id),
                            }),
                            `${entry.def.name} removed`
                          )
                        }
                      />
                    ))}

                {canEdit && (
                  <SearchAddPicker
                    options={objects.filter((o) => !linkedIds.has(o.id))}
                    placeholder="Search objects..."
                    title="Add an object to this room"
                    label="Add an object"
                    size={16}
                    onAdd={(o) =>
                      editRoom(
                        node.instance_id,
                        (r) => ({ ...r, objects: [...(r.objects || []), newObjectNode(o.id)] }),
                        `${o.name} added`
                      )
                    }
                  />
                )}
              </RoomBlock>
            )
          })}
    </PanelShell>
  )
}
