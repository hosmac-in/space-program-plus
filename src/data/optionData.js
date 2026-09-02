// AN OPTION — sp_option.data
// ==========================
//
// A project has several options: competing versions of the program, each
// selecting a subset of the catalog tree and sizing it. An option is one
// row in `sp_option` whose `data` column holds a flat list of departments:
//
//   {
//     "sections": ["...", "..."],       <- sp_section ids this option includes
//     "departments": [{
//       "instance_id": "...",
//       "department_def_id": "...",
//       "tree_node_id": "...",     <- WHICH placement in sp_section.tree
//       "fallback_section_name": "...", <- display-only, see below
//       "fallback_group_name": "...",
//       "rooms": [{
//         "instance_id": "...",
//         "room_def_id": "...",
//         "tree_room_node_id": "...",
//         "objects": [{ "instance_id": "...", "object_def_id": "...", "count": 1 }]
//       }]
//     }]
//   }
//
// WHY tree_node_id MATTERS
//
// It anchors the entry to one specific placement in the catalog tree (see
// tree.js). That is what makes "which rooms may I add here?" a direct lookup of
// that one node's rooms instead of a union across every placement of the same
// department — the same duplicable-entity bug as in the tree, one layer up.
//
// It also means the same department definition may legitimately appear twice in
// one option, under two different placements. Deduplication on add is therefore
// "do we already have this NODE", never "do we already have this definition".
//
// WHY SECTIONS ARE STORED
//
// A section is in the option because someone added it, not because something
// inside it happens to be added. That is what lets an option hold a section
// with nothing in it yet — the empty shell you fill in as you go — and a
// section that has been emptied again without it vanishing under you. Groups
// are NOT stored: a group appears exactly when a department inside it does.
//
// A section is one row in sp_section, never duplicated, so its own id is the
// identity here — there is no placement to disambiguate as there is one level
// down. (See tree.js on why departments cannot be keyed this way.)
//
// WHY THE LIST IS FLAT
//
// Section and group are not stored structurally. They're resolved live from
// tree_node_id at render time, so reorganising the Tree tab keeps
// every option in sync automatically. The frozen fallback_*_name strings are a
// display courtesy for the one case that can't be resolved: the placement was
// deleted from the catalog after this option referenced it.
//
// Like the tree, this stores only ids and counts. Names and areas resolve from
// the definition tables on load.

// 3: sections became explicit (see above). Older rows have no `sections` key;
// they load with the sections their departments imply, which is exactly what
// those versions displayed.
//
// 2: the anchor keys were `hierarchy_node_id` / `hierarchy_room_node_id` in 1,
// renamed when the Tree tab was. Nothing reads version 1 — an entry without an
// anchor under the current names is dropped on load, so a v1 row would load as
// an empty option rather than a wrong one.
// How many of an object a room starts with when you add one. The catalog has
// no opinion — it says what may be in a room, not how many.
export const DEFAULT_OBJECT_COUNT = 1

export const SCHEMA_VERSION = 3

// In-memory (camelCase, names/areas resolved) -> wire format (ids only).
export function buildInstanceData(departments, sectionIds = []) {
  return {
    sections: [...sectionIds],
    departments: departments.map((d) => ({
      instance_id: d.instanceId,
      department_def_id: d.defId,
      tree_node_id: d.treeNodeId ?? null,
      fallback_section_name: d.fallbackSectionName ?? null,
      fallback_group_name: d.fallbackGroupName ?? null,
      rooms: d.rooms.map((r) => ({
        instance_id: r.instanceId,
        room_def_id: r.defId,
        tree_room_node_id: r.treeRoomNodeId ?? null,
        objects: r.objects.map((o) => ({
          instance_id: o.instanceId,
          object_def_id: o.defId,
          count: o.count,
        })),
      })),
    })),
  }
}

// Wire format -> in-memory, resolving every id against the definition tables.
//
// An entry with no tree_node_id can't be shown as a placement, room-filtered,
// or matched to a card — it would sit in the data invisibly. Those are dropped
// here; the caller compares lengths and tells the user how many, so it isn't
// silent.
//
// Returns the departments and the option's section ids. `sectionIds` is null,
// not [], for a row saved before sections were stored: the caller can then tell
// "no sections key" (derive them from the departments) from "the user removed
// every section" (an option with none, which is legitimate).
export function loadInstanceData(data, departmentDefs, roomDefs, objectDefs) {
  const departments = (data?.departments ?? [])
    .filter((d) => d.tree_node_id)
    .map((d) => {
      const deptDef = departmentDefs.find((x) => x.id === d.department_def_id)
      return {
        instanceId: d.instance_id ?? crypto.randomUUID(),
        defId: d.department_def_id,
        name: deptDef?.name,
        type: deptDef?.type,
        treeNodeId: d.tree_node_id,
        fallbackSectionName: d.fallback_section_name ?? null,
        fallbackGroupName: d.fallback_group_name ?? null,
        rooms: (d.rooms ?? []).map((r) => {
          const roomDef = roomDefs.find((x) => x.id === r.room_def_id)
          return {
            instanceId: r.instance_id ?? crypto.randomUUID(),
            defId: r.room_def_id,
            name: roomDef?.name,
            type: roomDef?.type,
            treeRoomNodeId: r.tree_room_node_id ?? null,
            objects: (r.objects ?? []).map((o) => {
              const objectDef = objectDefs.find((x) => x.id === o.object_def_id)
              return {
                instanceId: o.instance_id ?? crypto.randomUUID(),
                defId: o.object_def_id,
                name: objectDef?.name,
                type: objectDef?.type,
                areaSqft: objectDef?.area_sqft ?? null,
                count: o.count,
              }
            }),
          }
        }),
      }
    })

  return { departments, sectionIds: data?.sections ?? null }
}

// Room/object/area totals for an option, per department and overall.
//
// Takes the IN-MEMORY departments array, not the wire format. That's deliberate
// and load-bearing: area can only be summed here because loadInstanceData has
// already resolved areaSqft from sp_object. The wire format stores no areas, so
// summarising it would silently return zeros.
export function summarize(departments = []) {
  let roomCount = 0
  let objectCount = 0
  let areaSqft = 0

  const perDepartment = departments.map((d) => {
    const rooms = d.rooms ?? []
    let dObjectCount = 0
    let dArea = 0

    rooms.forEach((r) => {
      ;(r.objects ?? []).forEach((o) => {
        dObjectCount += o.count
        dArea += o.count * (o.areaSqft ?? 0)
      })
    })

    roomCount += rooms.length
    objectCount += dObjectCount
    areaSqft += dArea

    return {
      departmentId: d.defId,
      treeNodeId: d.treeNodeId,
      name: d.name,
      roomCount: rooms.length,
      objectCount: dObjectCount,
      areaSqft: dArea,
    }
  })

  return { departmentCount: departments.length, roomCount, objectCount, areaSqft, perDepartment }
}
