// THE QUESTIONNAIRE DESIGNER — sp_questionnaire.definition
// ========================================================
//
// One row per building. The document is an OVERLAY ON THE CATALOG TREE, not a
// structure of its own: the sections, the department groups and the departments
// all come from sp_section.tree, and this column says only what has been
// AUTHORED against them. So it is keyed maps, never arrays of copied nodes.
//
//   {
//     "sections": {
//       "<sp_section.id>": {
//         "groups": {
//           "<group instance_id>": {
//             "gate": { "prompt": "...", "number": {…}|null, "comment": "" },
//             "departments": {
//               "<department instance_id>": {
//                 "role": "supporting",        <- ABSENT MEANS FUNCTIONING
//                 "driver": {…},               <- supporting only, see below
//                 "variables": [{…}],          <- supporting only, see below
//                 "questions": [{
//                   "instance_id": "...",
//                   "prompt": "How many beds?",
//                   "unit": "beds",          <- what the one number IS
//                   "comment": "",
//                   "connections": [         <- THE FOLLOW-UP, always this
//                     { "kind": "room_group",   <- or "room"
//                       "instance_id": "...",   <- a CATALOG id, see below
//                       "label": "3 Tesla",     <- frozen, display-only
//                       "formula": "ceil(x/4)" } <- HOW MANY, see FORMULAS
//                   ]
//                 }]
//               }
//             }
//           }
//         }
//       }
//     }
//   }
//
// THE GRAMMAR
//
//   section        from the catalog. Read in order, top to bottom.
//   group          from the catalog, and it carries ONE question — the gate.
//                  Yes opens the departments under it and adds nothing itself.
//   department     from the catalog, and it is one of TWO KINDS:
//     functioning  carries the questions. EACH ASKS ONE NUMBER — x — and names
//                  which rooms of that department it connects to, each with a
//                  FORMULA over x saying how many of that room x buys.
//     supporting   carries no questions. It names other departments as
//                  VARIABLES, and each of its own rooms carries a formula over
//                  their AREAS.
//
// The role lives HERE and not on the tree node because a building may have more
// than one questionnaire in future, and the same department can be functioning
// in one brief and supporting in another. Absence means functioning: a
// department is programmed by asking about it, and being sized by a rule is the
// departure.
//
// A QUESTION ASKS ONE NUMBER, AND EVERY ROOM IS A FUNCTION OF IT. There is no
// yes/no on a question and no counter typed by hand — 0 is the no, and the
// formulas are the brief's real content:
//
//   How many beds?                       [ 10 ]     <- the ONE answer, x
//     resuscitation bay   ceil(x/4)         3
//     patient ward        ceil(x/10)        1
//     toilet - patient    2                 2       <- a constant is a rule too
//
//   >>> THE COUNTER IS A READING, NOT AN INPUT. This reverses the earlier
//   >>> "don't add a number back onto a question": the number IS the question
//   >>> now, and the yes/no went in its place. A brief states one figure and
//   >>> everything else falls out of it.
//
// The rules themselves are data/formula.js, which is the ONE evaluator — the
// engine that turns answers into an sp_option.data calls it rather than writing
// its own. An ABSENT formula is "nobody has written a rule", drawn as such and
// contributing nothing; it is never read as 0.
//
// A CONNECTION IS A CATALOG ROOM GROUP OR A SINGLE ROOM, answered by one number
// — two of a 3 Tesla MRI is two of each room in the group. The grouping is
// sp_section.tree's `room_groups`, authored on the Tree tab (see ROOM GROUPS in
// data/tree.js), and this document only POINTS at one.
//
//   >>> THE QUESTIONNAIRE OWNS NO GROUPING OF ITS OWN. It had one briefly —
//   >>> authored "room sets" — and that was two places to say which rooms belong
//   >>> together, drifting apart the moment the catalog was rearranged. A group
//   >>> is a fact about the department; a question names one.
//
// Two MRI machines differ by the SIZE OF THE ROOMS they need, which is why a
// connection is a room and never an object — an object target would be a second
// way to say what the room already says. Both were proposed and both were
// dropped; don't add either back.
//
// A connection points inside the question's OWN department, never elsewhere, and
// A ROOM IS USED ONCE PER DEPARTMENT: once a question has it — on its own or
// inside a group — no other connection and no other question in that department
// may take it. The answer is not stored here: this document is the form, not the
// filled-in copy.
//
// A SUPPORTING DEPARTMENT NAMES OTHER DEPARTMENTS AS VARIABLES:
//
//   variables: [{ name: "ipd",          <- AUTHORED and stable, see below
//                 kind: "department",
//                 instance_id: "...",   <- a department in this building
//                 label: "IPD" }]       <- frozen, display-only
//
// The LIST is not stored — it is every FUNCTIONING department in this one's own
// group, read off the catalog — and only a name somebody changed is. Beside them
// is `area`, the whole group summed, which is what most rules want; the
// per-department names are for the rule that has to weight them.
//
//   sorting room    ceil(area/750)
//   linen store     ceil((ipd*0.4 + icu)/900)
//
// A VARIABLE IS THAT DEPARTMENT'S NET ROOM AREA IN m², as the run has built it.
// Net, because a rule is written against rooms someone can count and a grossing
// factor edited on the Tree tab would otherwise move every supporting department
// silently. m² ALWAYS, whatever the reader's area toggle says: that toggle is
// per-browser, so a variable following it would make one stored formula mean two
// different things to two readers.
//
//   >>> THE NAME IS AUTHORED, NOT POSITIONAL. a1/a2 silently change meaning when
//   >>> one is removed. It is seeded from the department's name — slugged,
//   >>> because "24×7 Pharmacy" is not an identifier — and renaming it does NOT
//   >>> rewrite the formulas: they then name something unknown and READ as
//   >>> broken, where a silent rewrite would not.
//
// >>> `driver` IS RETIRED. A supporting department was sized by one driver times
// >>> a coefficient; those keys are left in place, UNREAD, never deleted — the
// >>> precedent the old root-level `groups` array set. Every such department
// >>> needs its rule re-authoring, and a driver could name a COUNT where a
// >>> variable names an area only. That reach is not replaced yet.
//
// NOTHING IS KEYED BY A *_def_id. Every key is an instance_id (or a section's
// own row id), for tree.js's reason: two placements of one duplicable
// department must not merge.
//
// DANGLING KEYS ARE TOLERATED. No foreign key reaches into jsonb, so a group
// deleted from the catalog leaves its entry here forever. Nothing prunes it:
// the outline draws what the CATALOG has, so an orphan entry is simply never
// read, and a placement moved and put back finds its questions again. The
// frozen `label` / `question_prompt` strings beside each stored id are the same
// device sp_option.data.sp_path is — display-only, so a deleted target still
// reads as something.
//
// >>> THE OLD DOCUMENT IS A ROOT-LEVEL `groups` ARRAY, from the free-form
// >>> designer this replaced. It cannot be migrated — its groups were authored
// >>> headings with no catalog node to attach to. Every writer below SPREADS
// >>> the existing definition, so that key is carried through untouched rather
// >>> than overwritten; it is unread, not destroyed.
//
// Everything is a pure function over a plain object except writeQuestionnaire.

