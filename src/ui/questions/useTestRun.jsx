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
import { departmentNetAreaSqft } from '../../data/optionData.js'
import { sqftToSqm } from '../../data/units.js'
import { SUPPORTING } from './questionModel.js'

// answers = {
//   gates:     { [groupInstanceId]:    { yes, number } },
//   questions: { [questionInstanceId]: { x } },
// }
//
// Keyed by instance_id and nothing else, exactly as the document is. A
// question's WHOLE answer is one number, and every room count is computed from
// it — there is no map of counts, because nothing is typed.
//
//   >>> AN ABSENT KEY IS THE ONLY THING THAT MEANS UNTOUCHED, which is what the
//   >>> rail's pips are read by. So `x` must be genuinely undefined until
//   >>> someone types, never seeded to 0: a 0 sitting in the field is an answer
//   >>> nobody gave.
const EMPTY = { gates: {}, questions: {} }

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

  const reset = useCallback(() => setAnswers(EMPTY), [])

  const value = useMemo(
    () => ({
      answers,
      setGate,
      setQuestion,
      reset,
      // A gate unanswered reads as NO. There is no third state: the form is
      // yes/no and an untouched switch is off, which is what the person
      // answering sees.
      gateYes: (groupId) => !!answers.gates[groupId]?.yes,
      // undefined until typed — see the note on EMPTY. There is deliberately no
      // `xOr0` any more: standing a 0 in for an absent answer is what made an
      // unanswered question build rooms. See evaluateRun.
      xOf: (questionId) => {
        const x = answers.questions[questionId]?.x
        return Number.isFinite(x) ? x : undefined
      },
    }),
    [answers, setGate, setQuestion, reset]
  )

  return <TestRunContext.Provider value={value}>{children}</TestRunContext.Provider>
}

export function useTestRun() {
  const run = useContext(TestRunContext)
  if (!run) throw new Error('useTestRun must be used inside a TestRunProvider')
  return run
}

// --- What the answers have built ----------------------------------------------
//
// THE ONE EVALUATOR, read by the carousel and by side, so the two cannot
// disagree about what has been answered. It runs in TWO PASSES, and the order is
// the whole of it:
//
//   1  FUNCTIONING departments. Every room count is its connection's formula at
//      { x }, that question's own number. Nothing outside the question is in
//      scope, so this pass needs nothing but the answers.
//   2  SUPPORTING departments. Each variable is the NET AREA of the department
//      it names, in m², as pass 1 built it — so this pass needs all of pass 1.
//
// >>> PASS 1 IS WHOLE-MODEL, NEVER PER CARD. Variables name departments anywhere
// >>> in the building and the deck is one card per SECTION, so computing lazily
// >>> per card would hand a supporting department in section 1 a zero for a
// >>> department answered in section 5.
//
// A room appears with the count of the CONNECTION it came in on: two of a
// 3 Tesla MRI is two of each room in that catalog room group. An object inside it
// carries its OWN rule's value, read at the same one number — see OBJECTS in
// data/questionnaire.js.

// A connection, evaluated: its rooms, and the STATE that says whether the number
// beside them means anything. Four things used to land on one grey zero — no
// rule, a broken rule, a rule naming something gone, and a real zero — and a run
// that cannot tell them apart is a run nobody can debug.
function evaluateConnection(connection, scope) {
  const { value, state, message } = connection.compiled.evaluate(scope)
  return {
    connection,
    count: value,
    state,
    message,
    rooms: connection.rooms.map((room) => ({
      instance_id: room.instance_id,
      label: room.label,
      areaSqft: room.areaSqft ?? 0,
      count: value,
      via: connection,
      // WHAT STANDS IN IT, for the objects somebody has written a rule for. Each
      // reads the SAME scope the room's rule did — one answered number and
      // nothing else — so this is the same evaluation one level in, not a second
      // pass. Unruled objects are dropped: the run is a reading, and the
      // designer is where a blank row is the point.
      objects: (room.objects ?? [])
        .filter((object) => object.compiled.authored)
        .map((object) => {
          const result = object.compiled.evaluate(scope)
          return {
            instance_id: object.instance_id,
            name: object.name,
            count: result.value,
            state: result.state,
            message: result.message,
          }
        }),
    })),
  }
}

