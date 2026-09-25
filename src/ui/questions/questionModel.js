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
  catalogObjectAreaSqft,
  catalogObjectCount,
  catalogRoomAreaSqft,
  compareSections,
  deptRoomGroups,
  readRoomGroups,
  resolveRoomLabel,
} from '../../data/tree.js'
import {
  connectionFormula,
  connectionObjectFormula,
  connectionRoomFormula,
  connectionRooms,
  departmentConnections,
  departmentQuestions,
  departmentRole,
  questionVariable,
  departmentVariables,
  generalQuestions,
  generalVariableNames,
  departmentTitle,
  isNumericKind,
  memberVariableName,
  questionConnections,
  slugVariable,
  uniqueVariableName,
  sectionClinical,
  CLINICAL_VAR,
  GROUP_VAR,
  QUESTION_VAR,
  ROOM,
  ROOM_GROUP,
  FUNCTIONING,
  SUPPORTING,
} from '../../data/questionnaire.js'
import { compileFormula } from '../../data/formula.js'
import { factorValue, GROSSING } from '../../data/factors.js'
import { DMG_COLUMN, tagInScope } from '../../data/dmg.js'

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
// A ROOM'S OBJECTS, EACH WITH ITS OWN RULE over the same names the room's rule
// reads — see OBJECTS in data/questionnaire.js. The list is the CATALOG's, so an
// object placed on the Tree tab tomorrow simply appears with no rule yet, and one
// deleted takes its row with it while its key sits in the document unread.
//
// `formula` and `compiled` on the room itself are the room's OWN rule. Inside a
// GROUP that is the per-room entry — see A ROOM GROUP'S ROOMS in
// data/questionnaire.js; for a single-room connection the room and the
// connection are one row and one rule, so it is the connection's own.
function resolveRoom(connection, room, allowedVars, own) {
  const formula = own ? connectionFormula(connection) : connectionRoomFormula(connection, room.instance_id)
  return {
    ...room,
    formula,
    compiled: compileFormula(formula, allowedVars),
    objects: (room.objects ?? []).map((object) => {
      const objectFormula = connectionObjectFormula(connection, object.instance_id)
      return { ...object, formula: objectFormula, compiled: compileFormula(objectFormula, allowedVars) }
    }),
  }
}

// A ROOM IS COMPLETE when its own rule is written, OR when it has objects and
// every one of them is ruled — either level fully states what it builds. Only a
// blank room with even one blank object is still outstanding.
function roomComplete(room, own) {
  if (own.authored) return true
  const objects = room.objects ?? []
  return objects.length > 0 && objects.every((object) => object.compiled.authored)
}

// IS THIS ROW FINISHED? A single room is its own rule and its objects; a GROUP
// is finished when every room in it is. Every reader that counts "how much is
// still unwritten" asks this rather than `compiled.authored`.
export function connectionRuled(connection) {
  if (connection.grouped) return connection.rooms.every((room) => roomComplete(room, room.compiled))
  const room = connection.rooms?.[0] ?? connection
  return roomComplete(room, connection.compiled)
}

// A BLANK RULE IS NO COUNT, NEVER A NUMBER — for a room and for an object
// alike, and whatever is written below it.
//
// >>> AN UNRULED ROOM WHOSE OBJECTS WERE RULED COUNTED AS ONE BRIEFLY, and does
// >>> not now: blank then meant one thing at the top of a room and another
// >>> inside it, which is a rule nobody can hold in their head. A ruled OBJECT
// >>> still has its count — its rule states a number outright, and nothing about
// >>> the room it stands in changes that. The ONE place a blank is read as a
// >>> figure is a BED with no rule, which is worth one per room, and that lives
// >>> in the bed tally alone: see bedsIn in useTestRun.jsx.

