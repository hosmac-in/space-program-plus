// TEST RUN — the questionnaire as the person answering it will see it.
//
// A MOCK, and deliberately so: nothing here is written anywhere. The answers are
// React state and they go when you leave the tab. The point is to read the
// authored questionnaire back as a form and see what it builds, which is the one
// thing the designer cannot show you — an outline of questions is not a
// questionnaire any more than a schema is a database.
//
// >>> THE TEST RUN TAB NEVER SAVES — it checks the FORM. The same state feeds
// >>> THE OPTION CREATOR, reached only from New Option, which starts it fresh and
// >>> writes the option when it is finished: createOption.js is the one writer.
//
// The state is held above both columns for the same reason the editor is: main
// asks the questions and side reports what they have built, and two copies would
// answer differently.

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { sqftToSqm } from '../../data/units.js'
import { SUPPORTING } from './questionModel.js'
import { DMG_ANSWER } from '../../data/questionnaire.js'

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

  // WHICH CARD IS ON SCREEN, held here because TWO COLUMNS NEED IT and they are
  // mounted in different places — the carousel is main's, the tree is side's,
  // and App is their only common ancestor. It is not an answer and is never
  // evaluated; it is here because this is already the one thing both columns
  // share.
  const [sectionId, setSectionId] = useState(null)

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
      sectionId,
      setSectionId,
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
      // WHICH DMGs THIS RUN TARGETS. Unanswered is none — the untagged groups
      // only, exactly what a new option starts with — never "everything", or an
      // untouched run would ask every speciality in the catalog.
      dmgIds: Array.isArray(answers.general?.[DMG_ANSWER]) ? answers.general[DMG_ANSWER] : [],
    }),
    [answers, setGate, setQuestion, setGeneral, reset, sectionId]
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
// A room appears with its OWN rule's value, times how many of the catalog room
// group it came in on — two theatre sets are two of each room in one set, and
// the rooms in a set are not one apiece. An object inside it carries its own
// rule, and is multiplied by the same set count. See A ROOM GROUP'S ROOMS and
// OBJECTS in data/questionnaire.js.

// A connection, evaluated: its rooms, and the STATE that says whether the number
// beside them means anything. Four things used to land on one grey zero — no
// rule, a broken rule, a rule naming something gone, and a real zero — and a run
// that cannot tell them apart is a run nobody can debug.
// HOW MUCH AREA THIS ROW IS, IN TOTAL — not per one of the room.
//
// A STATED AREA IS PER ONE OF THAT ROOM, so it takes the count: area × count,
// which is departmentNetAreaSqft's rule and the whole app's. Its objects
// deliberately do not sum to it — the difference is circulation.
//
// A ROOM THAT STATES NONE IS MEASURED BY WHAT STANDS IN IT, and THAT FIGURE
// TAKES NO COUNT: an object's rule states a total, not a per-room number, so
// multiplying it by the room count would count every object twice over. It also
// means such a row has an area even when the room itself has no count, which is
// the point — a ruled object is a thing somebody asked for.
//
// A room left at 0 and counted as 0 made whole departments vanish from the
// totals while their rows sat on the screen.
function roomAreaSqft(room, objects, count) {
  if (room.areaSqft > 0) return room.areaSqft * count
  return objects.reduce((sum, object) => sum + (object.areaSqft ?? 0) * object.count, 0)
}

// THE BEDS ONE OF THIS ROOM HOLDS. A bed with a rule holds to it; a bed with NO
// rule is worth ONE — a room that places a bed places at least one, and the bed
// count is a check on the brief rather than a rule somebody wrote.
//
// >>> THE ASSUMED BED IS NOT DRAWN ANYWHERE. It is a figure for the tally only,
// >>> so the tree still shows exactly what has been authored: inventing a row
// >>> nobody wrote would make the run look like it had rules it has not got.
function bedsIn(room, sized, count) {
  // A ruled bed states its own number outright, exactly as every other object
  // does — there is nothing to multiply it by.
  const ruled = sized.filter((o) => o.isBed && o.state === 'ok').reduce((sum, o) => sum + o.count, 0)
  // An unruled one is one PER ROOM, so it is the only figure here that the room
  // count reaches. No rooms, no beds.
  const blank = (room.objects ?? []).filter((o) => o.isBed && !o.compiled.authored).length
  return ruled + blank * count
}

