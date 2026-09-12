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
import {
  catalogObjectCount,
  catalogRoomAreaSqft,
  catalogRoomDimensions,
  catalogRoomLabel,
  catalogRoomNotes,
  findDeptContext,
  newObjectNode,
  newRoomNode,
  resolveNodePlacement,
  roomWithArea,
  roomWithDimension,
  roomWithLabel,
  roomWithNotes,
  roomWithObjectCount,
} from '../../data/tree.js'
import { functionColours } from '../../data/functions.js'
import { catalogRoomSchedules, roomWithSchedule } from '../../data/schedules.js'
import {
  catalogRoomFields,
  HVAC_GROUP,
  LOADS_GROUP,
  ROOM_HVAC,
  ROOM_LOADS,
  roomWithField,
} from '../../data/roomEnergy.js'
import { DEPARTMENT_FACTORS } from '../../data/factors.js'
import { circulationSqft, findCirculationDef } from '../../data/optionData.js'
import { useTreeEditorContext } from './useTreeEditor.jsx'
import {
  CountField,
  formatPath,
  ObjectRow,
  PanelHeading,
  PanelNote,
  PanelShell,
  CatalogNote,
  RoomAreaRow,
  RoomAddRow,
  RoomBlock,
  RoomBrief,
  RoomNotes,
} from '../panel/panelParts.jsx'
import RoomEnergyStrip, { SCHEDULES_GROUP } from '../panel/RoomEnergyStrip.jsx'
import StripBand from '../panel/StripBand.jsx'
import { SearchAddPicker } from '../primitives/SearchAddPicker.jsx'
import { useReorderList } from '../primitives/useReorderList.js'

