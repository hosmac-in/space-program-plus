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
// THE GRAMMAR
//
// Every question is a yes/no, and the two levels do different jobs:
//
//   top level    a GATE. Yes reveals its sub-questions and adds nothing itself.
//                It may still carry a number — "Are there beds?" then "How many
//                in total?" — but that number POINTS AT NOTHING, because a gate
//                adds no department. It is a headline figure for the brief.
//   sub-question YES ADDS ONE DEPARTMENT, the placement at department_node_id.
//                Its number sets the COUNT OF ONE ROOM INSIDE THAT DEPARTMENT —
//                never a room elsewhere, never an object, never the department.
//
// Sub-questions do not nest: two levels is the whole grammar, deliberately. A
// tree of arbitrary depth is one to author, one to render and one to walk when
// answering, and a facility brief has never needed one.
//
// The answer IS the count — twelve is twelve of that room, which is what a
// room's `count` in sp_option.data is for. There is no multiplier, so nothing
// has to interpret a rate. Scoping the target to the bound department keeps a
// sub-question one statement rather than a question that adds one thing and
// sizes another, which is why re-binding the department CLEARS the number's
// target.
//
// `department_node_id` and `target_node_id` point at instance_ids inside
// sp_section.tree, which no foreign key can reach into — the same situation as
// sp_option.data.tree_node_id, and it gets the same treatment: a frozen *_path
// string beside each id, display-only, so a deleted placement still reads as
// something instead of going blank. That is the one reason a name is stored in
// this document.
//
// Everything below is a pure function over a plain object except
// writeQuestionnaire at the bottom.

import { supabase } from './supabase.js'

export const EMPTY_DEFINITION = { groups: [] }

// --- Making nodes -----------------------------------------------------------
//
// Identity is instance_id, as in tree.js: two questions may carry the same
// prompt, and a group's name is authored text that can be edited to match
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

// On a sub-question this is bound to a room inside that question's department;
// on a gate it points at nothing and both target keys stay null.
export function newNumber(label = 'How many?') {
  return { label, target_node_id: null, target_path: null }
}

// --- Reading ----------------------------------------------------------------

// One node and everything above it: { kind, node, group, question }, where
// `question` is set only for a sub-question. A caller can then render one
// selection without walking the document or comparing ids.
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
// One function per level per verb rather than a generic walker taking a path:
// the document is three levels deep and will not get deeper, so the explicit
// version is shorter than the machinery to avoid it.

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

// The id alone is enough: an instance_id is unique across the document, so
// nothing has to say which group to look in.
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

// A question or a sub-question, whichever holds this id — the detail panel edits
// both through one set of handlers, since a prompt and a number exist at either
// level.
export function updateAnyQuestion(definition, id, updater) {
  const found = findNode(definition, id)
  if (!found) return definition
  return found.kind === 'subQuestion'
    ? updateSubQuestion(definition, id, updater)
    : updateQuestion(definition, id, updater)
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

// NOTHING READS THIS DOCUMENT YET. The Questions tab authors it; the wizard that
// asks these questions and the engine that applies the answers to sp_option.data
// are the next piece. The restrictions above are what keep that engine to three
// lines:
//
//   sub-question yes   add the department at department_node_id, phase 1
//   its number         set that room's `count` to the answer
//   gate yes           ask the questions under it; record its number
//
// The one thing still open is what a gate's number is FOR — it is recorded and
// nothing consumes it.
