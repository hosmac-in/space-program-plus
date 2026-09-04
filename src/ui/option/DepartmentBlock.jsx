// The detail pane for one department in the open option: its rooms, the objects
// in each room, and their counts.
//
// The chrome is shared with the Tree tab's rooms panel — see
// ui/panel/panelParts.jsx. The two panels draw the same thing and only differ in
// what they edit, so anything visual belongs there, not here. What stays here:
//
//   * the option's own data shape (in-memory rooms, with names and areas
//     already resolved, unlike the Tree's raw catalog nodes)
//   * a room's `count`, which exists only here — the catalog states how a room
//     is composed, never how many of it a program has. See data/tree.js.
//   * the restriction that the room and object lists offered are the ones this
//     department's anchored catalog node allows, not everything the definition
//     tables hold. That distinction is the point of the tree; see data/tree.js.
//   * the confirmation before dropping a room that has objects in it

import { useState } from 'react'
import {
  catalogRoomDimensions,
  catalogRoomNode,
  catalogRoomNotes,
  catalogRoomsForNode,
  findDeptContext,
  resolveNodePlacement,
} from '../../data/tree.js'
import {
  circulationSqft,
  DEFAULT_OBJECT_COUNT,
  departmentAreaSqft,
  departmentBuiltAreaSqft,
  departmentNetAreaSqft,
  findCirculationDef,
} from '../../data/optionData.js'
import { resolveFactors, withFactor } from '../../data/factors.js'
import ResetButton from '../primitives/ResetButton.jsx'
import { formatArea } from '../map/area.js'
import { functionColours } from '../../data/functions.js'
import { resolveRoomSchedules, roomWithSchedule } from '../../data/schedules.js'
import {
  HVAC_GROUP,
  LOADS_GROUP,
  ROOM_HVAC,
  ROOM_LOADS,
  resolveRoomFields,
  roomWithField,
} from '../../data/roomEnergy.js'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import { SearchAddPicker } from '../primitives/SearchAddPicker.jsx'
import {
  CountField,
  formatPath,
  ObjectRow,
  PanelHeading,
  PanelNote,
  PanelShell,
  CatalogNote,
  RoomBlock,
  RoomBrief,
  RoomNotes,
} from '../panel/panelParts.jsx'
import RoomEnergyStrip, { SCHEDULES_GROUP } from '../panel/RoomEnergyStrip.jsx'