// EVERY ROOM CARRIES ITS OWN RULE, INSIDE A GROUP AND OUT. A group is a heading
// over rooms that are each sized separately — see A ROOM GROUP'S ROOMS in
// data/questionnaire.js — and a single room's rule is the connection's own, so
// both read `room.compiled` and this function does not care which it has.
// The row's own reading, from the rooms under it. `count` is what they add up
// to, which is the only figure a group can honestly show: five rooms sized
// differently have no single count, and a sum is what the department gets.
// HOW MANY OF THE WHOLE SET, and the ONE definition of it. A room group's own
// rule multiplies every room rule inside it; a single room has no such level and
// is always one of itself.
//
// UNWRITTEN IS ONE, NOT NONE — the identity of a multiplier, and the only blank
// in the document read as a number apart from a bed. A blank meaning "no count"
// would zero a set whose rooms are each fully ruled.
//
// A BROKEN ONE IS NOT ONE. It returns null, and the row takes that state whole:
// falling back to 1 would build the set off a rule nobody can read, which is the
// grey-zero collapse the four states exist to prevent.
function connectionMultiplier(connection, scope) {
  if (!connection.grouped || !connection.compiled.authored) return { times: 1, state: null }
  const { value, state, message } = connection.compiled.evaluate(scope)
  if (state !== 'ok') return { times: null, state, message }
  return { times: value, state: null }
}

function summariseRooms(rooms, scope, times = 1) {
  const results = rooms.map((room) => room.compiled.evaluate(scope))
  const ok = results.filter((r) => r.state === 'ok')
  if (ok.length > 0) return { count: ok.reduce((sum, r) => sum + r.value, 0) * times, state: 'ok', message: null }
  const broken = results.find((r) => r.state === 'invalid' || r.state === 'unresolved')
  return { count: 0, state: broken?.state ?? 'unauthored', message: broken?.message ?? null }
}

function evaluateConnection(connection, scope) {
  // HOW MANY OF THE SET — 1 for a single room and for a group nobody has put a
  // number on. Read once for the whole row, so the row's total and the rooms
  // under it cannot be multiplied by different things.
  const { times, state: timesState, message: timesMessage } = connectionMultiplier(connection, scope)

  // A BROKEN GROUP COUNT IS THE WHOLE ROW'S STATE. Nothing under it can be
  // believed — every room's number is a multiple of one nobody can read — so the
  // rooms are drawn countless rather than at their unmultiplied figures, which
  // would look like a program somebody asked for.
  if (times == null) {
    return {
      connection,
      count: 0,
      state: timesState,
      message: timesMessage,
      rooms: [],
    }
  }

  return {
    connection,
    // HOW MANY SETS — what a rule naming this room group counts, and 1 for a
    // single room. It is the group's own figure rather than its rooms' sum,
    // which is what a set being a set means.
    times,
    // THE CONNECTION'S OWN STATE IS ITS ROOMS'. A group's own rule says only how
    // many sets, so the one thing a reader can ask of the row is whether
    // anything under it computed: `ok` if any room did, and the worst thing
    // found if none did. A group whose rooms are all blank must read as
    // unauthored, not as broken — and ×3 of nothing is still nothing.
    ...summariseRooms(connection.rooms, scope, times),
    rooms: connection.rooms.map((room) => {
      const { value, state } = room.compiled.evaluate(scope)
      // WHAT STANDS IN IT, for the objects somebody has written a rule for. Each
      // reads the SAME scope the room's rule did — one answered number and
      // nothing else — so this is the same evaluation one level in, not a second
      // pass. Unruled objects are dropped: the run is a reading, and the
      // designer is where a blank row is the point.
      const objects = (room.objects ?? [])
        .filter((object) => object.compiled.authored)
        .map((object) => {
          const result = object.compiled.evaluate(scope)
          return {
            instance_id: object.instance_id,
            name: object.name,
            // A SECOND SET BRINGS A SECOND SET'S WORTH OF EVERYTHING IN IT. An
            // object's rule states the total for ONE of the set, exactly as the
            // room rules above it do, so the group's count reaches this too.
            count: result.value * times,
            state: result.state,
            message: result.message,
            areaSqft: object.areaSqft ?? 0,
            isBed: object.isBed === true,
          }
        })

      // A ROOM WITH NO COUNT STILL HAS ITS RULED OBJECTS. A rule on an object
      // states a number outright and says somebody asked for it; the room above
      // it being blank says only that nobody has said how many rooms. So the row
      // stays, countless, with what stands in it — dropping it took the objects
      // with it and there was nowhere left to notice them.
      const counted = state === 'ok' ? value * times : null

      return {
        instance_id: room.instance_id,
        label: room.label,
        // The whole row's area, not one room's — see roomAreaSqft.
        areaSqft: roomAreaSqft(room, objects, counted ?? 0),
        count: counted,
        via: connection,
        objects,
        // The beds this row holds, already totalled: the assumed one has no row
        // to hang off, so it cannot be worked out from `objects` afterwards.
        beds: bedsIn(room, objects, counted ?? 0),
      }
    }),
  }
}

