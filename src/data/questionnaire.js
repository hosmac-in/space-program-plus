// THE QUESTIONNAIRE — sp_questionnaire.definition
// ===============================================
//
// An option is meant to be created by answering questions rather than by
// building it department by department on the canvas. This is the authored
// question set that will do it — one row per building, the whole thing in one
// jsonb column:
//
//   {
//     "groups": [{
//       "instance_id": "...",
//       "name": "Clinical",                    <- authored, not a definition id
//       "questions": [{
//         "instance_id": "...",
//         "prompt": "Are there inpatient beds?",
//         "number": { … } | null,
//         "questions": [{                      <- sub-questions, and that is the end
//           "instance_id": "...",
//           "prompt": "General ward?",
//           "department_node_id": "...",       <- YES adds this placement
//           "department_path": "Hospital → Inpatient → Wards",
//           "number": { … } | null
//         }]
//       }]
//     }]
//   }
//
//   number on a gate         = { "label": "Total beds" }
//   number on a sub-question = { "label": "Beds", "target_node_id": "...",
//                                "target_path": "…" }
//
// THE GRAMMAR, AND WHY IT STOPS WHERE IT DOES
//
// Every question is a yes/no. The two levels do different jobs:
//
//   top level    a GATE. Yes reveals its sub-questions and adds nothing itself.
//                It may still carry a number — "Are there beds?" then "How many
//                in total?" — but that number POINTS AT NOTHING: a gate adds no
//                department, so there is nothing of its own to size. It is a
//                headline figure for the brief.
//   sub-question YES ADDS ONE DEPARTMENT, the placement named by
//                department_node_id. Its number sets the COUNT OF ONE ROOM
//                INSIDE THAT DEPARTMENT — never a room elsewhere in the catalog,
//                never an object, never the department itself.
//
// Sub-questions do not nest. Two levels is the whole grammar, deliberately: a
// tree of arbitrary depth is a tree to author, a tree to render, a tree to walk
// when answering, and a facility brief has never needed one.
//
// WHY THE TARGET IS A ROOM, AND ONLY ONE INSIDE THIS DEPARTMENT
//
// The answer is the count, directly — twelve is twelve of that room. That is
// what rooms carrying a `count` in sp_option.data is for (see optionData.js),
// and it is why there is no multiplier: a rate would need a rule engine to
// interpret, and this needs none.
//
// Scoping the target to the bound department is what keeps the two halves of a
// sub-question one statement: "yes, add this department, and this is how many of
// that room it has". A target elsewhere in the catalog would mean a question
// that adds one thing and sizes another. So re-binding the department CLEARS the
// number's target — it now names a room in a department this question no longer
// adds.
//
// WHY A NAME IS STORED HERE, WHEN NOTHING ELSE STORES ONE
//
// `department_node_id` and `target_node_id` point at instance_ids inside
// sp_section.tree — a jsonb column, which no foreign key can reach into. It is
// the identical situation sp_option.data.tree_node_id is in, so it gets the
// identical treatment: a frozen *_path string beside each id, display-only,
// never read back as data. Delete a placement from the catalog and the question
// still reads "Hospital → Inpatient → Wards (no longer in the tree)" instead of
// going blank with nothing to say which placement it lost.
//
// Everything below is a pure function over a plain JS object: it takes a
// definition, returns a new definition, and touches nothing else. Writing is
// writeQuestionnaire, at the bottom, and it is the only thing here that isn't.

import { supabase } from './supabase.js'

export const EMPTY_DEFINITION = { groups: [] }

// --- Making nodes -----------------------------------------------------------
//
// Identity is instance_id, minted here, exactly as in tree.js — and for a
// weaker version of the same reason: two questions may legitimately carry the
// same prompt, and a group's name is authored text that can be edited to match
// another's at any moment. Nothing may be keyed by either.

export function newGroup(name = 'New group') {
  return { instance_id: crypto.randomUUID(), name, questions: [] }
}

export function newQuestion(prompt = 'New question') {
  return { instance_id: crypto.randomUUID(), prompt, number: null, questions: [] }
}

export function newSubQuestion(prompt = 'New question') {
  return {
    instance_id: crypto.randomUUID(),
    prompt,
    department_node_id: null,
    department_path: null,
    number: null,
  }
}

// A number input. On a sub-question it is bound to a room inside that
// question's department; on a gate it points at nothing and the two target keys
// stay null.
//
// There is no multiplier, deliberately: the answer IS the room's count. A rate
// would need something to interpret it, and the whole point of pointing at a
// room is that nothing has to.
export function newNumber(label = 'How many?') {
  return { label, target_node_id: null, target_path: null }
}

