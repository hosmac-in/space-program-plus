// THE CATALOG TREE — sp_section.tree
// =======================================
//
// The shared catalog of what a building can contain is one row per section in
// `sp_section`, with the entire tree underneath it stored as nested JSON
// in that row's `tree` column:
//
//   {
//     "groups": [{
//       "instance_id": "...",          <- this placement's own identity
//       "group_def_id": "...",         <- which sp_group row it displays as
//       "departments": [{
//         "instance_id": "...",
//         "department_def_id": "...",  <- which sp_department row
//         "grossing_factor": 1.3,      <- optional default, see DEFAULTS below
//         "occupancy_multiplier": 1,   <- optional default
//         "rooms": [{
//           "instance_id": "...",
//           "room_def_id": "...",      <- which sp_room row
//           "area_sqft": 180,          <- optional default, see AREA below
//           "width_ft": 12,            <- optional, suggestion only, see below
//           "length_ft": 15,
//           "notes": "...",            <- optional, catalog-only prose
//           "schedules": { "occupancy": "..." },   <- optional default
//           "loads": { "people": 4 },  <- optional default
//           "hvac": { "conditioned": true },   <- optional default
//           "objects": [{
//             "instance_id": "...",
//             "object_def_id": "...",  <- which sp_object row
//             "count": 2               <- how many, see COUNTS below
//           }]
//         }]
//       }]
//     }]
//   }
//
// IDENTITY
//
// Some departments and groups are duplicable — Admin/Control legitimately
// exists under both Emergency Care and General & Admin, and the two need
// DIFFERENT rooms. With relationships in junction tables keyed by definition id
// those two placements were one row, so editing one edited both. That is the
// bug this structure exists to prevent.
//
//   >>> Identity is instance_id, generated per node. A *_def_id says only what
//   >>> to display. Key a lookup, a Map or a comparison by a def id and you
//   >>> have merged duplicable placements back together.
//
// Otherwise only ids are stored — no names. A *_def_id resolves against the
// definition tables (catalog.jsx) at render, so renaming a room in sp_room
// updates every placement at once.
//
// COUNTS: OBJECTS HAVE ONE, ROOMS DO NOT
//
// An object node carries `count` — how many of that object are in one of this
// room. That is a fact about the room's COMPOSITION: an ICU bay has one bed,
// two monitors and a sink wherever it is built, and saying so once in the
// catalog is the point of having a catalog.
//
// A room node carries NO count, and must not. How many ICU bays a facility has
// is the size of that particular program, not a property of the room — it is
// per option, per phase, and it is what the questionnaire's numbers write into.
//
//   >>> This line is the whole rule. If you find yourself adding a count to a
//   >>> ROOM node, the thing you actually want belongs in sp_option.data.
//
// An object count was briefly stored here once, removed when the distinction
// above had not been drawn yet, and is back deliberately — cleanObjectNode is
// the normaliser, and used to be the eraser.
//
// AREA
//
// A room node may carry `area_sqft`: the usual size of ONE of this room in this
// placement — a Consulting Room off an OPD is not the size of one off an
// Executive Health Check, and those are the same sp_room row. Absent or 0 both
// mean the catalog states none.
//
//   >>> This is COPIED into an option when the room is added, NOT inherited
//   >>> live like a schedule or a factor. An option's area is the measured
//   >>> figure for that project; editing the catalog afterwards must never
//   >>> re-price options that already exist. It is a starting point, not a
//   >>> default in force.
//
// It is an area, which the rule above otherwise forbids storing — but a
// denormalised area is one COPIED from a definition row, which this is not.
// sp_room has no size: how big a room is depends on where it sits, and the
// placement is the only level that can say so.
//
// SUGGESTED DIMENSIONS, AND NOTES — CATALOG-ONLY, NEITHER OVERRIDABLE
//
// `width_ft` × `length_ft` is the shape a room is usually built to, and `notes`
// is whatever an author needs to say about it. Both are drawn wherever the room
// is, including on the Project tab, but they are NOT part of the three-way
// inheritance above and there is nothing to override.
//
//   >>> THE DIMENSIONS ARE A SUGGESTION AND NOTHING COMPUTES FROM THEM. They do
//   >>> not set, check or constrain area_sqft, and width × length is allowed to
//   >>> disagree with it — a room is rarely a perfect rectangle. Wiring them
//   >>> into the area chain would turn guidance into a constraint, which is
//   >>> exactly what they are not.
//
// Shown only when BOTH are stated: half a rectangle says nothing.
//
// An option reads both LIVE rather than copying them, the opposite of
// area_sqft — nobody is departing from them, so correcting a catalog note or a
// dimension should reach every option immediately. An option has a `notes` of
// its own alongside, which is a second note, not an override of this one.
//
// DEFAULTS AN OPTION INHERITS
//
// A department node may carry `grossing_factor` and `occupancy_multiplier`; a
// room node may carry `schedules` (role -> sp_schedule id), `loads` and `hvac`.
// Each is the DEFAULT an option inherits and may override — see data/factors.js,
// data/schedules.js and data/roomEnergy.js. `area_sqft` is the one that is
// copied instead — see AREA.
//
// They sit on the PLACEMENT, not on sp_room or sp_department, because a generic
// room — Toilet, Store, Corridor — runs on a different schedule under an ICU
// than under an OPD, and those are the same sp_room row. The placement is the
// only level that can tell them apart, which is the argument that put rooms in
// this tree at all.
//
//   >>> This is NOT the `count` mistake repeating. The rule above forbids
//   >>> denormalised display data and quantities. A schedule id is a pointer
//   >>> resolved at render, exactly like room_def_id.
//
// THE BUILDING IS ONE LEVEL UP
//
// `sp_section.building_id` is not null, so a section belongs to exactly one
// building and a tree never spans two. There is no building key inside this
// JSON and there should not be — a node's building is a fact about the section
// holding it (resolveNodePlacement below), which is why moving a section
// between buildings rewrites no options.
//
// Departments and groups have no building of their own: the same Lobby is
// placeable in every one of them.
//
// Everything below except writeSectionTree is a pure function over a plain
// object — takes a tree, returns a new tree, touches nothing else.

