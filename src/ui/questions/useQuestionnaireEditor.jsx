// Every edit the questionnaire designer can make.
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
// Nothing here adds or removes a section, a group or a department: those come
// from the catalog and are authored on the Tree tab. This document only says
// what has been authored AGAINST them — see data/questionnaire.js.
//
// There is no undo stack here, unlike the Tree tab. Deliberate for now: this tab
// edits a document nothing reads yet, every edit is one small field, and the
// footer's ribbon is already wired to two histories.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useCatalog } from '../../data/catalog.jsx'
import { useToast } from '../primitives/Toast.jsx'
import {
  EMPTY_DEFINITION,
  insertQuestion,
  setGeneralPrompt,
  newQuestion,
  removeQuestion,
  setDepartmentConnections,
  setDepartmentRole,
  setDepartmentVariables,
  setGate,
  updateQuestion,
  writeQuestionnaire,
} from '../../data/questionnaire.js'

export function useQuestionnaireEditor(buildingId) {
  const catalog = useCatalog()
  const [error, setError] = useState(null)
  const pushToast = useToast()

  const catalogRef = useRef(catalog)
  useEffect(() => {
    catalogRef.current = catalog
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

  const apply = useCallback(async (next, message) => {
    if (!(await write(next))) return false
    if (message) pushToast(message)
    return true
  }, [])

  const currentDefinition = () => rowRef.current?.definition ?? EMPTY_DEFINITION

  // --- The group's gate -------------------------------------------------------

  const setGroupGate = useCallback(
    serialise(async (sectionId, groupId, gate) => {
      await apply(setGate(currentDefinition(), sectionId, groupId, gate))
    }),
    []
  )

  // --- Functioning or supporting ----------------------------------------------

  const setRole = useCallback(
    serialise(async (sectionId, groupId, deptId, role) => {
      await apply(setDepartmentRole(currentDefinition(), sectionId, groupId, deptId, role))
    }),
    []
  )

  // --- A supporting department's rule ------------------------------------------
  //
  // Its variables and its own connections. Both are kept when the role goes back
  // to functioning — a classification is not a delete, the same as the questions.

  const setVariables = useCallback(
    serialise(async (sectionId, groupId, deptId, variables) => {
      await apply(setDepartmentVariables(currentDefinition(), sectionId, groupId, deptId, variables))
    }),
    []
  )

  const setSupportingConnections = useCallback(
    serialise(async (sectionId, groupId, deptId, connections) => {
      await apply(setDepartmentConnections(currentDefinition(), sectionId, groupId, deptId, connections))
    }),
    []
  )

  // --- General ----------------------------------------------------------------
  //
  // THE ONLY EDIT IS THE WORDING. Which general questions exist, what each is
  // called in the language and what kind of answer it takes are the app's — see
  // GENERAL in data/questionnaire.js — so there is nothing here to add or
  // remove.

  const setGeneralWording = useCallback(
    serialise(async (id, prompt) => {
      await apply(setGeneralPrompt(currentDefinition(), id, prompt))
    }),
    []
  )

  // --- Questions --------------------------------------------------------------

  const addQuestion = useCallback(
    serialise(async (sectionId, groupId, deptId) => {
      const question = newQuestion()
      if (await apply(insertQuestion(currentDefinition(), sectionId, groupId, deptId, question), 'Question added')) {
        return question.instance_id
      }
      return null
    }),
    []
  )

  const deleteQuestion = useCallback(
    serialise(async (sectionId, groupId, deptId, questionId) => {
      await apply(removeQuestion(currentDefinition(), sectionId, groupId, deptId, questionId), 'Question removed')
    }),
    []
  )

  const setQuestion = useCallback(
    serialise(async (sectionId, groupId, deptId, questionId, updater) => {
      await apply(updateQuestion(currentDefinition(), sectionId, groupId, deptId, questionId, updater))
    }),
    []
  )

  return {
    row,
    definition,
    // False until the row for this building has arrived. Nothing may be written
    // before then — the write refuses anyway, but the UI should not offer it.
    ready: !!row,
    setGroupGate,
    setRole,
    setVariables,
    setSupportingConnections,
    addQuestion,
    deleteQuestion,
    setQuestion,
    setGeneralWording,
    // The write's own refusal, or the catalog read failing under it. One field:
    // to the outline they are the same thing — the tab cannot be trusted.
    error: error ?? catalog.error,
  }
}

// The Questions tab is split across the two columns — the outline in main, the
// selection's detail in side — but they are one editing session with one write
// queue, so the editor is held above both rather than inside either. The same
// argument, and the same shape, as TreeEditorProvider.
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