// --- Reading ----------------------------------------------------------------

// One node and everything above it, found anywhere in the document.
//
// Returns { kind, node, group, question } — `question` is set only for a
// sub-question, so a caller renders one selection without walking the document
// itself, and knows which of the two levels it is looking at without comparing
// ids.
export function findNode(definition, instanceId) {
  if (!instanceId) return null
  for (const group of definition?.groups || []) {
    if (group.instance_id === instanceId) return { kind: 'group', node: group, group, question: null }
    for (const question of group.questions || []) {
      if (question.instance_id === instanceId) {
        return { kind: 'question', node: question, group, question: null }
      }
      for (const sub of question.questions || []) {
        if (sub.instance_id === instanceId) {
          return { kind: 'subQuestion', node: sub, group, question }
        }
      }
    }
  }
  return null
}

// --- Editing ----------------------------------------------------------------
//
// One function per level per verb, rather than one generic walker taking a path:
// the document is three levels deep and will not get deeper, so the explicit
// version is shorter than the machinery to avoid it and says what it does.

export function insertGroup(definition, group) {
  return { ...definition, groups: [...(definition?.groups || []), group] }
}

export function removeGroup(definition, groupId) {
  return { ...definition, groups: (definition?.groups || []).filter((g) => g.instance_id !== groupId) }
}

export function updateGroup(definition, groupId, updater) {
  return {
    ...definition,
    groups: (definition?.groups || []).map((g) => (g.instance_id === groupId ? updater(g) : g)),
  }
}

export function insertQuestion(definition, groupId, question) {
  return updateGroup(definition, groupId, (g) => ({ ...g, questions: [...(g.questions || []), question] }))
}

// The question's id alone is enough — an instance_id is unique across the whole
// document, so nothing has to say which group to look in.
export function removeQuestion(definition, questionId) {
  return {
    ...definition,
    groups: (definition?.groups || []).map((g) => ({
      ...g,
      questions: (g.questions || []).filter((q) => q.instance_id !== questionId),
    })),
  }
}

export function updateQuestion(definition, questionId, updater) {
  return {
    ...definition,
    groups: (definition?.groups || []).map((g) => ({
      ...g,
      questions: (g.questions || []).map((q) => (q.instance_id === questionId ? updater(q) : q)),
    })),
  }
}

export function insertSubQuestion(definition, questionId, sub) {
  return updateQuestion(definition, questionId, (q) => ({ ...q, questions: [...(q.questions || []), sub] }))
}

export function removeSubQuestion(definition, subId) {
  return {
    ...definition,
    groups: (definition?.groups || []).map((g) => ({
      ...g,
      questions: (g.questions || []).map((q) => ({
        ...q,
        questions: (q.questions || []).filter((s) => s.instance_id !== subId),
      })),
    })),
  }
}

export function updateSubQuestion(definition, subId, updater) {
  return {
    ...definition,
    groups: (definition?.groups || []).map((g) => ({
      ...g,
      questions: (g.questions || []).map((q) => ({
        ...q,
        questions: (q.questions || []).map((s) => (s.instance_id === subId ? updater(s) : s)),
      })),
    })),
  }
}

// A question or a sub-question, whichever holds this id. The detail panel edits
// the two through one set of handlers because everything it changes — the
// prompt, the number — exists at both levels.
export function updateAnyQuestion(definition, id, updater) {
  const found = findNode(definition, id)
  if (!found) return definition
  return found.kind === 'subQuestion'
    ? updateSubQuestion(definition, id, updater)
    : updateQuestion(definition, id, updater)
}

// --- Writing ----------------------------------------------------------------

// The whole document, written whole — there is no narrow write of a jsonb
// column, exactly as in tree.js.
//
// CONDITIONAL ON THE VERSION IT WAS READ AT. If the row moved on since it was
// loaded — another admin, another tab — zero rows match, nothing is written and
// the caller is told. sp_section.tree has no such check and two admins silently
// overwrite each other; this table was created with one for that reason (see
// sql/questionnaire_setup.sql).
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

// NOTHING READS THIS DOCUMENT YET.
//
// It is authored in the Questions tab and stored, and that is all. The wizard
// that asks these questions when an option is created, and the engine that
// applies the answers to sp_option.data, are the next piece.
//
// What that engine has to do is now small enough to state in three lines, which
// is the point of the restrictions above:
//
//   sub-question yes   add the department at department_node_id, phase 1
//   its number         set that room's `count` to the answer
//   gate yes           ask the questions under it; record its number
//
// The one thing still open is what a gate's number is FOR. It is recorded and
// nothing consumes it — a total to check the sub-questions against, most
// likely, but that is a decision for when the wizard exists.