import { supabase } from './supabase.js'

export const EMPTY_DEFINITION = { sections: {} }

export const FUNCTIONING = 'functioning'
export const SUPPORTING = 'supporting'

// --- Making nodes -----------------------------------------------------------

// A QUESTION IS ONE NUMBER AND THE RULES THAT READ IT. `unit` is what that
// number is — beds, machines, chairs — and is the only thing naming x for a
// reader, so a rule can be checked against what it was written about.
export function newQuestion(prompt = 'How many?') {
  return { instance_id: crypto.randomUUID(), prompt, unit: '', comment: '', connections: [] }
}

// The number a gate may go on to ask. Nothing reads it — see the closing note.
export function newNumber(label = 'How many?') {
  return { label }
}

export function newGate(prompt) {
  return { prompt: prompt ?? '', number: null, comment: '' }
}

// --- A supporting department's variables --------------------------------------

// THE ONE VARIABLE NAME EVERY QUESTION USES. Reserved, so a supporting
// department cannot name one of its own `x` and make two rules that look alike
// mean different things.
export const QUESTION_VAR = 'x'

// THE WHOLE GROUP, SUMMED — every functioning department beside this one, in one
// number. It is what most rules want ("one sorting room per 750 m² served"), and
// the per-department names are there for the rule that has to weight them.
export const GROUP_VAR = 'area'