export default function RoomLinkPanel({ selectedDeptInstanceId, canEdit }) {
  const { rooms, objects, sections, groups, departments, functions, schedules } = useCatalog()
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

  // DRAG A ROOM UP OR DOWN THE LIST. One write and one undo step for the whole
  // drag, not one per row it passed — see useReorderList.
  //
  // Reordered against `stored`, the saved list, rather than against the rows on
  // screen: a room whose definition has been deleted is filtered out of
  // `linkedRooms` below, and rebuilding the list from what is drawn would drop
  // it. (pruneTree removes those on the way out anyway, but a reorder must not
  // be the thing that decides it.)
  //
  // Called before the early returns below, as every hook must be.
  const roomOrder = useReorderList({
    items: stored,
    keyOf: (node) => node.instance_id,
    enabled: canEdit,
    onCommit: (rooms) => write(rooms, 'Rooms reordered'),
  })

  if (!selectedDeptInstanceId) {
    return <PanelNote pad>Click a department in the tree canvas to manage its rooms.</PanelNote>
  }
  if (!ctx) {
    return <PanelNote pad>This department placement no longer exists.</PanelNote>
  }

  const deptDef = departments.find((d) => d.id === ctx.deptNode.department_def_id)
  const colours = functionColours(functions, deptDef?.function_id)
  const placement = resolveNodePlacement(sections, selectedDeptInstanceId, groups)
  const circulationDef = findCirculationDef(objects)

  // From the reorder hook, not `stored`: while a drag is in progress that is the
  // arrangement under the pointer, and the saved one the rest of the time.
  const linkedRooms = roomOrder.items
    .map((node) => ({ node, def: rooms.find((r) => r.id === node.room_def_id) }))
    .filter((e) => e.def)

  return (
    <PanelShell colours={colours}>
      <PanelHeading
        name={deptDef?.name ?? 'Department'}
        path={formatPath(placement?.sectionName, placement?.groupName)}
      />

      {editor.error && <p style={{ color: 'red', fontSize: 12 }}>{editor.error}</p>}

      {/* The catalog's DEFAULTS for this placement's two factors. Every option
          that uses this department inherits these and may override either — see
          data/factors.js. Written immediately, like everything else here.

          Shown even to a non-admin: what an option will inherit is worth
          knowing whether or not you can change it.

          IN THE SAME BAND THE OPTION DRAWS THEM IN, and for the same reason —
          the same factors, the same rows, so the same component. The Project
          tab adds only what it alone has: the muted/overridden treatment and a
          reset, because nothing sits below the catalog. */}
      <StripBand title="Department Parameters" colours={colours} pad={16} top={12} plain>
        {DEPARTMENT_FACTORS.map((factor) => {
          const set = Number.isFinite(ctx.deptNode[factor.treeKey]) ? ctx.deptNode[factor.treeKey] : null
          return (
            <div
              key={factor.key}
              style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0', minWidth: 0, fontSize: 12 }}
            >
              <span style={{ color: '#555', minWidth: 0 }}>{factor.label}</span>
              <CountField
                value={set ?? factor.fallback}
                canEdit={canEdit}
                min={factor.min}
                step={0.05}
                decimals={2}
                prefix="×"
                colour="#555"
                title={factor.describe(deptDef?.name ?? 'this department')}
                onChange={(value) =>
                  editor.setDeptFactor(selectedDeptInstanceId, factor, value, {
                    message: `${deptDef?.name ?? 'Department'}: ${factor.label.toLowerCase()} set`,
                  })
                }
              />
            </div>
          )
        })}
      </StripBand>

      {/* The wrapper is the drop target, so a drop landing in the gutter between
          two rooms still counts — see useReorderList. */}
      <div {...roomOrder.listProps}>
      {linkedRooms.length === 0
        ? !canEdit && <PanelNote>No rooms linked yet</PanelNote>
        : linkedRooms.map(({ node, def }) => {
            const linked = (node.objects || [])
              .map((o) => ({ node: o, def: objects.find((x) => x.id === o.object_def_id) }))
              .filter((e) => e.def)
            const linkedIds = new Set(linked.map((e) => e.def.id))
            // Once per room: the block wears it and the schedule band is
            // painted a pale wash of it.
            const roomColours = functionColours(functions, def.function_id)
            const areaSqft = catalogRoomAreaSqft(node)
            // What this placement is called here — its own label, or the
            // definition's name. Resolved once and used for the header, every
            // title and every undo message, so a department holding two Toilets
            // says WHICH one each edit was to.
            const shown = catalogRoomLabel(node) || def.name

            // Shaped as an option's room so circulationSqft can be shared —
            // there is one definition of that subtraction and this is not a
            // second. The counts are the catalog's own, which is what an option
            // starts from, so the figure here is the one it will open with.
            const asRoom = {
              areaSqft,
              objects: linked.map((e) => ({
                defId: e.def.id,
                areaSqft: e.def.area_sqft ?? null,
                count: catalogObjectCount(e.node),
              })),
            }
            const circulation = circulationSqft(asRoom, circulationDef?.id)

            return (
              <RoomBlock
                key={node.instance_id}
                colours={roomColours}
                name={shown}
                type={def.type}
                canEdit={canEdit}
                // Renamed by double-clicking the title, and WRITTEN on Enter —
                // one write and one undo step for the whole name, never one per
                // keystroke, because every edit here is a whole section's jsonb.
                // Emptying the field clears the name back to the definition's.
                inheritedName={def.name}
                onNameCommit={(next) =>
                  next !== catalogRoomLabel(node) &&
                  editRoom(
                    node.instance_id,
                    (r) => roomWithLabel(r, next),
                    next ? `${next}: named` : `${def.name}: name cleared`
                  )
                }
                // No count in the catalog — how many of a room a facility has is
                // the size of a program, not a fact about the room — so the
                // header's total IS the area of one. Typed on the RoomAreaRow
                // below, the same place the Project tab types it.
                totalAreaSqft={areaSqft}
                // A size and a note are drawn when this placement has one, and
                // offered as a + beside the object picker when it has not. Both
                // are catalog facts, so both are offered here and neither is on
                // the Project tab. See RoomExtras.
                hasSize={catalogRoomDimensions(node).widthFt > 0 && catalogRoomDimensions(node).lengthFt > 0}
                hasNote={!!catalogRoomNotes(node)}
                canAddSize={canEdit}
                canAddNote={canEdit}
                dragHandleProps={roomOrder.handleProps(node.instance_id)}
                dragProps={roomOrder.itemProps(node.instance_id)}
                isDragging={roomOrder.draggingKey === node.instance_id}
                onRemove={() =>
                  write(
                    stored.filter((r) => r.instance_id !== node.instance_id),
                    `${shown} removed`
                  )
                }
              >
                {/* The catalog's schedules, loads and HVAC for this placement —
                    the defaults every option inherits until it overrides one.
                    Written the same way everything else on this tab is: the
                    whole room list, immediately, with an undo step.

                    Fields commit on blur, like every other typed value here, and
                    there is no reset: nothing sits below the catalog to fall
                    back to, so clearing simply unsets. */}
                <RoomEnergyStrip
                  scheduleRows={catalogRoomSchedules(node)}
                  fieldRows={{
                    [LOADS_GROUP]: catalogRoomFields(ROOM_LOADS, LOADS_GROUP, node),
                    [HVAC_GROUP]: catalogRoomFields(ROOM_HVAC, HVAC_GROUP, node),
                  }}
                  schedules={schedules}
                  colours={roomColours}
                  roomName={shown}
                  canEdit={canEdit}
                  onFieldCommit={(field, group, value) =>
                    editRoom(
                      node.instance_id,
                      (r) =>
                        group === SCHEDULES_GROUP
                          ? roomWithSchedule(r, field.key, value)
                          : roomWithField(r, field, group, value),
                      `${shown}: ${field.label.toLowerCase()} set`
                    )
                  }
                />

                {/* Directly above the object list: what the catalog says about
                    the room, before what goes in it. The size is a suggestion —
                    nothing computes from it, and it may disagree with the area
                    in the header.

                    A non-admin gets the note here read-only; an admin types it
                    in the box at the foot, so the whole block stays a statement
                    rather than half statement, half form. Everything commits on
                    blur, like the area. */}
                <RoomBrief
                  {...catalogRoomDimensions(node)}
                  canEdit={canEdit}
                  onWidthCommit={(ft) =>
                    ft !== catalogRoomDimensions(node).widthFt &&
                    editRoom(node.instance_id, (r) => roomWithDimension(r, 'width_ft', ft), `${shown}: size`)
                  }
                  onLengthCommit={(ft) =>
                    ft !== catalogRoomDimensions(node).lengthFt &&
                    editRoom(node.instance_id, (r) => roomWithDimension(r, 'length_ft', ft), `${shown}: size`)
                  }
                >
                  {!canEdit && catalogRoomNotes(node) && (
                    <CatalogNote label="General Note:">{catalogRoomNotes(node)}</CatalogNote>
                  )}
                </RoomBrief>

                {/* The catalog's default size for one of this room here — what
                    an option starts at when it adds it. Copied on add, not
                    inherited: changing it never moves an option that already
                    exists.

                    On commit, not on every keystroke: each edit here is a whole
                    section's jsonb, and typing "1800" would be four writes and
                    four undo steps. */}
                <RoomAreaRow
                  value={areaSqft}
                  canEdit={canEdit}
                  title={`Default area of one ${shown}`}
                  onCommit={(next) =>
                    next !== areaSqft &&
                    editRoom(node.instance_id, (r) => roomWithArea(r, next), `${shown}: default area set`)
                  }
                />

                {linked.length === 0
                  ? // For an editor the labelled + below already says it's empty.
                    !canEdit && <PanelNote>No objects linked yet</PanelNote>
                  : linked.map((entry) => (
                      <ObjectRow
                        key={entry.node.instance_id}
                        name={entry.def.name}
                        type={entry.def.type}
                        // How many of it one of this room holds — the room's
                        // composition, which an option copies and may then
                        // change. A ROOM has no count here; see tree.js.
                        count={catalogObjectCount(entry.node)}
                        // On commit, not per keystroke: one write and one undo
                        // step for the whole number, as the area field does.
                        onCountCommit={(count) =>
                          count !== catalogObjectCount(entry.node) &&
                          editRoom(
                            node.instance_id,
                            (r) => roomWithObjectCount(r, entry.node.instance_id, count),
                            `${entry.def.name}: ×${count}`
                          )
                        }
                        area={
                          entry.def.area_sqft != null
                            ? entry.def.area_sqft * catalogObjectCount(entry.node)
                            : null
                        }
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

                {/* What the default area leaves over once one of each object is
                    taken out — the same derived line the Project tab draws, and
                    red when the objects do not fit.

                    Only once an area has been entered: without one every room
                    would report its objects back as negative circulation, which
                    is noise rather than a finding. */}
                {circulationDef && areaSqft > 0 && (
                  <ObjectRow
                    name={circulationDef.name}
                    area={circulation}
                    canEdit={false}
                    tone={circulation < 0 ? 'warn' : 'muted'}
                  />
                )}

                {/* The object picker, and a + for whatever this room has not
                    got yet — a suggested size, a note. See RoomAddRow. */}
                {canEdit && (
                  <RoomAddRow>
                    <SearchAddPicker
                      options={objects.filter(
                        // Circulation is what the room has left over, not
                        // something you put in it — it is the derived row above.
                        (o) => !linkedIds.has(o.id) && o.id !== circulationDef?.id
                      )}
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
                  </RoomAddRow>
                )}

                {/* The General Note every option using this placement will see
                    above its object list. On commit, like everything typed on
                    this tab — a keystroke must not be a section write. A reader
                    sees it in RoomBrief above instead. */}
                <RoomNotes
                  note={catalogRoomNotes(node)}
                  canEdit={canEdit}
                  onCommit={(notes) =>
                    notes.trim() !== catalogRoomNotes(node) &&
                    editRoom(node.instance_id, (r) => roomWithNotes(r, notes), `${shown}: note saved`)
                  }
                />
              </RoomBlock>
            )
          })}
      </div>

      {/* Below the rooms, matching the Project tab's pane and each room's own
          object picker: the list is what the pane is for, the picker is what you
          reach for after reading it. */}
      {/* EVERY definition, including ones already placed here. Placing the same
          room twice in one department is the point — two Toilets, named "Male"
          and "Female" on the row inside each. The filter that used to sit here
          was what made that impossible. */}
      {canEdit && (
        <SearchAddPicker
          options={rooms}
          placeholder="Search rooms..."
          title="Add a room to this department"
          label="Add a room"
          onAdd={(r) => write([...stored, newRoomNode(r.id)], `${r.name} added`)}
        />
      )}
    </PanelShell>
  )
}