import { supabase } from './supabase.js'

// --- Writing ---------------------------------------------------------------

// Rooms and objects are nested three levels inside a section, so there is no
// narrow write: every edit rewrites the whole section row. Callers reload the
// catalog afterwards.
//
// EVERY WRITE STATES THE VERSION IT WAS BASED ON — `where id = ? and version =
// ?`, so a copy that another admin has moved on from matches zero rows instead
// of destroying their edit whole-column. Same rule as sp_option; needs
// sql/section_version.sql run.
//
// Returns { error, conflict }. A conflict is not an error in the usual sense:
// nothing was written and nothing is broken, so the caller reloads and says so.
export async function writeSectionTree(sectionId, tree, version) {
  // No version means no section is loaded, so nothing may be written — the same
  // refusal persistOption makes.
  if (!Number.isInteger(version)) {
    return { error: 'This section was not loaded with a version, so it cannot be saved.', conflict: false }
  }

  const { data, error } = await supabase
    .from('sp_section')
    .update({ tree })
    .eq('id', sectionId)
    .eq('version', version)
    // Without a select, "no rows matched" and "one row updated" both come back
    // empty and a conflict would pass as success.
    .select('id')

  if (error) return { error: error.message, conflict: false }
  if (!data || data.length === 0) return { error: null, conflict: true }
  return { error: null, conflict: false }
}

export const EMPTY_TREE = { groups: [] }

// --- Groups within a section -----------------------------------------------

export function removeGroupNode(tree, groupInstanceId) {
  const list = tree.groups || []
  const idx = list.findIndex((g) => g.instance_id === groupInstanceId)
  if (idx === -1) return { tree, removed: null }
  return {
    tree: { ...tree, groups: [...list.slice(0, idx), ...list.slice(idx + 1)] },
    removed: list[idx],
  }
}

export function insertGroupNode(tree, groupNode) {
  return { ...tree, groups: [...(tree.groups || []), groupNode] }
}

export function newGroupNode(groupDefId) {
  return { instance_id: crypto.randomUUID(), group_def_id: groupDefId, departments: [] }
}

// --- Departments within a group ---------------------------------------------