// A department name into something the language can read: lower case, words
// joined by _, anything else dropped, and never starting with a digit. "24×7
// Pharmacy" -> `n24_7_pharmacy`, which is ugly and editable, where `24×7` is a
// parse error the author never asked for.
export function slugVariable(name) {
  const base = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!base) return 'area'
  return /^[0-9]/.test(base) ? `n${base}` : base
}

// Unique WITHIN one supporting department's own list — two placements of the
// same sp_department in different groups are two ids with one name, so the
// collision is reachable rather than hypothetical.
export function uniqueVariableName(seed, taken) {
  const used = new Set([...taken, QUESTION_VAR, GROUP_VAR])
  if (!used.has(seed)) return seed
  let n = 2
  while (used.has(`${seed}_${n}`)) n += 1
  return `${seed}_${n}`
}

export function newVariable(name, instanceId, label) {
  return { name, kind: 'department', instance_id: instanceId, label: label ?? '' }
}

export function departmentVariables(definition, sectionId, groupId, deptId) {
  const list = deptEntry(definition, sectionId, groupId, deptId)?.variables
  return Array.isArray(list) ? list : []
}

export function setDepartmentVariables(definition, sectionId, groupId, deptId, variables) {
  return updateDeptEntry(definition, sectionId, groupId, deptId, (dept) => ({ ...dept, variables }))
}

// --- Reading ----------------------------------------------------------------

export function sectionEntry(definition, sectionId) {
  return definition?.sections?.[sectionId] ?? null
}

export function groupEntry(definition, sectionId, groupId) {
  return sectionEntry(definition, sectionId)?.groups?.[groupId] ?? null
}

export function deptEntry(definition, sectionId, groupId, deptId) {
  return groupEntry(definition, sectionId, groupId)?.departments?.[deptId] ?? null
}

// Absent means functioning — see the note above. Anything not literally
// SUPPORTING reads as functioning, so a value from a future role that this
// build does not know still draws as a department with questions rather than as
// a blank.
export function departmentRole(definition, sectionId, groupId, deptId) {
  return deptEntry(definition, sectionId, groupId, deptId)?.role === SUPPORTING ? SUPPORTING : FUNCTIONING
}

export function departmentQuestions(definition, sectionId, groupId, deptId) {
  return deptEntry(definition, sectionId, groupId, deptId)?.questions ?? []
}

// `driver` has no reader any more and deliberately no writer either — see the
// retirement note in the header. The key stays where it is.

// Every question in the document, with where it sits. Two callers: locating a
// selection without knowing which department it is in, and the driver picker,
// which offers the whole questionnaire's numbers.
export function questionIndex(definition) {
  const index = new Map()
  Object.entries(definition?.sections ?? {}).forEach(([sectionId, section]) => {
    Object.entries(section?.groups ?? {}).forEach(([groupId, group]) => {
      Object.entries(group?.departments ?? {}).forEach(([deptId, dept]) => {
        ;(dept?.questions ?? []).forEach((question) => {
          index.set(question.instance_id, { sectionId, groupId, deptId, question })
        })
      })
    })
  })
  return index
}

// --- Editing ----------------------------------------------------------------
//
// One auto-vivifying setter per level. The document is sparse — most groups have
// nothing authored against them — so an edit has to be able to write into a
// branch that does not exist yet, and every writer spreads what it found so an
// unknown key is carried through rather than dropped.