// NO FACTORS, deliberately: a rule is written against rooms someone can count,
// and a grossing factor edited on the Tree tab would otherwise move every
// supporting department without anything in the questionnaire changing.
//
// >>> IT NO LONGER CALLS departmentNetAreaSqft, and cannot. That is Σ count ×
// >>> area, which is right only while every area is stated PER ONE OF A ROOM —
// >>> and a room measured by its objects is already a total, because an object's
// >>> rule states one. Multiplying that by the count again counted every object
// >>> as many times as there were rooms. roomAreaSqft applies the count where
// >>> the count belongs, once.
function netAreaOf(rows) {
  return rows.reduce((sum, row) => sum + row.areaSqft, 0)
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
    // A multiplier untouched is its default, never out of scope — see footfall.
    if (node.question.kind === 'multiplier') {
      general[node.variable] = Number.isFinite(given) ? given : node.question.default ?? 1
      return
    }
    if (Number.isFinite(given)) general[node.variable] = given
  })

  // A QUESTION'S NAMED x, for every other rule in the building. Typed, not
  // computed, so it belongs to this pass. An answered 0 is a real 0 a rule may
  // divide by; unanswered, or behind a gate that is not yes, is out of scope and
  // reads as unresolved. A clashing name was never compiled in — see buildModel.
  model.forEach((section) =>
    section.groups.forEach((group) => {
      if (!run.gateYes(group.id)) return
      group.departments.forEach((department) => {
        if (department.role === SUPPORTING) return
        department.questions.forEach((node) => {
          const x = run.xOf(node.id)
          if (node.variable && !node.variableClash && Number.isFinite(x)) general[node.variable] = x
        })
      })
    })
  )

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
              // A DUMMY BUILDS WHENEVER ITS GROUP IS OPEN, off the other names
              // alone — there is no x to be the no.
              if (node.dummy) {
                return node.connections.map((connection) => ({
                  questionId: node.id,
                  ...evaluateConnection(connection, general),
                }))
              }
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

  // WHAT A RULE COUNTS ONE LEVEL IN — per functioning department, a count for
  // every room, room group and object it built. See memberVariables in
  // questionModel.js for the names these answer to.
  //
  // >>> SEEDED AT 0 FOR AN OPEN DEPARTMENT, and left ABSENT for a closed one.
  // >>> That is the whole distinction between "asked, and there are none" and
  // >>> "nobody asked": the first is a real answer a rule may divide by, the
  // >>> second is unresolved. It is the same line `a` and a department's own name
  // >>> already draw.
  const memberCounts = new Map()
  model.forEach((section) =>
    section.groups.forEach((group) =>
      group.departments.forEach((department) => {
        const entry = answered.get(department.id)
        if (!entry?.open || department.role === SUPPORTING) return
        const counts = new Map()
        const add = (key, n) => key && counts.set(key, (counts.get(key) ?? 0) + n)

        // Every name this department offers, at nought, before anything is added.
        ;(department.catalogRooms ?? []).forEach((room) => counts.set(room.instance_id, 0))
        ;(department.catalogGroups ?? []).forEach((g) => counts.set(g.instance_id, 0))
        ;(department.catalogRooms ?? []).forEach((room) =>
          (room.objects ?? []).forEach((object) => counts.set(object.instance_id, 0))
        )

        entry.results.forEach((result) => {
          // A ROOM GROUP COUNTS ITS SETS, which is its own rule's figure and not
          // its rooms' sum — see connectionMultiplier.
          if (result.connection.grouped) add(result.connection.instance_id, result.times ?? 0)
          result.rooms.forEach((room) => {
            add(room.instance_id, room.count ?? 0)
            // Keyed by the PLACEMENT, like its room: the name carries the room
            // it stands in, so two rooms holding the same object are two names
            // and two counts.
            room.objects.forEach((object) => add(object.instance_id, object.count ?? 0))
          })
        })
        memberCounts.set(department.id, counts)
      })
    )
  )

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
        // One level in: a COUNT, where the name above it is an area. A duplicate
        // never reaches here — questionModel leaves it out of the list — so a
        // rule naming one reads as unresolved rather than counting whichever of
        // the two came first.
        ;(department.members ?? []).forEach((member) => {
          if (member.duplicate) return
          const count = memberCounts.get(member.deptInstanceId)?.get(member.targetId)
          if (Number.isFinite(count)) scope[member.name] = count
        })
        const results = open ? department.connections.map((c) => evaluateConnection(c, scope)) : []
        answered.set(department.id, { open, results, scope })
      })
    })
  )

  return answered
}

