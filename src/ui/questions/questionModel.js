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

import {
  catalogRoomAreaSqft,
  compareSections,
  deptRoomGroups,
  readRoomGroups,
  resolveRoomLabel,
} from '../../data/tree.js'
import {
  connectionFormula,
  departmentConnections,
  departmentRole,
  departmentVariables,
  questionConnections,
  slugVariable,
  uniqueVariableName,
  GROUP_VAR,
  QUESTION_VAR,
  ROOM,
  ROOM_GROUP,
  FUNCTIONING,
  SUPPORTING,
} from '../../data/questionnaire.js'
import { compileFormula } from '../../data/formula.js'

export { FUNCTIONING, SUPPORTING }

const defOf = (defs, id) => defs.find((d) => d.id === id) ?? null
const nameOf = (defs, id, fallback) => defOf(defs, id)?.name || fallback

// A CONNECTION RESOLVED AGAINST THE CATALOG: what it is called now, the rooms it
// brings, and its rule COMPILED — once here, not per keystroke and not per
// render. A room group's membership is the Tree tab's to state, so it is read
// live: dissolve the group there and this reads as gone rather than quietly
// keeping a list nobody can see.
//
// `allowedVars` is the AUTHORED list, never what resolves — see compileFormula.
function resolveConnection(connection, catalogGroups, catalogRooms, allowedVars) {
  const compiled = compileFormula(connectionFormula(connection), allowedVars)

  if (connection.kind === ROOM_GROUP) {
    const live = catalogGroups.find((g) => g.instance_id === connection.instance_id)
    return {
      ...connection,
      compiled,
      name: live?.name || connection.label || 'Unnamed group',
      rooms: live?.rooms ?? [],
      missing: !live,
    }
  }
  const live = catalogRooms.find((r) => r.instance_id === connection.instance_id)
  return {
    ...connection,
    compiled,
    name: live?.label ?? (typeof connection.label === 'string' ? connection.label : 'Unnamed room'),
    rooms: live ? [live] : [],
    missing: !live,
  }
}

