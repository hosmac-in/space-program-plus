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
//   general:   { [questionInstanceId]: <number | boolean | string> },
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
const EMPTY = { gates: {}, questions: {}, general: {} }

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

  // GENERAL IS ONE VALUE PER QUESTION, not a patch: a general question has one
  // answer and nothing else about it is answered. Clearing removes the key, so
  // "unanswered" stays the absence it is everywhere here.
  const setGeneral = useCallback((questionId, value) => {
    setAnswers((a) => {
      const general = { ...a.general }
      if (value === undefined || value === '') delete general[questionId]
      else general[questionId] = value
      return { ...a, general }
    })
  }, [])

  const reset = useCallback(() => setAnswers(EMPTY), [])

  const value = useMemo(
    () => ({
      answers,
      setGate,
      setQuestion,
      setGeneral,
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
      generalOf: (questionId) => answers.general?.[questionId],
    }),
    [answers, setGate, setQuestion, setGeneral, reset]
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
            // Carried so the bed tally can find them without walking the
            // catalog a second time. See bedTally.
            isBed: object.isBed === true,
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
  // --- Pass 0: GENERAL ------------------------------------------------------
  //
  // The facility's own answers, in scope for every rule in the building — see
  // GENERAL in data/questionnaire.js. It is a pass before pass 1 rather than
  // part of it because nothing here depends on anything: these are typed, not
  // computed.
  //
  // ONLY WHAT IS A NUMBER GETS IN. A `yesno` is 1 or 0; a `text` answer is a
  // name and never reaches the scope, so a rule naming it reads as UNRESOLVED
  // rather than as a typo. An UNANSWERED question of any kind is out too — the
  // same rule an unanswered `x` follows, and for the same reason: an absent
  // answer is not a zero answer.
  const general = {}
  ;(model.find((section) => section.kind === 'general')?.questions ?? []).forEach((node) => {
    if (!node.variable || !node.numeric) return
    const given = run.generalOf(node.id)
    if (node.question.kind === 'yesno') {
      if (typeof given === 'boolean') general[node.variable] = given ? 1 : 0
      return
    }
    if (Number.isFinite(given)) general[node.variable] = given
  })

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
              // The question is carried on each result so the beds a single
              // question placed can be told from its neighbours' — a department
              // holds many questions and the rows come back as one list.
              return node.connections.map((connection) => ({
                questionId: node.id,
                ...evaluateConnection(connection, { ...general, x }),
              }))
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
        const scope = { ...general }
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

// THE BEDS THE RUN HAS PLACED, against the bed count it was told.
//
// A bed is an object whose sp_object row carries `is_bed`, at the number its own
// rule worked out, times nothing else — the rule already says how many that
// answer buys.
//
// >>> NOTHING MARKS A QUESTION AS A BED QUESTION. Which questions produce beds
// >>> is a fact about the CATALOG, not about the questionnaire: it changes the
// >>> moment a bed is placed in another room, and a flag on the question would
// >>> be a second place to say it that drifts the day it does. A question counts
// >>> beds exactly when the rooms it brings hold a ruled is_bed object, which is
// >>> what this walks.
//
// Supporting departments are counted in the total and belong to no question —
// they are beds the program holds, and a bar hangs off a question or off
// nothing.
export function bedTally(model, run, answered = evaluateRun(model, run)) {
  const byQuestion = new Map()
  let placed = 0

  answered.forEach((entry) => {
    entry.results.forEach((result) => {
      const beds = result.rooms.reduce(
        (sum, room) => sum + room.objects.filter((o) => o.isBed && o.state === 'ok').reduce((n, o) => n + o.count, 0),
        0
      )
      if (beds === 0) return
      placed += beds
      if (result.questionId) byQuestion.set(result.questionId, (byQuestion.get(result.questionId) ?? 0) + beds)
    })
  })

  // The figure stated up front, or null when nobody has stated one — which is
  // not a target of 0, and is why no bar is drawn until it is answered.
  const node = (model.find((section) => section.kind === 'general')?.questions ?? []).find((q) => q.tally === 'beds')
  const given = node ? run.generalOf(node.id) : undefined
  const target = Number.isFinite(given) && given > 0 ? given : null

  return { target, placed, byQuestion }
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
