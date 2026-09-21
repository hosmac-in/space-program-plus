// THE QUESTIONNAIRE, AS ONE TREE — the catalog crossed with what has been
// authored against it.
//
// The document is a sparse overlay keyed by catalog ids (data/questionnaire.js),
// so neither column can draw it without walking the catalog too. Both walk it
// HERE, once, and read the result: an outline and a detail panel with two ideas
// of what is in a group are two questionnaires.
//
// Only what the CATALOG has is emitted. An entry in the document whose group or
// department has since been deleted is simply never reached — dangling keys are
// tolerated, not pruned, because a placement moved and put back finds its
// questions again.

import { compareSections, resolveRoomLabel } from '../../data/tree.js'
import { departmentRole, questionRoomSets, FUNCTIONING, SUPPORTING } from '../../data/questionnaire.js'

export { FUNCTIONING, SUPPORTING }

const defOf = (defs, id) => defs.find((d) => d.id === id) ?? null
const nameOf = (defs, id, fallback) => defOf(defs, id)?.name || fallback

// roomInstanceId -> { questionId, prompt, setId, setName }. First writer wins,
// which is the same answer the picker enforces: nothing can become used twice.
function roomUsage(questions) {
  const used = new Map()
  questions.forEach((question) =>
    questionRoomSets(question).forEach((set) =>
      (set.rooms ?? []).forEach((room) => {
        if (used.has(room.instance_id)) return
        used.set(room.instance_id, {
          questionId: question.instance_id,
          prompt: question.prompt || 'Untitled question',
          setId: set.instance_id,
          setName: set.name || '',
        })
      })
    )
  )
  return used
}

// Everything one building's questionnaire is about, in the order it is read.
//
// Every node carries `id` — the thing a selection names — plus the ids its
// edits have to be written at. A question deep in the tree can then be edited
// without anyone walking back up to work out which section it was in.
export function buildModel({ buildingId, definition, sections, groups, departments, rooms }) {
  return sections
    .filter((s) => s.building_id === buildingId)
    .sort(compareSections)
    .map((section) => ({
      kind: 'section',
      id: section.id,
      sectionId: section.id,
      name: section.name || 'Untitled section',
      // Carried, never resolved here: a colour comes from functionColours() and
      // a null function_id is normal — see data/functions.js.
      functionId: section.function_id ?? null,
      groups: (section.tree?.groups ?? []).map((groupNode) => {
        const groupId = groupNode.instance_id
        const entry = definition?.sections?.[section.id]?.groups?.[groupId] ?? null
        return {
          kind: 'group',
          id: groupId,
          sectionId: section.id,
          groupId,
          name: nameOf(groups, groupNode.group_def_id, 'Untitled group'),
          functionId: defOf(groups, groupNode.group_def_id)?.function_id ?? null,
          gate: entry?.gate ?? null,
          departments: (groupNode.departments ?? []).map((deptNode) => {
            const deptId = deptNode.instance_id
            const deptEntry = entry?.departments?.[deptId] ?? null
            return {
              kind: 'department',
              id: deptId,
              sectionId: section.id,
              groupId,
              deptId,
              name: nameOf(departments, deptNode.department_def_id, 'Untitled department'),
              functionId: defOf(departments, deptNode.department_def_id)?.function_id ?? null,
              role: departmentRole(definition, section.id, groupId, deptId),
              driver: deptEntry?.driver ?? null,
              // Every room this department PLACES, in the catalog's order —
              // what a question here may connect to, and nothing wider. A
              // placement's own label is what tells two Toilets apart.
              catalogRooms: (deptNode.rooms ?? []).map((roomNode) => ({
                instance_id: roomNode.instance_id,
                // >>> `.name`. resolveRoomLabel returns { name, source,
                // >>> inherited } — the panels need the source to ink an
                // >>> inherited name muted, and nothing here does. Taking the
                // >>> whole object put it in a React child and whited the tab
                // >>> out the moment a room was drawn.
                label: resolveRoomLabel(roomNode, null, nameOf(rooms, roomNode.room_def_id, 'Unnamed room')).name,
              })),
              questions: (deptEntry?.questions ?? []).map((question) => ({
                kind: 'question',
                id: question.instance_id,
                sectionId: section.id,
                groupId,
                deptId,
                question,
                sets: questionRoomSets(question),
              })),
              // A ROOM IS USED ONCE PER DEPARTMENT. Which question and which
              // set spoke for it is what the picker greys a row with and says
              // on hover — "already used" alone leaves you hunting for where.
              usage: roomUsage(deptEntry?.questions ?? []),
            }
          }),
        }
      }),
    }))
}

// The node a selection names, or null. Ids are unique across the whole model —
// a section's row id, then instance_ids all the way down — so one string is
// enough and no caller has to say which level it means.
export function locate(model, id) {
  if (!id) return null
  for (const section of model) {
    if (section.id === id) return { node: section, section, group: null, department: null }
    for (const group of section.groups) {
      if (group.id === id) return { node: group, section, group, department: null }
      for (const department of group.departments) {
        if (department.id === id) return { node: department, section, group, department }
        for (const question of department.questions) {
          if (question.id === id) return { node: question, section, group, department }
        }
      }
    }
  }
  return null
}

// EVERY FIGURE THIS QUESTIONNAIRE WILL HAVE, as driver candidates — a
// supporting department's rule is one of these times a coefficient.
//
// A question asks no number of its own, so there are exactly two kinds. A ROOM
// SET some question counts is the common one: "Laundry = 2.5 × beds" is a
// statement about how many beds there are. A GATE's number is the other — a
// headline total for the brief. The SET is the unit rather than the room,
// because the set is what carries the counter.
export function driverOptions(model) {
  const out = []
  const seen = new Set()

  model.forEach((section) =>
    section.groups.forEach((group) => {
      if (group.gate?.number) {
        out.push({
          id: group.id,
          kind: 'gate',
          name: group.gate.number.label || group.gate.prompt || group.name,
          path: `${section.name} → ${group.name}`,
        })
      }
      group.departments.forEach((department) =>
        department.questions.forEach((node) =>
          node.sets.forEach((set) => {
            if (seen.has(set.instance_id)) return
            seen.add(set.instance_id)
            out.push({
              id: set.instance_id,
              kind: 'room set',
              name: setLabel(set, department),
              path: `${section.name} → ${group.name} → ${department.name} → ${
                node.question.prompt || 'Untitled question'
              }`,
            })
          })
        )
      )
    })
  )
  return out
}

// WHAT A SET IS CALLED. Its own name when it has one; otherwise its single
// room's, which is the common case and the whole reason most sets go unnamed. A
// set of several with no name counts them, so a row is never blank.
export function setLabel(set, department) {
  if (set.name) return set.name
  const rooms = set.rooms ?? []
  if (rooms.length === 0) return 'Empty set'
  if (rooms.length === 1) return roomLabel(rooms[0], department)
  return `${rooms.length} rooms`
}

// A room still placed resolves to its CURRENT label, so a rename on the Tree tab
// reaches every question at once; one that has left the department falls back to
// the label frozen when it was chosen.
export function roomLabel(room, department) {
  const live = department?.catalogRooms.find((r) => r.instance_id === room.instance_id)
  return live?.label ?? (typeof room.label === 'string' ? room.label : 'Unnamed room')
}