// roomInstanceId -> { questionId, prompt, via }. First writer wins, which is the
// same answer the picker enforces: nothing can become used twice. A group's
// members count as used, or a room could be taken twice — once on its own and
// once inside the group that holds it.
function roomUsage(questions) {
  const used = new Map()
  questions.forEach((question) =>
    question.connections.forEach((connection) =>
      connection.rooms.forEach((room) => {
        if (used.has(room.instance_id)) return
        used.set(room.instance_id, {
          questionId: question.id,
          prompt: question.question.prompt || 'Untitled question',
          connectionId: connection.instance_id,
          via: connection.kind === ROOM_GROUP ? connection.name : '',
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
  return resolveVariables(walk({ buildingId, definition, sections, groups, departments, rooms }))
}

function walk({ buildingId, definition, sections, groups, departments, rooms }) {
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
        // WHAT A SUPPORTING DEPARTMENT IN THIS GROUP SCALES OFF: every
        // FUNCTIONING department beside it. Read before the departments are
        // mapped, because each supporting one needs all of its siblings.
        const siblings = (groupNode.departments ?? []).map((n) => ({
          instance_id: n.instance_id,
          name: nameOf(departments, n.department_def_id, 'Untitled department'),
          role: departmentRole(definition, section.id, groupId, n.instance_id),
        }))
        const scaleOff = siblings.filter((s) => s.role !== SUPPORTING)
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
            // Every room this department PLACES, in the catalog's order — what a
            // question here may connect to, and nothing wider. A placement's own
            // label is what tells two Toilets apart.
            const catalogRooms = (deptNode.rooms ?? []).map((roomNode) => {
              const def = defOf(rooms, roomNode.room_def_id)
              return {
                instance_id: roomNode.instance_id,
                // >>> `.name`. resolveRoomLabel returns { name, source,
                // >>> inherited } — the panels need the source to ink an
                // >>> inherited name muted, and nothing here does. Taking the
                // >>> whole object put it in a React child and whited the tab
                // >>> out the moment a room was drawn.
                label: resolveRoomLabel(roomNode, null, def?.name || 'Unnamed room').name,
                // WHAT A SUPPORTING DEPARTMENT'S VARIABLES ARE SUMMED FROM.
                // Resolved here because this is the one place the room node and
                // its definition row are both in hand; the run holds neither.
                areaSqft: catalogRoomAreaSqft(roomNode, def),
              }
            })
            const roomById = new Map(catalogRooms.map((r) => [r.instance_id, r]))
            // THE CATALOG'S OWN GROUPING, read live off the tree node. A group
            // split by a rearrangement comes back as two runs; they merge here,
            // since a question names the group and not a run of it.
            const catalogGroups = []
            // THE ROOM LIST AS THE TREE TAB DRAWS IT — a group is one row and
            // an ungrouped room is its own. This is what a supporting
            // department is sized by, one rule per row, so nothing may appear
            // twice: a grouped room is spoken for by its group.
            const catalogTargets = []
            readRoomGroups(deptNode.rooms ?? [], deptRoomGroups(deptNode), { keepEmpty: true }).forEach((row) => {
              if (row.kind === 'room') {
                const room = roomById.get(row.room.instance_id)
                if (room) catalogTargets.push({ kind: ROOM, instance_id: room.instance_id, name: room.label, rooms: [room] })
                return
              }
              const members = (row.rooms ?? []).map((r) => roomById.get(r.instance_id)).filter(Boolean)
              const existing = catalogGroups.find((g) => g.instance_id === row.group.instance_id)
              if (existing) {
                existing.rooms.push(...members)
                return
              }
              const group = {
                instance_id: row.group.instance_id,
                name: row.group.name || 'Unnamed group',
                rooms: members,
              }
              catalogGroups.push(group)
              catalogTargets.push({ kind: ROOM_GROUP, ...group })
            })

            // A QUESTION'S RULES SEE ONE NAME: x, its own answered number. A
            // rule is a statement about the thing its question counts, and
            // nothing else can reach in and change it.
            const questions = (deptEntry?.questions ?? []).map((question) => ({
              kind: 'question',
              id: question.instance_id,
              sectionId: section.id,
              groupId,
              deptId,
              question,
              unit: typeof question.unit === 'string' ? question.unit : '',
              connections: questionConnections(question).map((c) =>
                resolveConnection(c, catalogGroups, catalogRooms, [QUESTION_VAR])
              ),
            }))

            // THE VARIABLES ARE THE GROUP'S FUNCTIONING DEPARTMENTS, always and
            // automatically — a supporting department serves the group it sits
            // in, so which ones it scales off is not a choice. The document
            // stores only a NAME somebody changed; the list itself is the
            // catalog's, so a department added to the group tomorrow is in scope
            // without anything being re-authored.
            const overrides = departmentVariables(definition, section.id, groupId, deptId)
            const taken = []
            // `area` FIRST, and it is not authored at all: the group summed, the
            // number most rules are written against. The names after it are the
            // same figure broken up, for the rule that has to weight them.
            const variables = [
              {
                name: GROUP_VAR,
                kind: 'group',
                instance_id: groupId,
                label: nameOf(groups, groupNode.group_def_id, 'this group'),
                derived: true,
              },
            ]
            variables.push(...scaleOff.map((sibling) => {
              const stored = overrides.find((v) => v.instance_id === sibling.instance_id)
              const name = uniqueVariableName(stored?.name || slugVariable(sibling.name), taken)
              taken.push(name)
              return { name, kind: 'department', instance_id: sibling.instance_id, label: sibling.name }
            }))
            // A name written against a department that has since left the group —
            // or become supporting itself. Kept so the rules naming it still
            // compile and read as unresolved rather than as a syntax error.
            overrides
              .filter((v) => !scaleOff.some((s) => s.instance_id === v.instance_id))
              .forEach((v) => {
                const name = uniqueVariableName(v.name, taken)
                taken.push(name)
                variables.push({ ...v, name, orphaned: true })
              })
            const variableNames = variables.map((v) => v.name)

            // EVERY ROW THE CATALOG HAS, ALWAYS — a supporting department sizes
            // all of its rooms, so the list is the catalog's and the document
            // only says which of them have a rule yet. Nothing is added or
            // removed here; a room placed on the Tree tab tomorrow simply
            // appears, which a stored list would not do.
            const stored = departmentConnections(deptEntry)
            const supportingConnections = [
              ...catalogTargets.map((target) =>
                resolveConnection(
                  stored.find((c) => c.instance_id === target.instance_id) ??
                    { kind: target.kind, instance_id: target.instance_id, label: target.name, formula: '' },
                  catalogGroups,
                  catalogRooms,
                  variableNames
                )
              ),
              // A rule written against something since deleted from the catalog.
              // Kept, and drawn as missing: somebody's work, and silently
              // dropping it would be the one way to lose a rule without saying.
              ...stored
                .filter((c) => !catalogTargets.some((t) => t.instance_id === c.instance_id))
                .map((c) => resolveConnection(c, catalogGroups, catalogRooms, variableNames)),
            ]

            return {
              kind: 'department',
              id: deptId,
              sectionId: section.id,
              groupId,
              deptId,
              name: nameOf(departments, deptNode.department_def_id, 'Untitled department'),
              functionId: defOf(departments, deptNode.department_def_id)?.function_id ?? null,
              role: departmentRole(definition, section.id, groupId, deptId),
              catalogRooms,
              catalogGroups,
              catalogTargets,
              questions,
              // Supporting only, and both empty for a functioning department —
              // they are kept, unread, so switching the role back is not
              // destructive, exactly as the questions are.
              variables,
              connections: supportingConnections,
              // A ROOM IS USED ONCE PER DEPARTMENT. Which question spoke for it,
              // and through which group, is what the picker greys a row with and
              // says on hover — "already used" alone leaves you hunting for it.
              usage: roomUsage(questions),
            }
          }),
        }
      }),
    }))
}

