// THE OPTION CREATOR'S WRITE — a finished run of the questionnaire, turned into
// a new sp_option. The one reader of the answers that stores anything; the Test
// run tab is the same deck and never calls this. See CLAUDE.md, Option creator.
//
// It writes the WIRE FORMAT directly (data/optionData.js), exactly what a
// department added on the canvas would have produced: every department the run
// built, in phase 1, anchored to its catalog placement, each room seeded from
// the catalog as addRoom seeds it — area and whole object list COPIED — and then
// sized by the run.
//
// The counts, from what evaluateRun already computed, so what side showed is
// what is stored:
//   - a ROOM is its rule's value PER SET, and a room group's set count goes to
//     `room_group_counts` — the option multiplies them back (roomCountIn), so
//     storing the product as well would count every grouped room twice.
//   - a ROOM WITH NO COUNT (only its objects were ruled) is one — an option room
//     is always at least one, and loadInstanceData reads anything less as one.
//   - an OBJECT's rule states a TOTAL, where an option's object count is PER
//     ROOM, so a ruled one is divided by the rooms it stands in. Unruled objects
//     keep the catalog's count.

import { supabase } from '../../data/supabase.js'
import { catalogObjectCount, catalogRoomAreaSqft, resolveNodePlacement } from '../../data/tree.js'
import {
  clampPhaseCount,
  DEFAULT_PHASE_COUNT,
  DEFAULT_ROOM_COUNT,
  findCirculationDef,
  SCHEMA_VERSION,
} from '../../data/optionData.js'
import { OPTION_ANSWERS } from '../../data/questionnaire.js'
import { buildProgram } from './useTestRun.jsx'

const PHASE = 1

// The General answers that are the option's own settings, read off the run.
export function optionSettingsOf(run) {
  const number = (id) => {
    const n = run.generalOf(id)
    return Number.isFinite(n) ? n : null
  }
  const name = run.generalOf(OPTION_ANSWERS.name)
  return {
    name: typeof name === 'string' && name.trim() ? name.trim() : '',
    phaseCount: number(OPTION_ANSWERS.phases) != null ? clampPhaseCount(Math.round(number(OPTION_ANSWERS.phases))) : DEFAULT_PHASE_COUNT,
    fsi: number(OPTION_ANSWERS.fsi),
    groundCover: number(OPTION_ANSWERS.groundCover),
    dmgIds: [...run.dmgIds],
  }
}

function catalogDeptNode(sections, deptInstanceId) {
  for (const section of sections) {
    for (const group of section.tree?.groups ?? []) {
      const node = (group.departments ?? []).find((d) => d.instance_id === deptInstanceId)
      if (node) return node
    }
  }
  return null
}

function seedObjects(roomNode, catalog, circulationId) {
  return (roomNode?.objects ?? []).flatMap((node) => {
    const def = catalog.objects.find((o) => o.id === node.object_def_id)
    if (!def || def.id === circulationId) return []
    return [{ node, wire: { instance_id: crypto.randomUUID(), object_def_id: def.id, count: catalogObjectCount(node) } }]
  })
}

function seedEquipment(roomNode, catalog) {
  return (roomNode?.equipment ?? []).flatMap((node) => {
    const def = catalog.equipment.find((e) => e.id === node.equipment_def_id)
    if (!def) return []
    return [{ instance_id: crypto.randomUUID(), equipment_def_id: def.id, count: catalogObjectCount(node) }]
  })
}

// model/run -> sp_option.data. Pure; nothing is written.
export function optionDataFromRun({ model, run, buildingId, catalog }) {
  const settings = optionSettingsOf(run)
  const circulationId = findCirculationDef(catalog.objects)?.id ?? null
  const sectionIds = []
  const departments = []

  buildProgram(model, run).forEach((section) =>
    section.groups.forEach((group) =>
      group.departments.forEach((department) => {
        const deptNode = catalogDeptNode(catalog.sections, department.id)
        const deptDef = deptNode && catalog.departments.find((d) => d.id === deptNode.department_def_id)
        if (!deptDef) return
        const placement = resolveNodePlacement(catalog.sections, department.id, catalog.groups)
        if (placement?.sectionId && !sectionIds.includes(placement.sectionId)) sectionIds.push(placement.sectionId)

        const roomGroupCounts = {}
        const rooms = []
        const seen = new Set()
        department.results
          .filter((r) => r.state === 'ok' || r.state === 'unauthored')
          .forEach((result) => {
            const times = result.times ?? 1
            if (result.connection.grouped && times !== 1) roomGroupCounts[result.connection.instance_id] = times
            result.rooms.forEach((room) => {
              if (seen.has(room.instance_id)) return
              if (!(room.count > 0) && !room.objects.some((o) => o.state === 'ok' && o.count > 0)) return
              const roomNode = (deptNode.rooms ?? []).find((n) => n.instance_id === room.instance_id)
              const roomDef = roomNode && catalog.rooms.find((d) => d.id === roomNode.room_def_id)
              if (!roomDef) return
              seen.add(room.instance_id)

              const perSet = room.count > 0 ? room.count / (result.connection.grouped ? times || 1 : 1) : DEFAULT_ROOM_COUNT
              const total = perSet * (result.connection.grouped ? times : 1) || 1
              const ruled = new Map(room.objects.filter((o) => o.state === 'ok').map((o) => [o.instance_id, o.count]))
              const objects = seedObjects(roomNode, catalog, circulationId).map(({ node, wire }) =>
                ruled.has(node.instance_id) ? { ...wire, count: ruled.get(node.instance_id) / total } : wire
              )
              const equipment = seedEquipment(roomNode, catalog)

              rooms.push({
                instance_id: crypto.randomUUID(),
                room_def_id: roomDef.id,
                tree_room_node_id: roomNode.instance_id,
                count: perSet,
                area_sqft: catalogRoomAreaSqft(roomNode, roomDef),
                objects,
                ...(equipment.length ? { equipment } : {}),
              })
            })
          })
        if (rooms.length === 0) return

        departments.push({
          instance_id: crypto.randomUUID(),
          department_def_id: deptDef.id,
          tree_node_id: department.id,
          phase: PHASE,
          fallback_section_name: placement?.sectionName ?? null,
          fallback_group_name: placement?.groupName ?? null,
          ...(Object.keys(roomGroupCounts).length ? { room_group_counts: roomGroupCounts } : {}),
          rooms,
        })
      })
    )
  )

  return {
    name: settings.name,
    data: {
      phase_count: settings.phaseCount,
      dmgs: settings.dmgIds,
      buildings: [buildingId],
      sections: sectionIds,
      ...(settings.fsi != null || settings.groundCover != null
        ? {
            area_metrics: {
              ...(settings.fsi != null ? { fsi: settings.fsi } : {}),
              ...(settings.groundCover != null ? { ground_cover: settings.groundCover } : {}),
            },
          }
        : {}),
      departments,
    },
  }
}

// Insert it. Returns the new id, or throws with the database's message.
export async function createOptionFromRun({ projectId, model, run, buildingId, catalog }) {
  const { name, data } = optionDataFromRun({ model, run, buildingId, catalog })
  const { data: inserted, error } = await supabase
    .from('sp_option')
    .insert({
      project_id: projectId,
      option_name: name || 'Untitled option',
      schema_version: SCHEMA_VERSION,
      data,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return inserted.id
}