export function updateSectionEntry(definition, sectionId, updater) {
  const base = definition ?? EMPTY_DEFINITION
  const current = base.sections?.[sectionId] ?? { groups: {} }
  return { ...base, sections: { ...(base.sections ?? {}), [sectionId]: updater(current) } }
}

export function updateGroupEntry(definition, sectionId, groupId, updater) {
  return updateSectionEntry(definition, sectionId, (section) => {
    const current = section.groups?.[groupId] ?? { departments: {} }
    return { ...section, groups: { ...(section.groups ?? {}), [groupId]: updater(current) } }
  })
}

export function updateDeptEntry(definition, sectionId, groupId, deptId, updater) {
  return updateGroupEntry(definition, sectionId, groupId, (group) => {
    const current = group.departments?.[deptId] ?? { questions: [] }
    return { ...group, departments: { ...(group.departments ?? {}), [deptId]: updater(current) } }
  })
}

// --- The gate ---------------------------------------------------------------

export function setGate(definition, sectionId, groupId, gate) {
  return updateGroupEntry(definition, sectionId, groupId, (group) => ({ ...group, gate }))
}

// --- Role, and the rule that comes with it ----------------------------------

// Switching to supporting does NOT throw the questions away. A role is a
// classification, and re-classifying a department by mistake must not be
// destructive — the questions stop being drawn and come back if the role does.
// The same for the driver in the other direction.
export function setDepartmentRole(definition, sectionId, groupId, deptId, role) {
  return updateDeptEntry(definition, sectionId, groupId, deptId, (dept) => ({ ...dept, role }))
}


// --- Questions --------------------------------------------------------------

export function insertQuestion(definition, sectionId, groupId, deptId, question) {
  return updateDeptEntry(definition, sectionId, groupId, deptId, (dept) => ({
    ...dept,
    questions: [...(dept.questions ?? []), question],
  }))
}

export function removeQuestion(definition, sectionId, groupId, deptId, questionId) {
  return updateDeptEntry(definition, sectionId, groupId, deptId, (dept) => ({
    ...dept,
    questions: (dept.questions ?? []).filter((q) => q.instance_id !== questionId),
  }))
}

export function updateQuestion(definition, sectionId, groupId, deptId, questionId, updater) {
  return updateDeptEntry(definition, sectionId, groupId, deptId, (dept) => ({
    ...dept,
    questions: (dept.questions ?? []).map((q) => (q.instance_id === questionId ? updater(q) : q)),
  }))
}

// --- Connections --------------------------------------------------------------

export const ROOM_GROUP = 'room_group'
export const ROOM = 'room'

// `label` is frozen beside the id for sp_path's reason: a group dissolved or a
// room deleted on the Tree tab must still read as something. `formula` starts
// EMPTY — unauthored, not zero. Seeding it with `x` would quietly make every
// room scale one-for-one with a number nobody meant it to.
export function newConnection(kind, instanceId, label) {
  return { kind, instance_id: instanceId, label: label ?? '', formula: '' }
}

export function connectionFormula(connection) {
  return typeof connection?.formula === 'string' ? connection.formula : ''
}

// THE ONE READER of a question's follow-up, and what makes both older shapes
// keep working. A question written before this had `room_sets`, and one before
// those a flat `rooms` array; each room in either is exactly a room connection.
// An authored set of several has no catalog counterpart, so it FLATTENS to its
// rooms — the grouping it carried is the Tree tab's to state now.
export function questionConnections(question) {
  if (Array.isArray(question?.connections)) return question.connections
  const rooms = Array.isArray(question?.room_sets)
    ? question.room_sets.flatMap((set) => set?.rooms ?? [])
    : (question?.rooms ?? [])
  return rooms.map((room) => newConnection(ROOM, room.instance_id, room.label))
}

// Every room the question has spoken for DIRECTLY. A group's members are added
// by the caller, which is the only place the catalog is in hand.
export function questionRoomIds(question) {
  return questionConnections(question)
    .filter((c) => c.kind === ROOM)
    .map((c) => c.instance_id)
}

