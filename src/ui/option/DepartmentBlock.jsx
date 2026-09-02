// The detail pane for one department in the open option: its rooms, the objects
// in each room, and their counts.
//
// The chrome is shared with the Tree tab's rooms panel — see
// ui/panel/panelParts.jsx. The two panels draw the same thing and only differ in
// what they edit, so anything visual belongs there, not here. What stays here:
//
//   * the option's own data shape (in-memory rooms, with names and areas
//     already resolved, unlike the Tree's raw catalog nodes)
//   * areas — the catalog stores none, so only this panel has a figure to show
//   * the restriction that the room and object lists offered are the ones this
//     department's anchored catalog node allows, not everything the definition
//     tables hold. That distinction is the point of the tree; see data/tree.js.
//   * the confirmation before dropping a room that has objects in it

import { useState } from 'react'
import { catalogObjectsForRoom, catalogRoomsForNode, resolveNodePlacement } from '../../data/tree.js'
import { DEFAULT_OBJECT_COUNT } from '../../data/optionData.js'
import { functionColours } from '../../data/functions.js'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import { SearchAddPicker } from '../primitives/SearchAddPicker.jsx'
import { formatPath, ObjectRow, PanelHeading, PanelNote, PanelShell, RoomBlock } from '../panel/panelParts.jsx'

export default function DepartmentBlock({
  dept,
  roomDefs,
  sections,
  groupDefs,
  objectDefs,
  functions,
  departmentFunctionId,
  onAddRoom,
  onRoomChange,
  onSelectDepartment,
}) {
  const [confirmTarget, setConfirmTarget] = useState(null)

  // This placement's own allowed rooms. Null when the tree node is gone, which
  // the filters treat as unrestricted rather than as "nothing allowed".
  const colours = functionColours(functions, departmentFunctionId)
  const catalogRooms = catalogRoomsForNode(sections, dept.treeNodeId)
  const placement = resolveNodePlacement(sections, dept.treeNodeId, groupDefs)
  const sectionName = placement?.sectionName ?? dept.fallbackSectionName
  const groupName = placement?.groupName ?? dept.fallbackGroupName

  // Counts live only here: the catalog says an object may be in this room, this
  // option says how many.
  function addObjectToRoom(roomInstanceId, def) {
    onRoomChange(roomInstanceId, (room) => {
      if (room.objects.some((o) => o.defId === def.id)) return room
      return {
        ...room,
        objects: [
          ...room.objects,
          {
            instanceId: crypto.randomUUID(),
            defId: def.id,
            name: def.name,
            type: def.type,
            areaSqft: def.area_sqft,
            count: DEFAULT_OBJECT_COUNT,
          },
        ],
      }
    })
  }

  return (
    <PanelShell colours={colours}>
      <div
        style={{ cursor: onSelectDepartment ? 'pointer' : 'default', minWidth: 0 }}
        onClick={() => onSelectDepartment?.(dept.defId, dept.treeNodeId)}
      >
        <PanelHeading
          name={`${dept.name}${dept.type ? ` (${dept.type})` : ''}`}
          path={formatPath(sectionName, groupName)}
          note={!placement ? '(no longer in the tree)' : null}
        />
      </div>

      <SearchAddPicker
        options={roomDefs.filter((def) => {
          if (dept.rooms.some((r) => r.defId === def.id)) return false
          if (!catalogRooms || catalogRooms.length === 0) return true
          return catalogRooms.some((r) => r.room_def_id === def.id)
        })}
        placeholder="Search rooms..."
        title="Add a room to this department"
        label="Add a room"
        onAdd={onAddRoom}
      />

      {dept.rooms.length === 0 && <PanelNote>No rooms yet</PanelNote>}

      {dept.rooms.map((room) => {
        // This room's own catalog node list, not a union across every room
        // sharing its definition. Null or empty means the anchor couldn't be
        // resolved, or the catalog places no restriction — either way, fall
        // open rather than offering nothing.
        const catalogObjects = catalogObjectsForRoom(catalogRooms, room.treeRoomNodeId)

        return (
          <RoomBlock
            key={room.instanceId}
            colours={functionColours(functions, roomDefs.find((d) => d.id === room.defId)?.function_id)}
            name={room.name}
            type={room.type}
            onRemove={() =>
              setConfirmTarget({
                roomInstanceId: room.instanceId,
                roomName: room.name,
                objectCount: room.objects.reduce((s, o) => s + o.count, 0),
              })
            }
          >
            {room.objects.map((obj) => (
              <ObjectRow
                key={obj.instanceId}
                name={obj.name}
                type={obj.type}
                count={obj.count}
                // Only this panel has areas to show — the catalog stores none.
                area={obj.areaSqft != null ? obj.areaSqft * obj.count : null}
                onCountChange={(count) =>
                  onRoomChange(
                    room.instanceId,
                    (r) => ({
                      ...r,
                      objects: r.objects.map((o) => (o.instanceId === obj.instanceId ? { ...o, count } : o)),
                    }),
                    // Typing a number is one undo step, however many keystrokes.
                    { coalesce: `count:${obj.instanceId}` }
                  )
                }
                onRemove={() =>
                  onRoomChange(room.instanceId, (r) => ({
                    ...r,
                    objects: r.objects.filter((o) => o.instanceId !== obj.instanceId),
                  }))
                }
              />
            ))}

            <SearchAddPicker
              options={objectDefs.filter((def) => {
                if (room.objects.some((o) => o.defId === def.id)) return false
                if (!catalogObjects || catalogObjects.length === 0) return true
                return catalogObjects.some((o) => o.object_def_id === def.id)
              })}
              placeholder="Search objects..."
              title="Add an object to this room"
              label="Add an object"
              size={16}
              onAdd={(def) => addObjectToRoom(room.instanceId, def)}
            />
          </RoomBlock>
        )
      })}

      {confirmTarget && (
        <ConfirmModal
          title="Remove room?"
          onConfirm={() => {
            onRoomChange(confirmTarget.roomInstanceId, null)
            setConfirmTarget(null)
          }}
          onCancel={() => setConfirmTarget(null)}
        >
          Remove "{confirmTarget.roomName}" and its {confirmTarget.objectCount} object
          {confirmTarget.objectCount === 1 ? '' : 's'}? You can undo this after.
        </ConfirmModal>
      )}
    </PanelShell>
  )
}