export default function DepartmentBlock({
  dept,
  roomDefs,
  sections,
  groupDefs,
  objectDefs,
  functions,
  schedules = [],
  departmentFunctionId,
  buildingDefs = [],
  // This option's per-building overrides. The BUILDING's built-area factor
  // grosses every department in it, so this pane cannot state an area without
  // them — see data/factors.js.
  buildingFactors = {},
  phaseCount = 1,
  onAddRoom,
  onRoomChange,
  // Edits the department entry itself rather than one of its rooms — currently
  // just the occupancy multiplier. Same in-memory-until-Save-Data contract as
  // onRoomChange.
  onDeptChange,
  onSelectDepartment,
}) {
  const [confirmTarget, setConfirmTarget] = useState(null)

  // This placement's own allowed rooms. Null when the tree node is gone, which
  // the filters treat as unrestricted rather than as "nothing allowed".
  const colours = functionColours(functions, departmentFunctionId)
  const catalogRooms = catalogRoomsForNode(sections, dept.treeNodeId)
  // The sp_object row circulation is drawn as. Null until that row exists, in
  // which case the line is simply not shown — the areas are still right, there
  // is just nothing to call the leftover.
  const circulationDef = findCirculationDef(objectDefs)
  // The catalog node this entry is anchored to: where the factors' defaults are
  // stated, and what an unoverridden department is showing you.
  const catalogDeptNode = findDeptContext(sections, dept.treeNodeId)?.deptNode ?? null
  const placement = resolveNodePlacement(sections, dept.treeNodeId, groupDefs, buildingDefs)
  // The building this department sits in, and this option's overrides for it:
  // the built-area factor between the net rooms and the department's own
  // grossing. The floor-area factor is NOT applied here — it belongs to the
  // building's own total, once, see data/optionData.js.
  const buildingRow = buildingDefs.find((b) => b.id === placement?.buildingId) ?? null
  const buildingOverrides = placement?.buildingId ? (buildingFactors[placement.buildingId] ?? null) : null
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
        onClick={() => onSelectDepartment?.(dept.defId, dept.treeNodeId, dept.phase)}
      >
        <PanelHeading
          name={`${dept.name}${dept.type ? ` (${dept.type})` : ''}`}
          // No building: the line above this panel already names the section,
          // and the building is the one step of the path that never changes
          // while you work inside one.
          path={formatPath(sectionName, groupName)}
          note={!placement ? '(no longer in the tree)' : null}
          // What the whole department comes to: every room's area times how
          // many of it, grossed up. The same figure the HUD and the canvas card
          // show, from the same function — see departmentAreaSqft.
          // Two figures, stacked and right-aligned: what the department comes
          // to, and — quieter, beneath it — what its rooms came to before
          // grossing. Together they read as one number and its origin rather
          // than as two totals somewhere apart from each other.
          right={
            <div style={{ flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {/* The chain, largest first: what the department comes to, what
                  its rooms occupy once the building's built-area factor is
                  applied, and the rooms as entered. Each line is the one below
                  it times a factor shown underneath — see data/optionData.js.

                  Only the top one is unlabelled: it is the department's area,
                  full stop. Two bare figures under it would leave the reader
                  guessing which was which. */}
              <div
                title="Built area × the department's grossing factor"
                style={{ fontSize: 15, fontStyle: 'italic', color: '#555' }}
              >
                {formatArea(departmentAreaSqft(dept, catalogDeptNode, buildingRow, buildingOverrides))} sqft
              </div>
              <div
                title="Net area × the building's built-area grossing factor"
                style={{ fontSize: 11, fontStyle: 'italic', color: '#999' }}
              >
                <span style={{ fontStyle: 'normal' }}>built area </span>
                {formatArea(departmentBuiltAreaSqft(dept, buildingRow, buildingOverrides))} sqft
              </div>
              <div title="The rooms alone, before any grossing" style={{ fontSize: 11, fontStyle: 'italic', color: '#999' }}>
                <span style={{ fontStyle: 'normal' }}>net area </span>
                {formatArea(departmentNetAreaSqft(dept))} sqft
              </div>
            </div>
          }
        />
      </div>

      {/* Which phase this pane is editing, stated rather than chosen.

          It used to be a <select>, when a department had one phase and its
          rooms were that phase's rooms. Now each phase of a department is its
          own entry with its own rooms, so the phase is not a property to change
          here — it is which strip on the card you clicked. Changing it would
          mean moving these rooms to a phase that may already have its own.

          Silent on a one-phase option, where there is nothing to distinguish. */}
      {phaseCount > 1 && (
        <div style={{ margin: '10px 0', fontSize: 12, color: '#777' }}>
          Phase {dept.phase} of {phaseCount}
        </div>
      )}

      {/* The two factors this department is scaled by, each resolved
          catalog-default-then-option-override exactly as a room's schedules are
          — see data/factors.js.

          Always shown, unlike a schedule: a factor is never unset, there is
          always a number in force, and a plain 1.00 at a glance is how you know
          nobody has said anything special. What varies is WHERE it came from,
          which is what the muted/underlined treatment reports. */}
      {resolveFactors(catalogDeptNode, dept).map((f) => {
        const inherited = f.source === 'inherited'
        return (
          <div
            key={f.key}
            // spp-hover-reveal: the reset appears only while the row is
            // hovered — see ResetButton.
            className="spp-hover-reveal"
            style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0', minWidth: 0, fontSize: 13 }}
            // The heading above navigates on click; these are controls inside
            // it and must not also select the department.
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ color: '#555', minWidth: 0 }}>{f.label}</span>
            <span
              // Dashed and muted while it is the catalog's answer rather than
              // one given here. Typing overrides it; there is no separate
              // "override" action, because changing the number IS the override.
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                opacity: inherited ? 0.6 : 1,
                borderBottom: inherited ? '1px dashed #bbb' : '1px solid transparent',
              }}
            >
              <CountField
                value={f.value}
                colour="#555"
                min={f.min}
                step={0.05}
                decimals={2}
                prefix="×"
                title={f.describe(dept.name)}
                onChange={(value) =>
                  onDeptChange?.(dept.instanceId, (d) => withFactor(d, f, value), {
                    coalesce: `${f.key}:${dept.instanceId}`,
                  })
                }
              />
            </span>

            {/* Reverts to the catalog's default, not to 1 — clearing an
                override removes it rather than writing a value. The only mark
                an overridden factor carries: the number itself is the thing
                being read, and a label saying it was typed here says nothing a
                person who typed it does not know. */}
            {f.source === 'option' && (
              <ResetButton
                onReset={() => onDeptChange?.(dept.instanceId, (d) => withFactor(d, f, null))}
                title={
                  f.inherited != null
                    ? `Back to the catalog's ${f.inherited}`
                    : 'Back to the catalog, which states none'
                }
              />
            )}
          </div>
        )
      })}

      {dept.rooms.length === 0 && <PanelNote>No rooms yet</PanelNote>}

      {dept.rooms.map((room) => {
        // This room's own catalog node: what restricts its object picker, and
        // what its schedules are inherited from.
        const catalogRoom = catalogRoomNode(catalogRooms, room.treeRoomNodeId)
        const catalogObjects = catalogRoom?.objects ?? null
        // Once per room: the block wears it and the schedule band is painted a
        // pale wash of it.
        const roomColours = functionColours(functions, roomDefs.find((d) => d.id === room.defId)?.function_id)

        return (
          <RoomBlock
            key={room.instanceId}
            colours={roomColours}
            name={room.name}
            type={room.type}
            count={room.count}
            areaSqft={room.areaSqft ?? 0}
            onAreaChange={(areaSqft) =>
              onRoomChange(room.instanceId, (r) => ({ ...r, areaSqft }), {
                coalesce: `roomArea:${room.instanceId}`,
              })
            }
            onCountChange={(count) =>
              onRoomChange(
                room.instanceId,
                (r) => ({ ...r, count }),
                // Typing a number is one undo step, however many keystrokes —
                // the same treatment an object's count gets.
                { coalesce: `roomCount:${room.instanceId}` }
              )
            }
            onRemove={() =>
              setConfirmTarget({
                roomInstanceId: room.instanceId,
                roomName: room.name,
                objectCount: room.objects.reduce((s, o) => s + o.count, 0),
              })
            }
          >
            {/* What the catalog says about this room's energy, and this
                option's overrides of it.

                Schedules take no `coalesce`: picking from a list is one step
                already. Fields do, like a count — they report every keystroke so
                Save Data answers while you type, and the whole number is still
                one undo step. Neither persists: like every other room edit here,
                they wait for Save Data.

                Clearing or resetting removes the override, handing the value
                back to whatever the catalog says — it does not set the room to
                zero, or to "no schedule". See data/optionData.js. */}
            <RoomEnergyStrip
              scheduleRows={resolveRoomSchedules(catalogRoom, room.schedules)}
              fieldRows={{
                [LOADS_GROUP]: resolveRoomFields(ROOM_LOADS, LOADS_GROUP, catalogRoom, room),
                [HVAC_GROUP]: resolveRoomFields(ROOM_HVAC, HVAC_GROUP, catalogRoom, room),
              }}
              schedules={schedules}
              colours={roomColours}
              roomName={room.name}
              onFieldChange={(field, group, value) =>
                onRoomChange(
                  room.instanceId,
                  (r) =>
                    group === SCHEDULES_GROUP
                      ? roomWithSchedule(r, field.key, value)
                      : roomWithField(r, field, group, value),
                  { coalesce: `${group}:${field.key}:${room.instanceId}` }
                )
              }
              onFieldReset={(field, group) =>
                onRoomChange(room.instanceId, (r) =>
                  group === SCHEDULES_GROUP
                    ? roomWithSchedule(r, field.key, null)
                    : roomWithField(r, field, group, null)
                )
              }
            />

            {/* What the catalog says about this room, directly above its object
                list: the size it is usually built to, then the General Note.
                Both read-only — there is nothing to override, they are simply
                what the catalog says, read live. */}
            <RoomBrief {...catalogRoomDimensions(catalogRoom)}>
              {catalogRoomNotes(catalogRoom) && (
                <CatalogNote label="General Note:">{catalogRoomNotes(catalogRoom)}</CatalogNote>
              )}
            </RoomBrief>

            {room.objects.map((obj) => (
              <ObjectRow
                key={obj.instanceId}
                name={obj.name}
                type={obj.type}
                count={obj.count}
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

            {/* Not an object, drawn as one: what the room's area leaves over
                once its objects are taken out. Derived on every render from the
                two figures above it — storing it would let it disagree with
                them — and red when it goes negative, which means the objects do
                not fit in the area entered. */}
            {circulationDef &&
              (() => {
                const circulation = circulationSqft(room, circulationDef.id)
                return (
                  <ObjectRow
                    // Named by the sp_object row, not by this file.
                    name={circulationDef.name}
                    area={circulation}
                    canEdit={false}
                    tone={circulation < 0 ? 'warn' : 'muted'}
                  />
                )
              })()}

            <SearchAddPicker
              options={objectDefs.filter((def) => {
                // Circulation is what the room has left over, not something you
                // put in it — it is already on the row above, derived.
                if (circulationDef && def.id === circulationDef.id) return false
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

            {/* This option's OWN note — a second note, not an override of the
                catalog's General Note above. Reported on every keystroke and
                coalesced, so Save Data lights up as you type and the whole note
                is still one undo step. */}
            <RoomNotes
              note={room.notes ?? ''}
              canEdit
              onChange={(notes) =>
                onRoomChange(room.instanceId, (r) => ({ ...r, notes }), {
                  coalesce: `notes:${room.instanceId}`,
                })
              }
            />
          </RoomBlock>
        )
      })}

      {/* Below the rooms, not above them: the list is what the pane is for, and
          the picker is what you reach for after reading it — the same order an
          object's picker already sits in inside each room. */}
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
