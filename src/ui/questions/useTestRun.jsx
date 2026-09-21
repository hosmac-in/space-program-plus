// TEST RUN — the questionnaire as the person answering it will see it.
//
// A MOCK, and deliberately so: nothing here is written anywhere. The answers are
// React state and they go when you leave the tab. The point is to read the
// authored questionnaire back as a form and see what it builds, which is the one
// thing the designer cannot show you — an outline of questions is not a
// questionnaire any more than a schema is a database.
//
// >>> DO NOT GIVE THIS A SAVE. The engine that turns answers into an
// >>> sp_option.data is a real and separate piece of work (see CLAUDE.md, Open
// >>> questions); a half-one wired to this state would write a program nobody
// >>> asked for. This tab exists to check the FORM, not to fill one in.
//
// The state is held above both columns for the same reason the editor is: main
// asks the questions and side reports what they have built, and two copies would
// answer differently.

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// answers = {
//   gates:     { [groupInstanceId]:    { yes, number } },
//   questions: { [questionInstanceId]: { yes } },
//   sets:      { [setInstanceId]:      count },
// }
//
// Keyed by instance_id and nothing else, exactly as the document is. A set's
// count is the whole of its answer, so it is the value rather than an object.
const EMPTY = { gates: {}, questions: {}, sets: {} }

const TestRunContext = createContext(null)

export function TestRunProvider({ children }) {
  const [answers, setAnswers] = useState(EMPTY)

  const setGate = useCallback((groupId, patch) => {
    setAnswers((a) => ({ ...a, gates: { ...a.gates, [groupId]: { ...a.gates[groupId], ...patch } } }))
  }, [])

  const setQuestion = useCallback((questionId, patch) => {
    setAnswers((a) => ({
      ...a,
      questions: { ...a.questions, [questionId]: { ...a.questions[questionId], ...patch } },
    }))
  }, [])

  const setCount = useCallback((setId, count) => {
    setAnswers((a) => ({ ...a, sets: { ...a.sets, [setId]: count } }))
  }, [])

  const reset = useCallback(() => setAnswers(EMPTY), [])

  const value = useMemo(
    () => ({
      answers,
      setGate,
      setQuestion,
      setCount,
      reset,
      // A gate or a question unanswered reads as NO. There is no third state:
      // the form is yes/no and an untouched switch is off, which is what the
      // person answering sees.
      gateYes: (groupId) => !!answers.gates[groupId]?.yes,
      questionYes: (questionId) => !!answers.questions[questionId]?.yes,
      // 0 means not chosen — the same thing the designer draws greyed.
      countOf: (setId) => answers.sets[setId] ?? 0,
    }),
    [answers, setGate, setQuestion, setCount, reset]
  )

  return <TestRunContext.Provider value={value}>{children}</TestRunContext.Provider>
}

export function useTestRun() {
  const run = useContext(TestRunContext)
  if (!run) throw new Error('useTestRun must be used inside a TestRunProvider')
  return run
}

// WHAT THE ANSWERS HAVE BUILT — the model, filtered to what was said yes to and
// counted above zero. One function, read by side, so the tree and the carousel
// can never disagree about what has been answered.
//
// A room appears with the count of the SET it belongs to: two of a 3 Tesla MRI
// is two of each of its rooms.
export function buildProgram(model, run) {
  return model
    .map((section) => ({
      ...section,
      groups: section.groups
        .filter((group) => run.gateYes(group.id))
        .map((group) => ({
          ...group,
          departments: group.departments
            .map((department) => ({
              ...department,
              rooms: department.questions
                .filter((node) => run.questionYes(node.id))
                .flatMap((node) =>
                  node.sets
                    .filter((set) => run.countOf(set.instance_id) > 0)
                    .flatMap((set) =>
                      (set.rooms ?? []).map((room) => ({
                        instance_id: room.instance_id,
                        label: room.label,
                        count: run.countOf(set.instance_id),
                        // Which set brought it, so the tree can say "×2 from
                        // 3 Tesla" rather than leaving a bare number.
                        via: set,
                      }))
                    )
                ),
            }))
            // A supporting department is sized by a rule nothing runs yet, so it
            // would always be empty here — see CLAUDE.md. Dropping it is honest;
            // drawing it empty would read as "nobody asked for one".
            .filter((department) => department.rooms.length > 0),
        }))
        .filter((group) => group.departments.length > 0),
    }))
    .filter((section) => section.groups.length > 0)
}