export function removeDeptNode(tree, deptInstanceId) {
  const list = tree.groups || []
  let removed = null
  let fromGroupInstanceId = null
  const groups = list.map((g) => {
    const depts = g.departments || []
    const idx = depts.findIndex((d) => d.instance_id === deptInstanceId)
    if (idx === -1) return g
    removed = depts[idx]
    fromGroupInstanceId = g.instance_id
    return { ...g, departments: [...depts.slice(0, idx), ...depts.slice(idx + 1)] }
  })
  return { tree: { ...tree, groups }, removed, fromGroupInstanceId }
}

export function insertDeptNode(tree, groupInstanceId, deptNode) {
  const groups = (tree.groups || []).map((g) =>
    g.instance_id === groupInstanceId ? { ...g, departments: [...(g.departments || []), deptNode] } : g
  )
  return { ...tree, groups }
}

export function newDeptNode(departmentDefId) {
  return { instance_id: crypto.randomUUID(), department_def_id: departmentDefId, rooms: [] }
}

// --- Rooms and objects within a department ----------------------------------

// Applies `updater` to one department node itself (used for add/remove room,
// which edit that node's own `rooms` array).
export function updateDeptNode(tree, deptInstanceId, updater) {
  let found = false
  const groups = (tree.groups || []).map((g) => {
    const depts = g.departments || []
    const idx = depts.findIndex((d) => d.instance_id === deptInstanceId)
    if (idx === -1) return g
    found = true
    return { ...g, departments: [...depts.slice(0, idx), updater(depts[idx]), ...depts.slice(idx + 1)] }
  })
  return { tree: { ...tree, groups }, found }
}

export function newRoomNode(roomDefId) {
  return { instance_id: crypto.randomUUID(), room_def_id: roomDefId, objects: [] }
}

// Set or clear a room's default area. Clearing DELETES the key rather than
// writing 0, so a room nobody has sized is byte-identical to one from before
// this existed — the same rule roomWithSchedule follows.
export function roomWithArea(room, areaSqft) {
  const next = { ...room }
  if (Number.isFinite(areaSqft) && areaSqft > 0) next.area_sqft = areaSqft
  else delete next.area_sqft
  return next
}

// What an option starts a room at. 0 for a node that states none, so a caller
// seeding from it never has to handle an absence.
export function catalogRoomAreaSqft(roomNode) {
  const stated = Number(roomNode?.area_sqft)
  return Number.isFinite(stated) && stated > 0 ? stated : 0
}

// The suggested shape, in feet: { widthFt, lengthFt }, each 0 when unstated.
// A caller draws the pair only when both are set — see the note above.
export function catalogRoomDimensions(roomNode) {
  const positive = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 0)
  return { widthFt: positive(roomNode?.width_ft), lengthFt: positive(roomNode?.length_ft) }
}

// Set or clear one side of the suggested shape. `key` is 'width_ft' or
// 'length_ft'; clearing deletes it, so a room states a whole rectangle or none.
export function roomWithDimension(room, key, value) {
  const next = { ...room }
  if (Number.isFinite(value) && value > 0) next[key] = value
  else delete next[key]
  return next
}

// The catalog's note for this placement, or '' — never null, so a field bound to
// it is always controlled.
export function catalogRoomNotes(roomNode) {
  return typeof roomNode?.notes === 'string' ? roomNode.notes : ''
}

// Set or clear a room's note. Blank and whitespace-only both DELETE the key, so
// an emptied note leaves nothing behind and the panels can treat "has a note"
// as a plain presence check rather than trimming at every call site.
export function roomWithNotes(room, notes) {
  const next = { ...room }
  const trimmed = typeof notes === 'string' ? notes.trim() : ''
  if (trimmed) next.notes = trimmed
  else delete next.notes
  return next
}

export const DEFAULT_CATALOG_OBJECT_COUNT = 1

export function newObjectNode(objectDefId) {
  return {
    instance_id: crypto.randomUUID(),
    object_def_id: objectDefId,
    count: DEFAULT_CATALOG_OBJECT_COUNT,
  }
}