// WHAT THE RUN ADDS UP TO: its beds against the bed count it was told, and its
// area. Both are read from the SAME walk the rooms came out of, so the HUD and
// the tree cannot disagree about what has been answered.
//
// A bed is an object whose sp_object row carries `is_bed` — see bedsIn for the
// one that has no rule.
//
// >>> NOTHING MARKS A QUESTION AS A BED QUESTION. Which questions produce beds
// >>> is a fact about the CATALOG, not about the questionnaire: it changes the
// >>> moment a bed is placed in another room, and a flag on the question would
// >>> be a second place to say it that drifts the day it does. A question counts
// >>> beds exactly when the rooms it brings hold one, which is what this walks.
//
// Supporting departments are counted in the totals and belong to no question —
// they are beds and area the program holds, and a bar hangs off a question or
// off nothing.
export function bedTally(model, run, answered = evaluateRun(model, run)) {
  const byQuestion = new Map()
  let placed = 0
  let areaSqft = 0

  answered.forEach((entry) => {
    entry.results.forEach((result) => {
      // A BROKEN or UNRESOLVED rule is thrown out — nobody can say what it
      // meant. An UNAUTHORED one is not: it says only that nobody has counted
      // the rooms, and the ruled objects inside it are still things somebody
      // asked for.
      if (result.state === 'invalid' || result.state === 'unresolved') return
      areaSqft += netAreaOf(result.rooms)
      const beds = result.rooms.reduce((sum, room) => sum + room.beds, 0)
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

  return { target, placed, byQuestion, areaSqft }
}

// WHAT THE ANSWERS HAVE BUILT, as a tree — only what somebody actually asked
// for. A department, group or section with nothing under it is not drawn at all:
// an empty one would read as "nobody asked for one" rather than as "nobody has
// answered this yet".
//
// A ROW IS ASKED FOR IF THE ROOM IS COUNTED, OR IF ANYTHING IN IT IS. A rule on
// an object is a thing somebody asked for whatever the room above it says, and
// while the count was the only test, every one of them was dropped along with
// its room and there was nowhere left to notice it.
function asked(room) {
  return room.count > 0 || room.objects.some((o) => o.state === 'ok' && o.count > 0)
}

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
                // A broken rule is thrown out; an unwritten one is not — see the
                // note in bedTally.
                .filter((r) => r.state === 'ok' || r.state === 'unauthored')
                .flatMap((r) => r.rooms)
                .filter(asked),
            }))
            .filter((department) => department.rooms.length > 0),
        }))
        .filter((group) => group.departments.length > 0),
    }))
    .filter((section) => section.groups.length > 0)
}