// EVERYTHING INSIDE ONE FUNCTIONING DEPARTMENT THAT A RULE MAY COUNT, each named
// by ITS WHOLE PATH DOWN THE TREE — no level skipped, ever:
//
//   emergency.patient_care                        the department's AREA
//   emergency.patient_care.recovery               a room in it
//   emergency.patient_care.theatre_set            a room group — how many SETS
//   emergency.patient_care.theatre_set.scrub_bay  a room inside that set
//   emergency.patient_care.recovery.monitor       an object in a room
//
// A PATH IS THE ONE RULE WITH NO EXCEPTIONS. Naming an object under its
// department rather than its room was shorter and it was wrong: the name then
// says something the tree does not, and the moment two rooms hold the same
// object there is nowhere for the difference to live. Length is what completion
// is for.
//
// Read off the CATALOG NODE rather than off the sibling's model entry: the
// departments of a group are mapped after this and cannot see each other.
// EVERYTHING STANDING IN A ROOM — its objects, then its equipment — each with
// the definition row it names. Equipment is a second list on the room node only
// because a def id must say which table it points at (panelParts.jsx); to a rule
// it is one more thing in the room. Keyed by `instance_id` like an object, which
// is unique across the tree, so a connection's `objects` map holds both.
function standingIn(roomNode, objectDefs, equipmentDefs) {
  return [
    ...(roomNode.objects ?? []).map((node) => ({ node, def: defOf(objectDefs, node.object_def_id), equipment: false })),
    ...(roomNode.equipment ?? []).map((node) => ({ node, def: defOf(equipmentDefs, node.equipment_def_id), equipment: true })),
  ]
}

function memberVariables(deptPath, deptNode, roomDefs, objectDefs, equipmentDefs) {
  const out = []
  const add = (kind, targetId, path, label) => out.push({ kind, targetId, label, name: path })

  const roomIn = (parentPath, roomNode) => {
    const label = resolveRoomLabel(roomNode, null, defOf(roomDefs, roomNode.room_def_id)?.name || 'Unnamed room').name
    const path = memberVariableName(parentPath, label)
    add('room', roomNode.instance_id, path, label)
    standingIn(roomNode, objectDefs, equipmentDefs).forEach(({ node, def, equipment }) => {
      const name = def?.name || (equipment ? 'Unnamed equipment' : 'Unnamed object')
      add('object', node.instance_id, memberVariableName(path, name), name)
    })
  }

  // The list as the Tree tab draws it, so a room group is a level and the rooms
  // inside it hang off that — the same walk every other reader of the grouping
  // makes. `keepEmpty`, because an empty group is still a name that resolves.
  readRoomGroups(deptNode.rooms ?? [], deptRoomGroups(deptNode), { keepEmpty: true }).forEach((row) => {
    if (row.kind === 'room') return roomIn(deptPath, row.room)
    const label = row.group.name || 'Untitled group'
    const path = memberVariableName(deptPath, label)
    add('roomGroup', row.group.instance_id, path, label)
    ;(row.rooms ?? []).forEach((roomNode) => roomIn(path, roomNode))
  })

  // AMBIGUOUS IS NOT USABLE. Both sides of a collision are marked, and every
  // reader — the scope, the completion list, the help — drops them; the panel is
  // the one place they still appear, in red, saying what to rename.
  const times = new Map()
  out.forEach((v) => times.set(v.name, (times.get(v.name) ?? 0) + 1))
  return out.map((v) => ({ ...v, duplicate: times.get(v.name) > 1 }))
}