// Σ count × area, and no factors. NET deliberately: a rule is written against
// rooms someone can count, and a grossing factor edited on the Tree tab would
// otherwise move every supporting department without anything in the
// questionnaire changing. departmentNetAreaSqft is the one definition of that
// sum — see data/optionData.js.
function netAreaOf(rows) {
  return departmentNetAreaSqft({ rooms: rows.map((r) => ({ count: r.count, areaSqft: r.areaSqft })) })
}

// EVERY DEPARTMENT'S RULES, EVALUATED — departmentId -> { open, results, scope }.
// The carousel reads this directly, because it draws every department it has
// revealed whether or not anything came out above zero, and needs each row's
// state rather than only what survived buildProgram's filter.
export function evaluateRun(model, run) {
  // --- Pass 1 ---------------------------------------------------------------
  const answered = new Map()

  model.forEach((section) =>
    section.groups.forEach((group) => {
      const open = run.gateYes(group.id)
      group.departments.forEach((department) => {
        if (department.role === SUPPORTING) return
        // A group answered NO contributes nothing, and that nothing is a real
        // answer rather than an absence — which is why the entry is written
        // with empty rows instead of being skipped.
        // >>> 0 IS THE NO, AND SO IS AN ABSENT ANSWER: NEITHER BUILDS ANYTHING.
        // >>> The question asks how many there are, so nought beds is "there is
        // >>> no Emergency Care" and nothing under it should appear.
        // >>>
        // >>> This is NOT what evaluating the rules at x = 0 gives. A rule with a
        // >>> constant term — `2` for the toilets, `ceil(x/4) + 1` — comes out
        // >>> above zero at x = 0 and put those rooms in the program with the
        // >>> question answered nought, which reads as the run having supplied a
        // >>> figure of its own. The rules are only read once there is something
        // >>> to build.
        const results = open
          ? department.questions.flatMap((node) => {
              const x = run.xOf(node.id)
              if (!(x > 0)) return []
              return node.connections.map((connection) => evaluateConnection(connection, { x }))
            })
          : []
        answered.set(department.id, { open, results })
      })
    })
  )

  const areaSqm = new Map()
  answered.forEach((entry, deptId) => {
    areaSqm.set(deptId, sqftToSqm(netAreaOf(entry.results.flatMap((r) => r.rooms))))
  })

  // --- Pass 2 ---------------------------------------------------------------
  model.forEach((section) =>
    section.groups.forEach((group) => {
      const open = run.gateYes(group.id)
      group.departments.forEach((department) => {
        if (department.role !== SUPPORTING) return
        // A name with no number in scope evaluates as UNRESOLVED, which is what
        // a deleted department and a supporting one both are here: the scope is
        // built only from what pass 1 actually produced.
        const scope = {}
        department.variables.forEach((variable) => {
          // `a` is the whole group: every functioning department beside this
          // one, summed. It is always a number — an unanswered group is 0 m²,
          // which is a real answer — where a department's name resolves to
          // nothing when that department has gone.
          if (variable.kind === 'group') {
            scope[variable.name] = group.departments
              .filter((d) => d.role !== SUPPORTING)
              .reduce((sum, d) => sum + (areaSqm.get(d.id) ?? 0), 0)
            return
          }
          const area = areaSqm.get(variable.instance_id)
          if (Number.isFinite(area)) scope[variable.name] = area
        })
        const results = open ? department.connections.map((c) => evaluateConnection(c, scope)) : []
        answered.set(department.id, { open, results, scope })
      })
    })
  )

  return answered
}

// WHAT THE ANSWERS HAVE BUILT, as a tree — only what came out above zero. A
// department, group or section with nothing under it is not drawn at all: an
// empty one would read as "nobody asked for one" rather than as "nobody has
// answered this yet".
export function buildProgram(model, run, answered = evaluateRun(model, run)) {
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
              results: answered.get(department.id)?.results ?? [],
              rooms: (answered.get(department.id)?.results ?? [])
                .filter((r) => r.state === 'ok' && r.count > 0)
                .flatMap((r) => r.rooms),
            }))
            .filter((department) => department.rooms.length > 0),
        }))
        .filter((group) => group.departments.length > 0),
    }))
    .filter((section) => section.groups.length > 0)
}