// Every object node on its way to the database, normalised: the two ids and a
// usable count, and nothing else that may have been hung on it in memory.
//
//   >>> This used to DELETE `count`, back when no count belonged in the tree.
//   >>> It now preserves it. Reverting it to the old shape would wipe every
//   >>> object count in the catalog on the next save of each section, silently.
export function cleanObjectNode(objectNode) {
  return {
    instance_id: objectNode.instance_id,
    object_def_id: objectNode.object_def_id,
    count: catalogObjectCount(objectNode),
  }
}

// How many of an object one of this room holds. 1 for a node saved before
// counts existed here, which is what it displayed and totalled.
export function catalogObjectCount(objectNode) {
  const stated = objectNode?.count
  return Number.isInteger(stated) && stated > 0 ? stated : DEFAULT_CATALOG_OBJECT_COUNT
}

// Set an object's count on a room node. Never removes the key: unlike an area
// or a schedule there is no "unset" — a placed object is always some number of
// them, and the floor is 1.
export function roomWithObjectCount(room, objectInstanceId, count) {
  return {
    ...room,
    objects: (room.objects || []).map((o) =>
      o.instance_id === objectInstanceId
        ? { ...o, count: Number.isInteger(count) && count > 0 ? count : DEFAULT_CATALOG_OBJECT_COUNT }
        : o
    ),
  }
}

// --- Lookups across all sections --------------------------------------------
//
// These take the full `sections` array (every row of sp_section) because a node
// can live under any section and callers rarely know which one in advance.

export function findGroupNode(sections, groupInstanceId) {
  for (const section of sections) {
    const node = (section.tree?.groups || []).find((g) => g.instance_id === groupInstanceId)
    if (node) return node
  }
  return null
}

export function findSectionIdForGroup(sections, groupInstanceId) {
  for (const section of sections) {
    if ((section.tree?.groups || []).some((g) => g.instance_id === groupInstanceId)) return section.id
  }
  return null
}

// The department node itself plus the section it lives in — the section id is
// what a caller needs to write the edit back.
export function findDeptContext(sections, deptInstanceId) {
  for (const section of sections) {
    for (const g of section.tree?.groups || []) {
      const dept = (g.departments || []).find((d) => d.instance_id === deptInstanceId)
      if (dept) return { sectionId: section.id, groupNode: g, deptNode: dept }
    }
  }
  return null
}

// Where a department node currently sits, resolved live rather than frozen, so
// reorganising the tree shows up wherever this is displayed. Null once the node
// no longer exists.
export function resolveNodePlacement(sections, deptInstanceId, groupDefs = [], buildingDefs = []) {
  if (!deptInstanceId) return null
  for (const section of sections) {
    for (const group of section.tree?.groups || []) {
      if ((group.departments || []).some((d) => d.instance_id === deptInstanceId)) {
        return {
          buildingId: section.building_id ?? null,
          buildingName: buildingDefs.find((b) => b.id === section.building_id)?.name,
          sectionId: section.id,
          sectionName: section.name,
          // The group's PLACEMENT, not its definition: the same group def can
          // sit under two sections and callers grouping by it must not merge
          // those.
          groupInstanceId: group.instance_id,
          groupDefId: group.group_def_id,
          groupName: groupDefs.find((g) => g.id === group.group_def_id)?.name,
        }
      }
    }
  }
  return null
}

// The rooms one specific department placement allows — that exact node's own
// `rooms` array, never a union across every placement of the same department
// definition. Returns null when the node can't be found, which callers treat as
// "unrestricted" rather than "nothing allowed".
export function catalogRoomsForNode(sections, deptInstanceId) {
  return findDeptContext(sections, deptInstanceId)?.deptNode.rooms ?? null
}

// Every department node in the catalog as { node, buildingId }, keyed by
// instance_id — never by department_def_id, which would collapse two placements
// of the same duplicable department into one entry.
//
// findDeptContext walks every section to find ONE node, which is wrong for
// totalling an option: that asks the same question once per department on every
// HUD render. This walks the catalog once and answers all of them. The building
// rides along because a department's area is grossed by its building's
// built-area factor, and the section is the only thing that says which building.
export function deptNodeIndex(sections = []) {
  const index = new Map()
  sections.forEach((section) => {
    ;(section.tree?.groups ?? []).forEach((group) => {
      ;(group.departments ?? []).forEach((dept) => {
        if (dept.instance_id) {
          index.set(dept.instance_id, { node: dept, buildingId: section.building_id ?? null })
        }
      })
    })
  })
  return index
}

