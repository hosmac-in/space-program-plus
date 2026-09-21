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
//                 "questions": [{
//                   "instance_id": "...",
//                   "prompt": "Is there an MRI?",
//                   "comment": "",
//                   "room_sets": [           <- THE FOLLOW-UP, always this
//                     { "instance_id": "...",
//                       "name": "3 Tesla",   <- authored, see ROOM SETS
//                       "rooms": [{ "instance_id": "...", "label": "Console" }]
//                     }
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
//     functioning  carries the questions. Each is a yes/no; yes may ask a
//                  number, may take a comment, and names WHICH ROOMS of that
//                  department it connects to.
//     supporting   carries no questions. It is sized by a rule: one DRIVER
//                  (a question's number anywhere in this questionnaire) times a
//                  COEFFICIENT.
//
// The role lives HERE and not on the tree node because a building may have more
// than one questionnaire in future, and the same department can be functioning
// in one brief and supporting in another. Absence means functioning: a
// department is programmed by asking about it, and being sized by a rule is the
// departure.
//
// THE FOLLOW-UP TO A QUESTION IS ALWAYS ITS ROOM SETS, one counter each. So a
// question has no number of its own and no sub-questions:
//
//   Is there an MRI?                     yes/no
//     3 Tesla        [ 2 ]               a SET, and its counter
//       Therapy Room                       the rooms it brings, all at once
//       Console Room
//       Machine Room
//     5 Tesla        [ 0 ]               0 = not chosen, drawn greyed
//
// A SET IS ONE OR MORE ROOMS ANSWERED BY ONE NUMBER — two of a 3 Tesla MRI is
// two of each room in it. Most sets hold one room and read as that room; the
// set exists for the case where a thing you count is several rooms at once.
//
//   >>> THIS GROUPING IS THE QUESTIONNAIRE'S OWN. It is NOT sp_section.tree's
//   >>> `room_groups`, which is the catalog's way of boxing a long room list for
//   >>> reading, authored on the Tree tab and shared with every option. A set is
//   >>> a statement about what one answer buys, so it is authored here and lives
//   >>> nowhere else. Do not read one from the other.
//
// Two MRI machines differ by the SIZE OF THE ROOMS they need, which is why a
// set holds rooms and never points at an object — an object target would be a
// second way to say what the room already says. Both were proposed and both
// were dropped; don't add either back.
//
// A set's rooms are placements inside the question's OWN department, never
// elsewhere, and A ROOM IS USED ONCE PER DEPARTMENT: once a set has it, no
// other set and no other question in that department may take it. The counter
// is the ANSWER and is not stored here — this document is the form, not the
// filled-in copy.
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

// A QUESTION HAS NO NUMBER OF ITS OWN AND NO SUB-QUESTIONS. Its follow-up is
// always the same thing — its list of rooms, one counter each — so both were
// removed rather than left as a second way to ask "how many".
export function newQuestion(prompt = 'New question') {
  return { instance_id: crypto.randomUUID(), prompt, comment: '', rooms: [] }
}

// The number a yes may go on to ask. Its answer is the count of the rooms this
// question connects to — there is no multiplier, exactly as before.
export function newNumber(label = 'How many?') {
  return { label }
}

export function newGate(prompt) {
  return { prompt: prompt ?? '', number: null, comment: '' }
}

// A supporting department's rule: one term, driver × coefficient.
//
// The driver is a FIGURE THE QUESTIONNAIRE WILL HAVE, and since a question
// itself no longer asks a number there are exactly two kinds: a room some
// question counts (`room`), or a group gate's headline total (`gate`).
// `source_label` is frozen beside the id so a driver whose source has been
// deleted still reads as something.
export function newDriver() {
  return { source_kind: null, source_id: null, source_label: null, coefficient: 1 }
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

export function departmentDriver(definition, sectionId, groupId, deptId) {
  return deptEntry(definition, sectionId, groupId, deptId)?.driver ?? null
}

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

export function setDriver(definition, sectionId, groupId, deptId, driver) {
  return updateDeptEntry(definition, sectionId, groupId, deptId, (dept) => ({ ...dept, driver }))
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

// --- Room sets ----------------------------------------------------------------

// A SET READS AS ITS ONE ROOM until it holds more. `name` is authored only when
// there is something a list of room names cannot say — "3 Tesla" over three
// rooms — so an unnamed set is the normal case and not an unfinished one.
export function newRoomSet(rooms = []) {
  return { instance_id: crypto.randomUUID(), name: '', rooms }
}

// THE ONE READER of a question's follow-up, and it is what makes the older
// shape keep working: a question written before sets held a flat `rooms` array,
// and each of those is exactly a set of one. Absence means the behaviour that
// version had — no migration, as everywhere else here.
export function questionRoomSets(question) {
  if (Array.isArray(question?.room_sets)) return question.room_sets
  return (question?.rooms ?? []).map((room) => ({
    instance_id: `legacy:${room.instance_id}`,
    name: '',
    rooms: [room],
  }))
}

// Every room the question spoken for, across all its sets — what the
// once-per-department rule is checked against.
export function questionRoomIds(question) {
  return questionRoomSets(question).flatMap((set) => (set.rooms ?? []).map((r) => r.instance_id))
}

// Writing always writes `room_sets`, so the first edit of a legacy question
// settles it into the current shape.
function withSets(question, sets) {
  const next = { ...question, room_sets: sets }
  delete next.rooms
  return next
}

export function questionWithSet(question, set) {
  return withSets(question, [...questionRoomSets(question), set])
}

export function questionWithoutSet(question, setId) {
  return withSets(
    question,
    questionRoomSets(question).filter((s) => s.instance_id !== setId)
  )
}

export function questionWithSetUpdated(question, setId, updater) {
  return withSets(
    question,
    questionRoomSets(question).map((s) => (s.instance_id === setId ? updater(s) : s))
  )
}

export function setWithRoom(set, room) {
  if ((set.rooms ?? []).some((r) => r.instance_id === room.instance_id)) return set
  return { ...set, rooms: [...(set.rooms ?? []), room] }
}

export function setWithoutRoom(set, roomInstanceId) {
  return { ...set, rooms: (set.rooms ?? []).filter((r) => r.instance_id !== roomInstanceId) }
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

// NOTHING READS THIS DOCUMENT YET. The wizard that asks these questions and the
// engine that applies the answers are still the next piece:
//
//   gate yes                open the departments in that group
//   question yes + number   set that count on each room the question connects to
//   supporting department   driver's answer × coefficient
//
// Still open, as before: what a gate's number is FOR, and what unit a
// supporting department's rule produces — a count, an area or a multiplier on
// the catalog's own figure. See Open questions in CLAUDE.md.
