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

import { useEffect, useState } from 'react'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import { useCatalog } from '../../data/catalog.jsx'
import { sqmToSqft } from '../../data/units.js'
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
  roomWithEquipmentCount,
  newEquipmentNode,
  deptRoomGroups,
  normaliseRoomOrder,
  readRoomGroups,
  withRoomGroupDissolved,
  withRoomGroupNamed,
  withRoomsGrouped,
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
  RoomGroupBlock,
  RoomNotes,
  GROUP_ROOM_INSET,
} from '../panel/panelParts.jsx'
import { Branch, BRANCH_ORIGIN_CONTENT } from '../panel/PanelTree.jsx'
import { removeHint } from '../primitives/RemoveButton.jsx'
import { BLOCK_GAP } from '../panel/panelLayout.js'
import { ADD_ENDPOINT } from '../canvas/canvasLayout.js'
import RoomEnergyStrip, { SCHEDULES_GROUP } from '../panel/RoomEnergyStrip.jsx'
import StripBand from '../panel/StripBand.jsx'
import { SearchAddPicker } from '../primitives/SearchAddPicker.jsx'
import { useReorderList } from '../primitives/useReorderList.js'

export default function RoomLinkPanel({ selectedDeptInstanceId, canEdit }) {
  const { rooms, objects, equipment, sections, groups, departments, functions, schedules } = useCatalog()
  const editor = useTreeEditorContext()

  // WHAT A RIGHT-CLICK ON A BRANCH IS ASKING TO REMOVE — a room, or one thing
  // standing in it. It ALWAYS asks: every edit on this tab writes the shared
  // catalog there and then, and the gesture is easy to arrive at by accident.
  // Each holds a `confirm` that does the write.
  const [confirmTarget, setConfirmTarget] = useState(null)

  // WHICH ROOMS ARE SELECTED, to be grouped. A click on a room's title bar
  // toggles one; a right-click on it makes a group of them all. This is the
  // app's one multi-selection and its one selection made in SIDE rather than in
  // main — grouping is authored here because the grouping is the catalog's.
  const [selected, setSelected] = useState(() => new Set())
  // THE NAME IS ASKED FOR BEFORE ANYTHING IS WRITTEN — { ids, name } while the
  // question is open, null otherwise. Cancelling writes nothing, which is the
  // whole reason it is a prompt: a group made first and named after would sit
  // untitled in the shared catalog the moment anyone thought better of it.
  const [groupPrompt, setGroupPrompt] = useState(null)

  // A SELECTION BELONGS TO ONE DEPARTMENT. This pane is not keyed by the
  // placement, so without this, switching department with rooms still selected
  // would group ids that live in another department — writing an empty group
  // into the shared catalog.
  useEffect(() => {
    setSelected(new Set())
    setGroupPrompt(null)
  }, [selectedDeptInstanceId])

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
    // Normalised on the way out: a group's rooms are a contiguous run, so a
    // room dragged out of its own run is pulled back into it. See
    // normaliseRoomOrder — the list written is always a list that can be drawn.
    onCommit: (rooms) => write(normaliseRoomOrder(rooms), 'Rooms reordered'),
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
  const defOf = (node) => rooms.find((r) => r.id === node.room_def_id)
  const linkedRooms = roomOrder.items.filter(defOf)

  // THE LIST AS IT IS DRAWN — runs of grouped rooms become group cards, the rest
  // are rooms in place. Over the reorder hook's items, so the preview groups as
  // it moves. `keepEmpty` only for an editor: a group whose rooms have all gone
  // still has to be reachable to be dissolved, and to a reader it is nothing.
  const entries = readRoomGroups(linkedRooms, deptRoomGroups(ctx.deptNode), { keepEmpty: canEdit })

  // Every grouping edit is one write of the whole department node — the rooms
  // and the group list move together or not at all. See setRoomGrouping.
  const writeGrouping = (next, message) =>
    editor.setRoomGrouping(selectedDeptInstanceId, next, { message })

  // RIGHT-CLICK A SELECTED ROOM TO GROUP WHAT IS SELECTED — which asks for the
  // name and writes nothing until it has one. The room under the pointer joins
  // in whether or not it was one of them: you are pointing at it.
  const askGroup = (node) => setGroupPrompt({ ids: new Set([...selected, node.instance_id]), name: '' })

  const makeGroup = () => {
    const { ids, name } = groupPrompt
    const { deptNode, groupId } = withRoomsGrouped(ctx.deptNode, ids, name)
    setGroupPrompt(null)
    if (!groupId) return
    setSelected(new Set())
    writeGrouping(deptNode, `${name.trim()}: ${ids.size} rooms grouped`)
  }

  const renameGroup = (group, name) =>
    name !== (group.name ?? '') &&
    writeGrouping(withRoomGroupNamed(ctx.deptNode, group.instance_id, name), name ? `${name}: named` : 'Group name cleared')

  // Dissolving keeps every room — the prompt has to say so, or it reads exactly
  // like the room removal two rows away.
  const askDissolve = (group, count) =>
    setConfirmTarget({
      title: 'Ungroup these rooms?',
      body: `Take "${group.name || 'this group'}" away? Its ${count} room${
        count === 1 ? '' : 's'
      } stay where they are, no longer grouped. The catalog is shared, so this changes it for everyone — you can undo it after.`,
      confirm: () => writeGrouping(withRoomGroupDissolved(ctx.deptNode, group.instance_id), 'Group removed'),
    })

  // ONE ROOM, drawn wherever it sits — straight under the department, or inside
  // a room group, which is all `inset` says. Everything about a room is the
  // same either way, so this is a function rather than two call sites.
  const renderRoom = (node, def, inset) => {
            // OBJECTS AND EQUIPMENT, ONE LIST. Two arrays in the document, one
            // question on screen — see the note in data/tree.js. `kind` rides
            // along on each entry and decides the one thing that differs: which
            // array a handler rewrites. It is never stored.
            const linked = [
              ...(node.objects || [])
                .map((o) => ({ kind: 'object', node: o, def: objects.find((x) => x.id === o.object_def_id) }))
                .filter((e) => e.def),
              ...(node.equipment || [])
                .map((e) => ({ kind: 'equipment', node: e, def: equipment.find((x) => x.id === e.equipment_def_id) }))
                .filter((e) => e.def),
            ]
            // Per kind: an sp_object and an sp_equipment row could not collide
            // on a uuid, but one set would still let either table's id suppress
            // the other's row in the picker if they ever did.
            const linkedObjectIds = new Set(linked.filter((e) => e.kind === 'object').map((e) => e.def.id))
            const linkedEquipmentIds = new Set(linked.filter((e) => e.kind === 'equipment').map((e) => e.def.id))
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
            // Both lists go in, under the keys circulationSqft reads, so the
            // catalog's figure subtracts exactly what the option's will.
            const asRoom = {
              areaSqft,
              objects: linked
                .filter((e) => e.kind === 'object')
                .map((e) => ({
                  defId: e.def.id,
                  areaSqft: sqmToSqft(e.def.area_sqm),
                  count: catalogObjectCount(e.node),
                })),
              equipment: linked
                .filter((e) => e.kind === 'equipment')
                .map((e) => ({ areaSqft: e.def.area_sqft ?? null, count: catalogObjectCount(e.node) })),
            }
            const circulation = circulationSqft(asRoom, circulationDef?.id)
            // The circulation line only draws once an area has been entered.
            const showCirculation = circulationDef && areaSqft > 0

            return (
              <RoomBlock
                key={node.instance_id}
                colours={roomColours}
                name={shown}
                type={def.type}
                canEdit={canEdit}
                // All a room needs to know about being one level deeper.
                inset={inset}
                // CLICK THE TITLE BAR TO SELECT, right-click to group. Editors
                // only — grouping is a catalog edit, and a reader selecting
                // rooms it cannot do anything with is a control that lies.
                selected={selected.has(node.instance_id)}
                onSelect={
                  canEdit
                    ? () =>
                        setSelected((cur) => {
                          const next = new Set(cur)
                          if (!next.delete(node.instance_id)) next.add(node.instance_id)
                          return next
                        })
                    : undefined
                }
                onGroup={canEdit ? () => askGroup(node) : undefined}
                groupHint={
                  canEdit
                    ? selected.size > 0
                      ? `Right click to group the ${selected.size + (selected.has(node.instance_id) ? 0 : 1)} selected rooms`
                      : 'Click to select — then right-click to group'
                    : undefined
                }
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
                  setConfirmTarget({
                    title: 'Remove room?',
                    // What goes with it, so the dialog says what is actually
                    // being thrown away.
                    body: `Remove "${shown}" from this department, and the ${linked.length} thing${
                      linked.length === 1 ? '' : 's'
                    } in it? The catalog is shared, so this changes it for everyone — you can undo it after.`,
                    confirm: () =>
                      write(
                        stored.filter((r) => r.instance_id !== node.instance_id),
                        `${shown} removed`
                      ),
                  })
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
                            (r) =>
                              entry.kind === 'equipment'
                                ? roomWithEquipmentCount(r, entry.node.instance_id, count)
                                : roomWithObjectCount(r, entry.node.instance_id, count),
                            `${entry.def.name}: ×${count}`
                          )
                        }
                        area={(() => {
                          const perOne =
                            entry.kind === 'equipment' ? entry.def.area_sqft ?? null : sqmToSqft(entry.def.area_sqm)
                          return perOne != null ? perOne * catalogObjectCount(entry.node) : null
                        })()}
                        canEdit={canEdit}
                        onRemove={() =>
                          setConfirmTarget({
                            title: 'Remove from this room?',
                            body: `Remove "${entry.def.name}" from ${shown}? The catalog is shared, so this changes it for everyone — you can undo it after.`,
                            confirm: () =>
                              editRoom(
                                node.instance_id,
                                (r) =>
                                  entry.kind === 'equipment'
                                    ? {
                                        ...r,
                                        equipment: (r.equipment || []).filter(
                                          (e) => e.instance_id !== entry.node.instance_id
                                        ),
                                      }
                                    : {
                                        ...r,
                                        objects: r.objects.filter((o) => o.instance_id !== entry.node.instance_id),
                                      },
                                `${entry.def.name} removed`
                              ),
                          })
                        }
                      />
                    ))}

                {/* What the default area leaves over once one of each object is
                    taken out — the same derived line the Project tab draws, and
                    red when the objects do not fit.

                    Only once an area has been entered: without one every room
                    would report its objects back as negative circulation, which
                    is noise rather than a finding. */}
                {showCirculation && (
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
                    {/* One picker, two labelled groups — the same shape the
                        Project tab offers. SearchAddPicker drops the divider
                        when filtering leaves nothing under it. */}
                    <SearchAddPicker
                      options={[
                        ...objects
                          .filter(
                            // Circulation is what the room has left over, not
                            // something you put in it — it is the derived row
                            // above.
                            (o) => !linkedObjectIds.has(o.id) && o.id !== circulationDef?.id
                          )
                          .map((o) => ({ ...o, kind: 'object' })),
                        { divider: true, id: 'equipment-divider', label: 'Equipment' },
                        ...equipment
                          .filter((e) => !linkedEquipmentIds.has(e.id))
                          .map((e) => ({ ...e, kind: 'equipment' })),
                      ]}
                      placeholder="Search objects and equipment..."
                      title="Add an object or equipment to this room"
                      label="Add an object"
                      size={16}
                      onAdd={(o) =>
                        editRoom(
                          node.instance_id,
                          (r) =>
                            o.kind === 'equipment'
                              ? { ...r, equipment: [...(r.equipment || []), newEquipmentNode(o.id)] }
                              : { ...r, objects: [...(r.objects || []), newObjectNode(o.id)] },
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
  }

  return (
    <PanelShell colours={colours}>
      <PanelHeading
        name={deptDef?.name ?? 'Department'}
        path={formatPath(placement?.sectionName, placement?.groupName)}
        // THE ROOT OF THE TREE: the rooms below hang off this line.
        root
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
      {/* THE LINE ON ITS WAY DOWN from the department's own dot to its rooms.
          The factors it is scaled by are facts about the department, not things
          in it, so the tree runs past them — clear of the line, which is why the
          band no longer bleeds to the shell's edge. */}
      <div style={{ paddingLeft: BRANCH_ORIGIN_CONTENT, minWidth: 0 }}>
      <StripBand title="Department Parameters" colours={colours} pad={0} top={12} plain>
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
      </div>

      {/* The wrapper is the drop target, so a drop landing in the gutter between
          two rooms still counts — see useReorderList. */}
      <div {...roomOrder.listProps}>
      {linkedRooms.length === 0
        ? !canEdit && <PanelNote>No rooms linked yet</PanelNote>
        : entries.map((entry) =>
            entry.kind === 'group' ? (
              <RoomGroupBlock
                key={entry.group.instance_id}
                colours={colours}
                name={entry.group.name}
                // THE CATALOG'S DEFAULTS, ADDED UP. Each room in it shows the
                // default area of one, so the group shows what those come to —
                // the sum of what is on screen under it, which is the only
                // figure it could honestly state. An option sizes them; this is
                // what it starts from.
                totalAreaSqft={entry.rooms.reduce((sum, n) => sum + catalogRoomAreaSqft(n), 0)}
                onNameCommit={canEdit ? (next) => renameGroup(entry.group, next) : undefined}
                onRemove={canEdit ? () => askDissolve(entry.group, entry.rooms.length) : null}
                removeTitle={removeHint('this group')}
              >
                {entry.rooms.map((node) => renderRoom(node, defOf(node), GROUP_ROOM_INSET))}
              </RoomGroupBlock>
            ) : (
              renderRoom(entry.room, defOf(entry.room), 0)
            )
          )}
      </div>

      {/* Below the rooms, matching the Project tab's pane and each room's own
          object picker: the list is what the pane is for, the picker is what you
          reach for after reading it. */}
      {/* EVERY definition, including ones already placed here. Placing the same
          room twice in one department is the point — two Toilets, named "Male"
          and "Female" on the row inside each. The filter that used to sit here
          was what made that impossible. */}
      {/* THE LAST BRANCH OF THE DEPARTMENT, with the + standing on its end: the
          thing the tree points at is the thing you press. */}
      {canEdit && (
        <Branch endpoint="add" head={BLOCK_GAP + ADD_ENDPOINT / 2}>
          <SearchAddPicker
            options={rooms}
            placeholder="Search rooms..."
            title="Add a room to this department"
            label="Add a room"
            size={ADD_ENDPOINT}
            onAdd={(r) => write([...stored, newRoomNode(r.id)], `${r.name} added`)}
          />
        </Branch>
      )}

      {/* THE NAME IS THE QUESTION. Asked before anything is written, so cancel
          writes nothing at all — and so no group ever exists unnamed in a
          catalog everyone reads. Enter answers it; the confirm is disabled until
          there is something to answer with, because an empty name here means
          "no" and there is already a button for that. */}
      {groupPrompt && (
        <ConfirmModal
          title={`Group ${groupPrompt.ids.size} rooms`}
          confirmLabel="Group them"
          tone="primary"
          confirmDisabled={!groupPrompt.name.trim()}
          onConfirm={makeGroup}
          onCancel={() => setGroupPrompt(null)}
        >
          <div style={{ marginBottom: 10 }}>
            What are they together? The catalog is shared, so every option using this department reads
            the same grouping — you can undo it after.
          </div>
          <input
            autoFocus
            value={groupPrompt.name}
            placeholder="write group name"
            onChange={(e) => setGroupPrompt((cur) => ({ ...cur, name: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && groupPrompt.name.trim()) makeGroup()
            }}
            className="spp-group-field"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '6px 8px',
              fontFamily: 'inherit',
              fontSize: 13,
              border: '1px solid #ddd',
              borderRadius: 4,
              outline: 'none',
            }}
          />
        </ConfirmModal>
      )}

      {confirmTarget && (
        <ConfirmModal
          title={confirmTarget.title}
          onConfirm={() => {
            confirmTarget.confirm()
            setConfirmTarget(null)
          }}
          onCancel={() => setConfirmTarget(null)}
        >
          {confirmTarget.body}
        </ConfirmModal>
      )}
    </PanelShell>
  )
}
