// THE CATALOG TREE — sp_section.tree
// =======================================
//
// The shared catalog of what a hospital can contain is one row per section in
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
//         "rooms": [{
//           "instance_id": "...",
//           "room_def_id": "...",      <- which sp_room row
//           "objects": [{
//             "instance_id": "...",
//             "object_def_id": "..."   <- which sp_object row
//           }]
//         }]
//       }]
//     }]
//   }
//
// WHY IT LOOKS LIKE THIS
//
// Some departments and groups are "duplicable" — Admin/Control legitimately
// exists under both Emergency Care and General & Admin, and the two need
// *different* rooms. When relationships lived in junction tables keyed by
// definition id, those two placements were the same row, so editing one edited
// both. That was the bug this structure exists to prevent.
//
// The fix is `instance_id`: every node carries its own, generated when the node
// is created. Two placements of the same department are two independent JSON
// objects with independent subtrees. Nothing can collide because nothing is
// shared.
//
//   >>> Identity is instance_id. A *_def_id says only what to display.
//   >>> The moment you key a lookup, a Map, or a comparison by a def id, you
//   >>> have merged duplicable placements back together.
//
// The catalog says WHAT a room may contain, never how many: counts belong to an
// option (see optionData.js), where the same catalog room can appear with a
// different number in each option. Nothing here stores one.
//
// Names and areas are never stored here — only ids. Every *_def_id is resolved
// against the definition tables (see catalog.js) at render time, so renaming a
// room in sp_room updates every placement of it everywhere at once.
//
// Everything below except writeSectionTree is a pure function over a plain JS
// object: it takes a tree, returns a new tree, and touches nothing else.

import { supabase } from './supabase.js'

// --- Writing ---------------------------------------------------------------

// Rooms and objects are nested three levels inside a section, so there is no
// such thing as a narrow write: every edit anywhere in the tree rewrites the
// whole section row. Callers reload the catalog afterwards.
export async function writeSectionTree(sectionId, tree) {
  const { error } = await supabase.from('sp_section').update({ tree }).eq('id', sectionId)
  return error ? error.message : null
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

export function newObjectNode(objectDefId) {
  return { instance_id: crypto.randomUUID(), object_def_id: objectDefId }
}

// A catalog object node carries ids and nothing else. Rows written while the
// tree briefly stored a `count` are normalised through here on their next save.
export function cleanObjectNode(objectNode) {
  return { instance_id: objectNode.instance_id, object_def_id: objectNode.object_def_id }
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
// reorganising the tree is reflected wherever this is displayed. Returns
// null once that node no longer exists.
export function resolveNodePlacement(sections, deptInstanceId, groupDefs = []) {
  if (!deptInstanceId) return null
  for (const section of sections) {
    for (const group of section.tree?.groups || []) {
      if ((group.departments || []).some((d) => d.instance_id === deptInstanceId)) {
        return {
          sectionId: section.id,
          sectionName: section.name,
          // The group's PLACEMENT, not its definition: the same group def can
          // sit under two sections, and callers grouping by it must not merge
          // those (see the identity note at the top of this file).
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

// Same idea one level down: one specific catalog room node's own object list.
export function catalogObjectsForRoom(catalogRooms, roomInstanceId) {
  if (!catalogRooms || !roomInstanceId) return null
  return catalogRooms.find((r) => r.instance_id === roomInstanceId)?.objects ?? null
}