// Writing always writes `connections`, so the first edit of a question in either
// older shape settles it into the current one.
function withConnections(question, connections) {
  const next = { ...question, connections }
  delete next.rooms
  delete next.room_sets
  return next
}

export function questionWithConnection(question, connection) {
  const already = questionConnections(question).some((c) => c.instance_id === connection.instance_id)
  if (already) return question
  return withConnections(question, [...questionConnections(question), connection])
}

export function questionWithoutConnection(question, instanceId) {
  return withConnections(
    question,
    questionConnections(question).filter((c) => c.instance_id !== instanceId)
  )
}

// An INVALID formula is stored like any other. A rule half typed is work, and
// refusing it at the field would throw it away the moment focus moved.
export function questionWithFormula(question, instanceId, formula) {
  return withConnections(
    question,
    questionConnections(question).map((c) => (c.instance_id === instanceId ? { ...c, formula } : c))
  )
}

// A SUPPORTING DEPARTMENT'S OWN CONNECTIONS live beside its variables, in the
// same shape a question's do — the row, the formula and the rules for both are
// one thing, so the panel and the run draw them with one component.
export function departmentConnections(entry) {
  return Array.isArray(entry?.connections) ? entry.connections : []
}

export function setDepartmentConnections(definition, sectionId, groupId, deptId, connections) {
  return updateDeptEntry(definition, sectionId, groupId, deptId, (dept) => ({ ...dept, connections }))
}

// A SUPPORTING DEPARTMENT'S ROWS ARE THE CATALOG'S, not a list somebody picked —
// every room it places is sized by a rule, so there is nothing to choose. This
// writes a rule against one of them, adding the entry the first time and
// REMOVING it again when the rule is cleared: the document holds what has been
// authored and nothing else, so an empty rule stores no key at all.
export function connectionsWithFormula(connections, target, formula) {
  const kept = connections.filter((c) => c.instance_id !== target.instance_id)
  if (!formula.trim()) return kept
  const existing = connections.find((c) => c.instance_id === target.instance_id)
  return [
    ...kept,
    { ...(existing ?? newConnection(target.kind, target.instance_id, target.name)), formula },
  ]
}

// --- Writing ----------------------------------------------------------------

// The whole document, written whole — jsonb has no narrow write — and
// CONDITIONAL ON THE VERSION IT WAS READ AT, so a row that moved on since
// matches nothing and the caller is told.
//
// Returns { error, version }: a message and null on refusal, null and the new
// version on success.
export async function writeQuestionnaire(id, definition, atVersion) {
  if (!id || atVersion == null) {
    return { error: 'this questionnaire is not loaded yet', version: null }
  }

  const { data, error } = await supabase
    .from('sp_questionnaire')
    .update({ definition, version: atVersion + 1 })
    .eq('id', id)
    .eq('version', atVersion)
    .select('version')

  if (error) return { error: error.message, version: null }
  // Zero rows matched: either the row moved on, or the RLS policy refused a
  // non-admin. Both mean the same thing to the caller — nothing was written.
  if (!data || data.length === 0) {
    return {
      error: 'this questionnaire was changed somewhere else, or you are not an admin — reload before editing again',
      version: null,
    }
  }
  return { error: null, version: data[0].version }
}

// NOTHING WRITES AN OPTION FROM THIS DOCUMENT YET. The Test run tab answers it
// and computes what it builds — ui/questions/useTestRun.jsx — but saves nothing.
// The engine that applies the answers is still the next piece:
//
//   gate yes              open the departments in that group
//   question's number x   every connection's formula at x, in rooms
//   supporting department its variables' areas, then its own formulas
//
// Still open: what a GATE's number is for. It used to be reachable as a driver
// and now nothing can name it at all, so it is authored, answered and read by
// nobody — and with it went a supporting department's ability to be sized off a
// COUNT rather than an area. Both come back by giving a variable a `kind`. See
// Open questions in CLAUDE.md.