// EVERY DEPARTMENT IN THE BUILDING, by instance_id. A variable names one
// anywhere in the building, and a building is many sections, so nothing that
// resolves one can be done inside a single section's walk.
export function departmentIndex(model) {
  const index = new Map()
  model.forEach((section) =>
    section.groups.forEach((group) =>
      group.departments.forEach((department) => index.set(department.id, { department, section, group }))
    )
  )
  return index
}

// A second pass, because an ORPHANED variable may point at a department in
// another group entirely — one that left this one, or turned supporting. Each
// gains its live name and whether it can be read at all; a derived variable is
// a functioning sibling and is always both.
function resolveVariables(model) {
  const index = departmentIndex(model)
  model.forEach((section) =>
    section.groups.forEach((group) =>
      group.departments.forEach((department) => {
        if (department.variables.length === 0) return
        department.variables = department.variables.map((variable) => {
          // `area` is the group, not a department — there is nothing to look up
          // and it can never be missing.
          if (variable.kind === 'group') {
            return { ...variable, liveName: variable.label, path: null, missing: false, unsupported: false }
          }
          const found = index.get(variable.instance_id)
          return {
            ...variable,
            // The frozen label is what a variable whose department has been
            // deleted still reads as — sp_path's device, as everywhere here.
            liveName: found?.department.name ?? (typeof variable.label === 'string' ? variable.label : ''),
            path: found ? `${found.section.name} → ${found.group.name}` : null,
            missing: !found,
            unsupported: found?.department.role === SUPPORTING,
          }
        })
      })
    )
  )
  return model
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


// A room still placed resolves to its CURRENT label, so a rename on the Tree tab
// reaches every question at once; one that has left the department falls back to
// the label frozen when it was chosen.
export function roomLabel(room, department) {
  const live = department?.catalogRooms.find((r) => r.instance_id === room.instance_id)
  return live?.label ?? (typeof room.label === 'string' ? room.label : 'Unnamed room')
}