function resolveConnection(connection, catalogGroups, catalogRooms, allowedVars) {
  const compiled = compileFormula(connectionFormula(connection), allowedVars)

  if (connection.kind === ROOM_GROUP) {
    const live = catalogGroups.find((g) => g.instance_id === connection.instance_id)
    return {
      ...connection,
      // A GROUP'S OWN RULE IS HOW MANY OF THE SET THERE ARE, and it MULTIPLIES
      // the per-room rules under it — see A ROOM GROUP'S ROOMS in
      // data/questionnaire.js. Unwritten is one, not none.
      compiled,
      grouped: true,
      // THE STORED MAP, KEPT UNDER ITS OWN NAME. `rooms` below is the drawn
      // list and overwrites it, so without this the document's room rules are
      // invisible to anything writing the connection back — and the next edit
      // of one rule would wipe every other.
      roomRules: connectionRooms(connection),
      name: live?.name || connection.label || 'Unnamed group',
      rooms: (live?.rooms ?? []).map((room) => resolveRoom(connection, room, allowedVars, false)),
      missing: !live,
    }
  }
  const live = catalogRooms.find((r) => r.instance_id === connection.instance_id)
  return {
    ...connection,
    compiled,
    grouped: false,
    name: live?.label ?? (typeof connection.label === 'string' ? connection.label : 'Unnamed room'),
    rooms: (live ? [live] : []).map((room) => resolveRoom(connection, room, allowedVars, true)),
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
export function buildModel({ buildingId, definition, sections, groups, departments, rooms, objects = [], equipment = [] }) {
  // THE GENERAL NAMES ARE IN SCOPE EVERYWHERE, so they are worked out before the
  // walk and handed to every compile in it. They are the AUTHORED list, never
  // what currently resolves — compileFormula's rule — so an unanswered general
  // question is a name that compiles and reads as unresolved, not a syntax
  // error that zeroes the department around it.
  const reserved = generalVariableNames()
  const clashes = questionVariableClashes({ buildingId, definition, sections, reserved: [...reserved, CLINICAL_VAR] })
  // A QUESTION'S NAMED x IS IN SCOPE EVERYWHERE TOO, beside the general names —
  // except a clashing one, which is left out so a rule naming it reads as
  // unresolved rather than as whichever question came first.
  const named = [...clashes.names].filter((name) => !clashes.reasons.has(name))
  // A CLINICAL SECTION SEES ONLY CLINICAL NAMES: no total_clinical_area, and no
  // other section's x — see CLINICAL_VAR. Everything else sees all of it, and
  // total_clinical_area only once some section is marked.
  const anyClinical = sections.some((s) => s.building_id === buildingId && sectionClinical(definition, s.id))
  const generalFor = (clinical) =>
    clinical
      ? [...reserved, ...named.filter((name) => clashes.clinical.has(name))]
      : [...reserved, ...named, ...(anyClinical ? [CLINICAL_VAR] : [])]
  return [
    generalSection(definition),
    ...resolveVariables(
      walk({ buildingId, definition, sections, groups, departments, rooms, objects, equipment, generalFor, clashes })
    ),
  ]
}

// EVERY NAMED QUESTION IN THE BUILDING, and which names are unusable: used by two
// questions, or taken by `x`, `a` or a General answer. Read before the walk,
// because every compile in it needs the whole building's list. Only catalog
// departments that are functioning count — a supporting one asks nothing.
function questionVariableClashes({ buildingId, definition, sections, reserved }) {
  const times = new Map()
  // The names asked in a clinical section — the only ones a clinical rule reads.
  const clinical = new Set()
  sections
    .filter((s) => s.building_id === buildingId)
    .forEach((section) =>
      (section.tree?.groups ?? []).forEach((groupNode) =>
        (groupNode.departments ?? []).forEach((deptNode) => {
          const args = [definition, section.id, groupNode.instance_id, deptNode.instance_id]
          if (departmentRole(...args) === SUPPORTING) return
          departmentQuestions(...args).forEach((q) => {
            const name = questionVariable(q)
            if (name) times.set(name, (times.get(name) ?? 0) + 1)
            if (name && sectionClinical(definition, section.id)) clinical.add(name)
          })
        })
      )
    )
  const taken = new Set([QUESTION_VAR, GROUP_VAR, ...reserved])
  const reasons = new Map()
  times.forEach((n, name) => {
    if (taken.has(name)) reasons.set(name, `“${name}” is reserved`)
    else if (n > 1) reasons.set(name, `“${name}” is used by ${n} questions`)
  })
  return { names: new Set(times.keys()), reasons, clinical }
}

// GENERAL IS A SECTION, AND THE FIRST ONE. It hangs off no catalog node — see
// GENERAL in data/questionnaire.js — so it is built here rather than in the
// walk, and it carries `groups: []` so that everything reading the model as a
// list of sections goes on working without knowing about it.
export const GENERAL_SECTION = 'general'

function generalSection(definition) {
  return {
    kind: 'general',
    id: GENERAL_SECTION,
    sectionId: GENERAL_SECTION,
    name: 'General',
    functionId: null,
    groups: [],
    questions: generalQuestions(definition).map((question) => ({
      kind: 'general-question',
      id: question.id,
      sectionId: GENERAL_SECTION,
      question,
      variable: question.variable,
      unit: question.unit ?? '',
      numeric: isNumericKind(question.kind),
      // Whether this answer is one the run checks itself against — see BEDS in
      // data/questionnaire.js.
      tally: question.tally ?? null,
    })),
  }
}

function walk({ buildingId, definition, sections, groups, departments, rooms, objects, equipment, generalFor, clashes }) {
  return sections
    .filter((s) => s.building_id === buildingId)
    .sort(compareSections)
    .map((section) => {
      const clinical = sectionClinical(definition, section.id)
      const general = generalFor(clinical)
      return {
      kind: 'section',
      id: section.id,
      sectionId: section.id,
      name: section.name || 'Untitled section',
      // Evaluated before every other section — see CLINICAL_VAR.
      clinical,
      // sp_section.is_core — the building's core, which the run hands the
      // floor-area factor's share to (grossedAreas in useTestRun.jsx).
      isCore: !!section.is_core,
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
          // The catalog node itself, so a sibling's rooms and objects can be
          // named without waiting for its own model entry — the departments are
          // mapped after this and cannot see each other.
          node: n,
        }))
        const scaleOff = siblings.filter((s) => s.role !== SUPPORTING)
        return {
          kind: 'group',
          id: groupId,
          sectionId: section.id,
          groupId,
          name: nameOf(groups, groupNode.group_def_id, 'Untitled group'),
          functionId: defOf(groups, groupNode.group_def_id)?.function_id ?? null,
          // The group definition's DMG, null for every facility — data/dmg.js.
          dmgId: defOf(groups, groupNode.group_def_id)?.[DMG_COLUMN] ?? null,
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
                // WHAT STANDS IN IT, each a row that may carry a rule of its
                // own. `count` is the catalog's — what one of that room holds —
                // and is shown beside the rule rather than read by it.
                // Equipment included — see standingIn.
                objects: standingIn(roomNode, objects, equipment).map(({ node, def, equipment: isEquipment }) => ({
                  instance_id: node.instance_id,
                  name: def?.name || (isEquipment ? 'Unnamed equipment' : 'Unnamed object'),
                  equipment: isEquipment,
                  count: catalogObjectCount(node),
                  // A FACT ABOUT THE DEFINITION, read live like every name here:
                  // marking a bed in sp_object reaches every placement of it at
                  // once, and the run's bed tally with it. Strictly true, since
                  // the column is nullable and absent until the SQL is run.
                  // sp_equipment has no such column, so equipment is never a bed.
                  isBed: def?.is_bed === true,
                  // WHAT ONE OF IT TAKES UP — this placement's own area_sqft, or
                  // the definition's generic figure. It is what a room with NO
                  // area of its own is measured by — see roomAreaSqft in
                  // useTestRun.jsx.
                  areaSqft: catalogObjectAreaSqft(node, def),
                })),
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

            // A QUESTION'S RULES SEE ITS OWN NUMBER, `x`, THE GENERAL ANSWERS,
            // AND EVERY OTHER QUESTION'S NAMED x — see questionVariable.
            //
            // A DUMMY IS NEVER ASKED AND HAS NO x: its rules are written over the
            // other names in scope alone, and build whenever its group is open.
            // `x` is left out of its compile, so a rule still naming it reads as
            // broken rather than as quietly unresolved. Absent is a real question.
            const questions = (deptEntry?.questions ?? []).map((question) => {
              const dummy = question.dummy === true
              return {
                kind: 'question',
                id: question.instance_id,
                sectionId: section.id,
                groupId,
                deptId,
                question,
                dummy,
                // No answer, so nothing for another rule to read under its name.
                variable: dummy ? null : questionVariable(question),
                // Why this question's name is not in scope, or null when it is.
                variableClash: dummy ? null : clashes.reasons.get(questionVariable(question)) ?? null,
                unit: typeof question.unit === 'string' ? question.unit : '',
                connections: questionConnections(question).map((c) =>
                  resolveConnection(c, catalogGroups, catalogRooms, dummy ? general : [QUESTION_VAR, ...general])
                ),
              }
            })

            // THE VARIABLES ARE THE GROUP'S FUNCTIONING DEPARTMENTS, always and
            // automatically — a supporting department serves the group it sits
            // in, so which ones it scales off is not a choice. The document
            // stores only a NAME somebody changed; the list itself is the
            // catalog's, so a department added to the group tomorrow is in scope
            // without anything being re-authored.
            const overrides = departmentVariables(definition, section.id, groupId, deptId)
            const taken = []
            // `a` FIRST, and it is not authored at all: the group summed, the
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
            // ONE LEVEL IN, under each sibling: its rooms, room groups and
            // objects, as COUNTS where the department's own name is an area.
            // They hang off the department they belong to rather than sitting in
            // one long list, because the name says so and the panel reads the
            // same way round.
            // THE DEPARTMENT GROUP LEADS EVERY NAME. A department name is not
            // unique in a building and a path that starts at the department says
            // less than the tree does; this way one name is one place, read the
            // same way down as the outline is.
            const groupSlug = slugVariable(nameOf(groups, groupNode.group_def_id, 'group'))
            const members = []
            variables.push(...scaleOff.map((sibling) => {
              const stored = overrides.find((v) => v.instance_id === sibling.instance_id)
              // A STORED NAME IS SOMEBODY'S OWN and is left exactly as written —
              // it predates all of this, and rewriting it would break the rules
              // that already use it. Nothing writes a new one.
              const name = uniqueVariableName(
                stored?.name || memberVariableName(groupSlug, sibling.name),
                taken
              )
              taken.push(name)
              members.push(
                ...memberVariables(name, sibling.node, rooms, objects, equipment).map((m) => ({
                  ...m,
                  deptInstanceId: sibling.instance_id,
                  deptLabel: sibling.name,
                }))
              )
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
            // A DUPLICATE IS NOT A NAME. It is left out of what compiles, so a
            // rule reaching for it reads as unresolved rather than quietly
            // counting whichever of the two came first in the array.
            const variableNames = [
              ...variables.map((v) => v.name),
              ...members.filter((m) => !m.duplicate).map((m) => m.name),
              ...general,
            ]

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
              // The catalog node's grossing factor, for the run's DISPLAYED areas
              // only — the rules still read net (see netAreaOf in useTestRun.jsx).
              grossingFactor: factorValue(GROSSING, deptNode),
              // What the run heads its chips with; null means `name`.
              title: departmentTitle(definition, section.id, groupId, deptId),
              catalogRooms,
              catalogGroups,
              catalogTargets,
              questions,
              // Supporting only, and both empty for a functioning department —
              // they are kept, unread, so switching the role back is not
              // destructive, exactly as the questions are.
              variables,
              // What a rule may count one level in — see memberVariables. Empty
              // for a functioning department, like `variables` itself.
              members,
              connections: supportingConnections,
              // A ROOM IS USED ONCE PER DEPARTMENT. Which question spoke for it,
              // and through which group, is what the picker greys a row with and
              // says on hover — "already used" alone leaves you hunting for it.
              usage: roomUsage(questions),
            }
          }),
        }
      }),
      }
    })
}

// THE MODEL AS ONE RUN ASKS IT: groups outside the DMGs answered are gone, and
// a section they emptied goes with them. Filtered here, once, so the deck, the
// rail, the evaluation and side cannot disagree about what is asked. General is
// always first and never filtered, which is what keeps the card you answer this
// on in its place when the deck behind it changes.
export function scopeToDmgs(model, dmgIds) {
  if (!Array.isArray(dmgIds)) return model
  return model
    .map((section) => {
      if (section.kind === 'general') return section
      const groups = section.groups.filter((g) => tagInScope(g.dmgId, dmgIds))
      if (groups.length === 0 && section.groups.length > 0) return null
      return { ...section, groups }
    })
    .filter(Boolean)
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
          // `a` is the group, not a department — there is nothing to look up
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
    // General's questions hang off the section itself; every other section's are
    // four levels down.
    for (const question of section.questions ?? []) {
      if (question.id === id) return { node: question, section, group: null, department: null }
    }
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
