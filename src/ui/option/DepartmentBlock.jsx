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
import { useAnnotations } from './annotations.jsx'
import { useReadOnly } from '../../readOnly.jsx'
import {
  catalogRoomDimensions,
  catalogRoomLabel,
  catalogRoomNode,
  catalogRoomNotes,
  catalogRoomsForNode,
  findDeptContext,
  resolveNodePlacement,
  resolveRoomLabel,
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
import StripBand from '../panel/StripBand.jsx'
import { SearchAddPicker } from '../primitives/SearchAddPicker.jsx'
import { useReorderList } from '../primitives/useReorderList.js'
import {
  CountField,
  ObjectRow,
  PanelHeading,
  PanelNote,
  PanelShell,
  CatalogNote,
  formatPath,
  RoomAddRow,
  RoomAreaRow,
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

  // Whatever a second app wants to say about this department and its rooms.
  // Null in the editor, which is the ordinary case — see ./annotations.jsx.
  const annotations = useAnnotations()
  // A viewer, or an app that exists to read: no ×, no picker, no typing. An
  // annotation is not affected — it does not write to the database and is the
  // one thing such an app is for. See src/readOnly.jsx.
  const readOnly = useReadOnly()

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

  // What the whole department comes to — the headline figure the heading, the
  // canvas card and the HUD all show, from the one function.
  const deptArea = departmentAreaSqft(dept, catalogDeptNode, buildingRow, buildingOverrides)
  // Where anything in this pane sits, as one line: the department's own path,
  // and a room's is that plus its name. One builder, so the two cannot drift.
  // Handed to annotations, which may want to freeze it somewhere — see
  // sp_questionnaire's `*_path` for the same idea.
  const pathTo = (...tail) =>
    formatPath(placement?.buildingName, placement?.sectionName, placement?.groupName, dept.name, ...tail)

  // DRAG A ROOM UP OR DOWN THE LIST. The array's order is what this panel, the
  // canvas card and every outline draw, so arranging it is the whole edit —
  // there is no sort key on a room and nothing else has to be touched.
  //
  // A department-level change rather than a room-level one: it is the list that
  // moved, not anything in a room. `draftOf` stringifies the whole rooms array,
  // so Save Data notices without being told. No coalesce — one drop is one step.
  const roomOrder = useReorderList({
    items: dept.rooms,
    keyOf: (room) => room.instanceId,
    enabled: !readOnly,
    onCommit: (rooms) => onDeptChange?.(dept.instanceId, (d) => ({ ...d, rooms })),
  })

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
          // NO PATH. The sticky heading above this panel carries it in full and
          // is on screen at every scroll position, so repeating it here cost the
          // card a line to say something already said two lines up. The note
          // stays: a placement the catalog has lost is about this department,
          // not about where you are.
          note={!placement ? '(no longer in the tree)' : null}
          // Held open even where nothing fills it, so the area figures sit in
          // the same column in both apps — see PanelHeading.
          reserveControl
          control={annotations?.department?.(dept, deptArea, pathTo())}
          // What the whole department comes to: every room's area times how
          // many of it, grossed up. The same figure the HUD and the canvas card
          // show, from the same function — see departmentAreaSqft.
          // Three figures, stacked and right-aligned: what the department comes
          // to, and — quieter, beneath it — the two stages it was grossed up
          // from. Together they read as one number and its origin rather than as
          // totals somewhere apart from each other.
          right={
            <div style={{ flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {/* The chain, largest first: what the department comes to, what
                  its rooms occupy once the building's built-area factor is
                  applied, and the rooms as entered. Each line is the one below
                  it times a factor shown underneath — see data/optionData.js.

                  All three are ONE SIZE and all three are labelled. The top line
                  used to be larger and bare, which said "these two are footnotes
                  to it" twice over — but they are the same figure at three
                  stages, and a reader comparing them was comparing type sizes.
                  Colour alone now carries which one is the answer, plus a gap
                  under it so the two stages read as its derivation rather than
                  as three equal lines. */}
              <div
                title="Built area × the department's grossing factor"
                style={{ fontSize: 13, fontStyle: 'italic', color: '#555', marginBottom: 4 }}
              >
                <span style={{ fontStyle: 'normal' }}>department area </span>
                {formatArea(deptArea)} sqft
              </div>
              <div
                title="Net area × the building's built-area grossing factor"
                style={{ fontSize: 13, fontStyle: 'italic', color: '#999' }}
              >
                <span style={{ fontStyle: 'normal' }}>built area </span>
                {formatArea(departmentBuiltAreaSqft(dept, buildingRow, buildingOverrides))} sqft
              </div>
              <div title="The rooms alone, before any grossing" style={{ fontSize: 13, fontStyle: 'italic', color: '#999' }}>
                <span style={{ fontStyle: 'normal' }}>net area </span>
                {formatArea(departmentNetAreaSqft(dept))} sqft
              </div>
            </div>
          }
          // Left-aligned under the name, running alongside the right-aligned
          // area chain — the two read across from each other as one band of
          // small print rather than stacking into two separate paragraphs.
          under={
            /* PLACEHOLDERS. Both figures are hard-coded zeros: the occupancy and
            the energy model are authored on the rooms and nothing reads either
            yet (see CLAUDE.md, "Open questions"). This is the slot they will
            land in, under the name and opposite the area chain, so the shape of
            the heading is settled before the numbers arrive.

            PAX splits fixed from floating because a department's population is
            two different things — staff and beds are established by the room
            list, visitors and outpatients by the occupancy multiplier — and a
            single total would hide which one an answer came from.

            >>> The energy unit is NOT SETTLED. kWh/m²·yr is ECBC's EPI and what
            >>> an Indian brief is read against, but every area in this app is in
            >>> sqft, so the figure and the areas beside it are in different
            >>> systems. Decide it when the EnergyPlus export lands. */
            <div style={{ marginTop: 4, fontSize: 13, color: '#999', fontStyle: 'italic' }}>
              <div>
                <span style={{ fontStyle: 'normal' }}>PAX </span>
                00 fixed + 00 floating
              </div>
              <div>
                <span style={{ fontStyle: 'normal' }}>Energy </span>
                00 kWh/m²·yr
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

      {/* The factors this department is scaled by, each resolved
          catalog-default-then-option-override exactly as a room's loads are —
          see data/factors.js. What varies is WHERE a value came from, which is
          what the muted/underlined treatment reports.

          COLLAPSED, in the same band a room's energy fields use, for the same
          reason and with the same component: they are two rows today and there
          will be more, and a department that opens as a wall of multipliers
          buries the rooms the panel is actually for. `plain` because the shell
          is already painted in this department's wash — see StripBand. */}
      <StripBand title="Department Parameters" colours={colours} pad={16} top={12} plain>
        {resolveFactors(catalogDeptNode, dept).map((f) => {
          const inherited = f.source === 'inherited'
          return (
            <div
              key={f.key}
              // spp-hover-reveal: the reset appears only while the row is
              // hovered — see ResetButton.
              className="spp-hover-reveal"
              // 12px: below the area chain and the stats at 13, above a room's
              // parameter rows at 11. A department's settings sit between what
              // the department is and what its rooms are.
              style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0', minWidth: 0, fontSize: 12 }}
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
                  canEdit={!readOnly}
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
              {f.source === 'option' && !readOnly && (
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
      </StripBand>

      {dept.rooms.length === 0 && <PanelNote>No rooms yet</PanelNote>}

      {/* The wrapper is the drop target, so a drop landing in the 8px gutter
          between two rooms still counts — see useReorderList. */}
      <div {...roomOrder.listProps}>
      {roomOrder.items.map((room) => {
        // This room's own catalog node: what restricts its object picker, and
        // what its schedules are inherited from.
        const catalogRoom = catalogRoomNode(catalogRooms, room.treeRoomNodeId)
        const catalogObjects = catalogRoom?.objects ?? null
        // Once per room: the block wears it and the schedule band is painted a
        // pale wash of it.
        const roomColours = functionColours(functions, roomDefs.find((d) => d.id === room.defId)?.function_id)
        // What this room is called, and who said so: this option's label, the
        // catalog placement's, or the definition's name. Resolved ONCE and
        // threaded — the header, every title, the confirm dialog and the path
        // handed to Rhino all read from here.
        const shown = resolveRoomLabel(catalogRoom, room, room.name)

        return (
          <RoomBlock
            key={room.instanceId}
            colours={roomColours}
            name={shown.name}
            // Renamed by double-clicking the title. What it falls back to is the
            // catalog's label, or the definition's name — typing that back
            // stores no override, and emptying the field clears one.
            //
            // The commit only changes what is IN MEMORY: this tab writes nothing
            // until Save Data, which lights up because `draftOf` stringifies the
            // whole rooms array. '' rather than deleting the key, so the dirty
            // check compares like with like — see loadInstanceData.
            inheritedName={shown.inherited ?? room.name}
            onNameCommit={(label) => onRoomChange(room.instanceId, (r) => ({ ...r, label }))}
            type={room.type}
            count={room.count}
            // What this many of it comes to. The area of ONE is typed on the
            // RoomAreaRow below, beside the objects it has to hold.
            totalAreaSqft={(room.areaSqft ?? 0) * room.count}
            canEdit={!readOnly}
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
                roomName: shown.name,
                objectCount: room.objects.reduce((s, o) => s + o.count, 0),
              })
            }
            control={annotations?.room?.(room, pathTo(shown.name), shown.name)}
            countOverride={annotations?.roomCount?.(room, shown.name)}
            // This option's own note is drawn when the room has one and offered
            // as a + when it has not. No size: that is the catalog's, and is
            // authored on the Tree tab. See RoomExtras.
            hasNote={!!room.notes}
            canAddNote={!readOnly}
            dragHandleProps={roomOrder.handleProps(room.instanceId)}
            dragProps={roomOrder.itemProps(room.instanceId)}
            isDragging={roomOrder.draggingKey === room.instanceId}
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
              canEdit={!readOnly}
              scheduleRows={resolveRoomSchedules(catalogRoom, room.schedules)}
              fieldRows={{
                [LOADS_GROUP]: resolveRoomFields(ROOM_LOADS, LOADS_GROUP, catalogRoom, room),
                [HVAC_GROUP]: resolveRoomFields(ROOM_HVAC, HVAC_GROUP, catalogRoom, room),
              }}
              schedules={schedules}
              colours={roomColours}
              roomName={shown.name}
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

            {/* The room, then what stands in it, then what they leave over. The
                area of ONE of it is typed here — reported on every keystroke and
                coalesced, so Save Data answers while you type and the whole
                number is still one undo step. */}
            <RoomAreaRow
              value={room.areaSqft ?? 0}
              canEdit={!readOnly}
              title={`Area of one ${shown.name}`}
              onChange={(areaSqft) =>
                onRoomChange(room.instanceId, (r) => ({ ...r, areaSqft }), {
                  coalesce: `roomArea:${room.instanceId}`,
                })
              }
            />

            {room.objects.map((obj) => (
              <ObjectRow
                key={obj.instanceId}
                name={obj.name}
                type={obj.type}
                count={obj.count}
                canEdit={!readOnly}
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

            {/* The object picker, and a + for a note if this room has not got
                one. No + for a size here: the suggested size is a catalog fact,
                authored on the Tree tab. See RoomAddRow. */}
            {!readOnly && (
            <RoomAddRow>
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
            </RoomAddRow>
            )}

            {/* This option's OWN note — a second note, not an override of the
                catalog's General Note above. Reported on every keystroke and
                coalesced, so Save Data lights up as you type and the whole note
                is still one undo step. */}
            <RoomNotes
              note={room.notes ?? ''}
              canEdit={!readOnly}
              onChange={(notes) =>
                onRoomChange(room.instanceId, (r) => ({ ...r, notes }), {
                  coalesce: `notes:${room.instanceId}`,
                })
              }
            />
          </RoomBlock>
        )
      })}
      </div>

      {/* Below the rooms, not above them: the list is what the pane is for, and
          the picker is what you reach for after reading it — the same order an
          object's picker already sits in inside each room. */}
      {/* THE PICKER LISTS PLACEMENTS, NOT DEFINITIONS. The same room may sit
          twice in one department, so a list of definitions could not say which
          one you meant — and that is what made addRoom guess with `matches[0]`
          and anchor a room to the wrong catalog node's area and objects.

          Each row is one catalog placement: its label as the name, the
          definition underneath as the quiet second line SearchAddPicker already
          draws. "Male Toilet / Toilet" and "Female Toilet / Toilet", and typing
          "toilet" still finds both.

          Dedup is by the PLACEMENT, never the definition. */}
      {!readOnly && (
      <SearchAddPicker
        options={[
          // WHAT THIS DEPARTMENT ALREADY HAS, first: the catalog's own
          // placements, each with its label as the name and the definition
          // underneath. One placement may be added once, so the ones already in
          // the option drop out.
          ...(catalogRooms ?? []).flatMap((node) => {
            const def = roomDefs.find((d) => d.id === node.room_def_id)
            if (!def) return []
            if (dept.rooms.some((r) => r.treeRoomNodeId === node.instance_id)) return []
            const label = catalogRoomLabel(node)
            return [{ id: node.instance_id, name: label || def.name, path: label ? def.name : null, node, def }]
          }),
          // Then everything else there is. The catalog says what a department is
          // USUALLY built from, not what it may contain — a project needing a
          // room nobody thought to place should not have to go and edit the
          // catalog first, and a room added this way is anchored to no
          // placement, so it inherits nothing and states everything itself.
          { divider: true, id: 'all-rooms', label: 'All rooms' },
          ...roomDefs.map((def) => ({ id: `def-${def.id}`, name: def.name, node: null, def })),
        ]}
        placeholder="Search rooms..."
        title="Add a room to this department"
        label="Add a room"
        onAdd={onAddRoom}
      />
      )}

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