// One specific catalog room node, whole: its `objects` restrict the option's
// object picker and its `schedules` are what the option inherits.
//
// Null when the option's room is anchored to a placement the catalog no longer
// has — an option can outlive the node it points at, and callers fall open
// rather than treating that as an error.
export function catalogRoomNode(catalogRooms, roomInstanceId) {
  if (!catalogRooms || !roomInstanceId) return null
  return catalogRooms.find((r) => r.instance_id === roomInstanceId) ?? null
}

// --- The whole catalog as a flat list ---------------------------------------

// Every PLACEMENT in the catalog, one row each, with the full path to it — for
// anything that points at one node out of the whole tree, chiefly the
// questionnaire's bindings and number targets (data/questionnaire.js).
//
// The path is the whole point: two "Lobby" rows are indistinguishable, where
// "Hospital → Diagnostics → Imaging → Lobby" and "Medical College → Academic →
// Lobby" are not. It is also what gets frozen alongside a stored instance_id, so
// a node deleted from the catalog later still reads as something.
//
// `kinds` picks which levels to include. Groups and sections are deliberately
// absent — nothing points at one, so listing them would offer rows that cannot
// be chosen.
//
// Every row carries its `deptInstanceId` so a caller can narrow to one
// department's rooms without walking the tree again: a question's number points
// at a room INSIDE the department that question adds, never elsewhere.
export function flattenTreeNodes(
  sections,
  { departments = [], rooms = [], objects = [], groups = [], buildings = [] } = {},
  { kinds = ['department', 'room', 'object'] } = {}
) {
  const want = new Set(kinds)
  const out = []
  const nameOf = (list, id) => list.find((x) => x.id === id)?.name

  for (const section of sections) {
    const buildingName = buildings.find((b) => b.id === section.building_id)?.name
    for (const groupNode of section.tree?.groups || []) {
      const groupName = nameOf(groups, groupNode.group_def_id)
      for (const deptNode of groupNode.departments || []) {
        const deptName = nameOf(departments, deptNode.department_def_id) ?? 'Department'
        // Each level's path is its ancestors, so the row's own name is never
        // repeated in its own path.
        const deptPath = [buildingName, section.name, groupName]
        if (want.has('department')) {
          out.push({
            id: deptNode.instance_id,
            instanceId: deptNode.instance_id,
            deptInstanceId: deptNode.instance_id,
            kind: 'department',
            name: deptName,
            path: formatNodePath(deptPath),
          })
        }

        for (const roomNode of deptNode.rooms || []) {
          const roomName = nameOf(rooms, roomNode.room_def_id) ?? 'Room'
          const roomPath = [...deptPath, deptName]
          if (want.has('room')) {
            out.push({
              id: roomNode.instance_id,
              instanceId: roomNode.instance_id,
              deptInstanceId: deptNode.instance_id,
              kind: 'room',
              name: roomName,
              path: formatNodePath(roomPath),
            })
          }

          if (!want.has('object')) continue
          for (const objectNode of roomNode.objects || []) {
            out.push({
              id: objectNode.instance_id,
              instanceId: objectNode.instance_id,
              deptInstanceId: deptNode.instance_id,
              kind: 'object',
              name: nameOf(objects, objectNode.object_def_id) ?? 'Object',
              path: formatNodePath([...roomPath, roomName]),
            })
          }
        }
      }
    }
  }

  return out
}

// The ancestors of a node, as one line. An unresolvable step shows as a dash so
// the shape of the path survives a missing definition — the same rule and the
// same separator as `formatPath` in ui/panel/panelParts.jsx, because the two are
// read side by side.
export function formatNodePath(names) {
  return names.map((n) => n ?? '—').join(' → ')
}

// One row from flattenTreeNodes, or null — for resolving a stored instance_id
// back to the node it names.
export function findFlatNode(flat, instanceId) {
  return instanceId ? flat.find((n) => n.instanceId === instanceId) ?? null : null
}
