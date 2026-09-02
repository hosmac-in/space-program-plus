// Every edit the Questions tab can make to a questionnaire.
//
// Each handler: mutate the definition (data/questionnaire.js) -> write the row,
// conditional on the version it was read at -> reload questionnaires.
//
// Modelled on ui/tree/useTreeEditor.jsx, and it inherits both of that file's
// load-bearing patterns for the same reasons:
//
// STALENESS
//   The handlers are memoized with no dependencies so their identity is stable.
//   A plain closure over the catalog would freeze on first-render state and
//   write edits against an empty document. They read catalogRef instead, which
//   is re-pointed every render.
//
// SERIALISATION
//   Every action READS the current definition, computes a new one and writes it
//   back. Two started together would both read the same copy and the second
//   would write a document computed before the first existed. So the whole
//   action queues, not just the write: by the time the next runs, the previous
//   has written AND reloaded.
//
// There is no undo stack here, unlike the Tree tab. Deliberate for now: this tab
// edits a document nothing reads yet, every edit is one small field, and the
// footer's ribbon is already wired to two histories. It is the obvious next
// thing to add, not something the design forecloses.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useCatalog } from '../../data/catalog.jsx'
import { useToast } from '../primitives/Toast.jsx'
import {
  EMPTY_DEFINITION,
  insertGroup,
  insertQuestion,
  insertSubQuestion,
  newGroup,
  newQuestion,
  newSubQuestion,
  removeGroup,
  removeQuestion,
  removeSubQuestion,
  updateAnyQuestion,
  updateGroup,
  writeQuestionnaire,
} from '../../data/questionnaire.js'

export function useQuestionnaireEditor(buildingId) {
  const catalog = useCatalog()
  const [error, setError] = useState(null)
  const pushToast = useToast()

  const catalogRef = useRef(catalog)
  const buildingIdRef = useRef(buildingId)
  useEffect(() => {
    catalogRef.current = catalog
    buildingIdRef.current = buildingId
  })

  // The row for the building being authored. Read through the ref at call time
  // so a handler never works from a copy fetched before the last write.
  const rowRef = useRef(null)
  const row = (catalog.questionnaires || []).find((q) => q.building_id === buildingId) ?? null
  rowRef.current = row

  const definition = row?.definition ?? EMPTY_DEFINITION

  const queueRef = useRef(Promise.resolve())

  function serialise(fn) {
    return (...args) => {
      const run = () => fn(...args)
      const next = queueRef.current.then(run, run)
      // The queue itself must never reject, or every later action is skipped.
      queueRef.current = next.catch(() => {})
      return next
    }
  }

  // Writes the whole definition and refreshes everyone's copy. Returns false —
  // and surfaces the message — if the database refused, which for a non-admin is
  // exactly what the RLS policy is supposed to do, and for a stale version is
  // exactly what the version check is supposed to do.
  const write = useCallback(async (nextDefinition) => {
    const current = rowRef.current
    if (!current) {
      setError('no questionnaire row for this building — run sql/questionnaire_setup.sql')
      return false
    }

    const { error: message } = await writeQuestionnaire(current.id, nextDefinition, current.version)
    if (message) {
      setError(message)
      return false
    }
    setError(null)
    await catalogRef.current.reloadQuestionnaires()
    return true
  }, [])

  // Every action below is the same three lines — compute, write, toast — which
  // is what makes this one helper worth having rather than four copies of it.
  const apply = useCallback(async (next, message) => {
    if (!(await write(next))) return false
    if (message) pushToast(message)
    return true
  }, [])

  const currentDefinition = () => rowRef.current?.definition ?? EMPTY_DEFINITION

  // --- Groups ---------------------------------------------------------------

  const addGroup = useCallback(
    serialise(async () => {
      const group = newGroup()
      if (await apply(insertGroup(currentDefinition(), group), 'Group added')) return group.instance_id
      return null
    }),
    []
  )

  const renameGroup = useCallback(
    serialise(async (groupId, name) => {
      await apply(updateGroup(currentDefinition(), groupId, (g) => ({ ...g, name })))
    }),
    []
  )

  const deleteGroup = useCallback(
    serialise(async (groupId) => {
      await apply(removeGroup(currentDefinition(), groupId), 'Group removed')
    }),
    []
  )

  // --- Questions ------------------------------------------------------------

  const addQuestion = useCallback(
    serialise(async (groupId) => {
      const question = newQuestion()
      if (await apply(insertQuestion(currentDefinition(), groupId, question), 'Question added')) {
        return question.instance_id
      }
      return null
    }),
    []
  )

  const addSubQuestion = useCallback(
    serialise(async (questionId) => {
      const sub = newSubQuestion()
      if (await apply(insertSubQuestion(currentDefinition(), questionId, sub), 'Question added')) {
        return sub.instance_id
      }
      return null
    }),
    []
  )

  const deleteQuestion = useCallback(
    serialise(async (questionId) => {
      await apply(removeQuestion(currentDefinition(), questionId), 'Question removed')
    }),
    []
  )

  const deleteSubQuestion = useCallback(
    serialise(async (subId) => {
      await apply(removeSubQuestion(currentDefinition(), subId), 'Question removed')
    }),
    []
  )

  // One setter for both levels: everything the detail panel edits — the prompt,
  // the number, a sub-question's binding — is reached the same way, and
  // updateAnyQuestion is what knows which level an id names.
  const setQuestion = useCallback(
    serialise(async (id, updater) => {
      await apply(updateAnyQuestion(currentDefinition(), id, updater))
    }),
    []
  )

  return {
    row,
    definition,
    // False until the row for this building has arrived. Nothing may be written
    // before then — the write refuses anyway, but the UI should not offer it.
    ready: !!row,
    addGroup,
    renameGroup,
    deleteGroup,
    addQuestion,
    addSubQuestion,
    deleteQuestion,
    deleteSubQuestion,
    setQuestion,
    // The write's own refusal, or the catalog read failing under it. One field:
    // to the outline they are the same thing — the tab cannot be trusted.
    error: error ?? catalog.error,
  }
}

// The Questions tab is split across the two columns — the outline in main, the
// selected question's detail in side — but they are one editing session with one
// write queue, so the editor is held above both rather than inside either. The
// same argument, and the same shape, as TreeEditorProvider.
//
// Two instances of the hook would mean two `serialise` queues, and an edit in
// one column could then be computed from a document the other had already
// replaced — which is the exact failure serialise exists to prevent.
const QuestionnaireEditorContext = createContext(null)

export function QuestionnaireEditorProvider({ buildingId, children }) {
  const editor = useQuestionnaireEditor(buildingId)
  return <QuestionnaireEditorContext.Provider value={editor}>{children}</QuestionnaireEditorContext.Provider>
}

export function useQuestionnaireEditorContext() {
  const editor = useContext(QuestionnaireEditorContext)
  if (!editor) throw new Error('useQuestionnaireEditorContext must be used inside a QuestionnaireEditorProvider')
  return editor
}
