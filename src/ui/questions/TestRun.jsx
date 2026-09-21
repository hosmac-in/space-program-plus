// THE TEST RUN, in main: the questionnaire as a carousel.
//
// ONE CARD IS ONE STEP, and a step is either a group's GATE or one FUNCTIONING
// DEPARTMENT inside it. A card per group put five departments and twenty
// questions on one page, which is a form rather than a carousel; a card per
// question would be hundreds of steps. A department is the unit someone
// actually thinks in — "now let us do Imaging" — and it is what the progress
// rail counts.
//
// A supporting department is never a step: it carries no questions, being sized
// by a rule instead, so a card for one would be a page with nothing on it.
//
// BIG TYPE, FILLING THE CANVAS. This is the one screen in the app read from
// across a desk rather than worked in — someone answers it while someone else
// talks — so it is set at presentation size rather than at the panel sizes the
// rest of the app uses.
//
// Nothing here is saved. See useTestRun.jsx.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useCatalog } from '../../data/catalog.jsx'
import { functionColours } from '../../data/functions.js'
import Toggle from '../primitives/Toggle.jsx'
import { CountField, PanelNote } from '../panel/panelParts.jsx'
import { Branch, BranchRoot, BRANCH_ORIGIN_CONTENT, TreeLayer, useRootAnchor } from '../panel/PanelTree.jsx'
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'
import { buildModel, SUPPORTING } from './questionModel.js'
import { useTestRun } from './useTestRun.jsx'

const RAIL_WIDTH = 240
const CARD_MAX = 860

const INK = '#1a73e8'

// THE DECK: ONE CARD PER SECTION, and that is the whole of it.
//
// A section's card asks its gates and then OPENS each group that was answered
// yes, inline, with its departments and their questions under it. So answering
// never navigates: the thing you switched on grows under your finger and the
// section you are in stays on screen above it.
//
//   >>> A DEPARTMENT USED TO BE A CARD OF ITS OWN. Saying yes to a group then
//   >>> threw you forward into a run of department cards with only their own
//   >>> names for context, and by the third nobody could say which group they
//   >>> were answering or how many were left. A gate and what it opens belong
//   >>> on one page.
//
// The deck therefore never changes as answers are given, which is also what
// makes an index into it safe to hold.
function deckOf(model) {
  return model.map((section) => ({ id: `section:${section.id}`, section }))
}

// --- The rail -----------------------------------------------------------------
//
// A VERTICAL BAR WITH ONE TICK PER SECTION, each titled. Sections are the only
// thing marked on it and they are drawn EQUALLY SIZED, whatever they hold.
//
//   >>> A SECTION'S SPACE IS NOT ITS CONTENT. Sizing each by how many groups it
//   >>> held made Diagnostics four times Emergency and the whole rail lumpy,
//   >>> and it answered a question nobody asks of a progress scale. Equal
//   >>> divisions read as stages, which is what they are.
//
//   >>> GROUPS ARE NOT MARKED AT ALL — no tick, no label. Twenty of either down
//   >>> a 240px column was a wall competing with the section titles for the
//   >>> same glance. Which group and department you are in is said once, above
//   >>> the bar, in words.
//
// A SECTION IS A TITLE, NOT A CARD. The box-and-wash treatment the canvases use
// for a container says "things are inside this", and after the groups came off
// there was nothing inside it to say that about — just a coloured slab behind a
// word. The hue stayed on the tick, which is where it reads as a mark on a
// scale rather than as a surface.
//
// THE KNUB RESTS ON A SECTION'S TICK. It does not scrub through the groups
// inside one, so it stands still while you work down a section and moves when
// you leave it — the scale marks sections and nothing else, so a knub between
// two ticks would be pointing at a position the scale cannot describe. Same
// control as CanvasFrame's otherwise: fixed size, position only.
//
// IT NEVER SCROLLS: the deck is fitted to the pane, so the whole run is one
// picture rather than a window onto one. A scrollbar here would have been a
// THIRD in the app's furniture after the canvas gutters and side's own, and the
// thing it scrolled is already what the bar is measuring.

const BAR_X = 17
const BAR_W = 6
// The boxes start clear of the bar: it is a scale they are measured against, and
// one running through them would read as part of one.
const BOX_LEFT = 36
const TICK_BIG = 22
const KNUB = 19
// Only a fallback, for the frame before the pane has been measured: the
// divisions are the pane divided by how many sections there are.
const SECTION_ROW = 46

// The deck grouped by section, each carrying the RANGE of deck steps it covers.
// Walking the model again would be a second source of truth for what the steps
// are.
function railSections(deck) {
  const out = []
  deck.forEach((step, i) => {
    const last = out[out.length - 1]
    if (last?.id === step.section.id) {
      last.end = i
      return
    }
    out.push({
      id: step.section.id,
      label: step.section.name,
      functionId: step.section.functionId,
      start: i,
      end: i,
      groups: step.section.groups,
    })
  })
  return out
}

// HAS ANYONE ANSWERED ANYTHING IN THIS GROUP? Not "is it yes" — a gate answered
// NO is answered, and a run is read by what has been decided rather than by what
// was said. An absent key is the only thing that means untouched, which is why
// the flags are read for existence and the counts for being above zero.
function groupTouched(group, run) {
  if (run.answers.gates[group.id] !== undefined) return true
  return group.departments.some((department) =>
    department.questions.some(
      (node) =>
        run.answers.questions[node.id] !== undefined ||
        node.connections.some((c) => (run.answers.counts[c.instance_id] ?? 0) > 0)
    )
  )
}

// WHERE A DECK INDEX SITS ON THE SCALE, as a fraction of the whole, and back
// again. One pair of functions, because the knub's position and what a drag
// lands on have to be the same mapping read in two directions — two of them is
// how a knub ends up not under the pointer.
//
// CENTRED IN THE SECTION'S SHARE, not at the top of it — the box's title is
// centred and the tick, the knub and that word all have to sit on one line, or
// the mark and the thing it marks read as two different positions.
function fractionOf(list, at) {
  const i = list.findIndex((s) => at >= s.start && at <= s.end)
  return i < 0 ? 0 : (i + 0.5) / list.length
}

function stepAt(list, fraction) {
  if (list.length === 0) return 0
  const clamped = Math.max(0, Math.min(0.9999, fraction))
  return list[Math.floor(clamped * list.length)].start
}

function Rail({ deck, at, onJump, functions, run }) {
  const list = railSections(deck)
  const trackRef = useRef(null)

  // The pane's height, measured — the one number the browser cannot give us in
  // CSS, because the section height is a MIN of a constant and a share of it.
  const [paneHeight, setPaneHeight] = useState(0)
  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => setPaneHeight(el.clientHeight))
    ro.observe(el)
    setPaneHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // EQUAL DIVISIONS FILLING THE PANE. The bar is the height of the window, so a
  // section's share is the pane divided by however many there are — the scale
  // is read as "how far down the building am I", and a scale that stopped short
  // of the bottom would answer that with the wrong picture.
  //
  // This is only safe because the rail carries SECTION TITLES ALONE: a handful
  // of divisions stretch to a comfortable size, where the group rows this once
  // had would each have become 60px of empty space.
  const rowH = paneHeight > 0 && list.length > 0 ? paneHeight / list.length : SECTION_ROW
  const total = rowH * list.length

  const fraction = fractionOf(list, at)
  const knubY = fraction * total

  // Dragging reads the pointer against the TRACK, not against where the drag
  // began: the knub is small and a drag that accumulated would drift off the
  // pointer over a long pull. Pointer capture is what keeps the moves coming
  // once the pointer leaves the 2px bar, which it does immediately.
  //
  // Measured against the DRAWING's height, not the pane's: a short deck leaves
  // empty pane below it, and dividing by the pane would put every tick above
  // where the pointer says it is.
  const drag = (e) => {
    const box = trackRef.current?.getBoundingClientRect()
    if (!box || total === 0) return
    onJump(stepAt(list, (e.clientY - box.top) / total))
  }

  return (
    <div
      style={{
        width: RAIL_WIDTH,
        flexShrink: 0,
        borderRight: '1px solid #ececec',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* NO HEADING. The scale is the whole of it: which group and department
          you are in is on the card itself, two inches to the right and set
          larger than any caption here could be. */}
      {/* NO SCROLLBAR either. The deck is mapped onto this box, whatever its
          height. */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '8px 8px 8px 0' }}>
        <div ref={trackRef} style={{ position: 'relative', height: '100%', minWidth: 0 }}>
          {/* The bar, and the run behind the knub. */}
          <div
            style={{
              position: 'absolute',
              left: BAR_X - BAR_W / 2,
              top: 0,
              width: BAR_W,
              height: total,
              borderRadius: BAR_W / 2,
              background: '#e8e8e8',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: BAR_X - BAR_W / 2,
              top: 0,
              width: BAR_W,
              height: knubY,
              borderRadius: BAR_W / 2,
              background: '#888',
            }}
          />

          {/* THE KNUB. Fixed size and position only, as CanvasFrame's is: a
              proportional thumb would grow and shrink as gates opened and
              closed the deck under it. Clicking the bar itself jumps, so the
              whole scale is a target and not just the 15px on it. */}
          <div
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drag(e)
            }}
            onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && drag(e)}
            title="Drag to move through the questionnaire"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: total,
              width: BAR_X * 2,
              cursor: 'grab',
              touchAction: 'none',
              zIndex: 2,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: BAR_X - KNUB / 2,
                top: knubY,
                marginTop: -KNUB / 2,
                width: KNUB,
                height: KNUB,
                borderRadius: '50%',
                background: '#fff',
                border: '3px solid #777',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }}
            />
          </div>

          {list.map((section, i) => {
            const top = i * rowH
            const here = at >= section.start && at <= section.end
            const touchedCount = section.groups.filter((g) => groupTouched(g, run)).length
            // Reached, rather than answered: the tick is on the scale and the
            // scale is about position. The pips inside the box are what say
            // whether anything was actually decided there.
            const passed = at > section.end
            const colours = functionColours(functions, section.functionId)

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onJump(section.start)}
                title={section.label}
                style={{
                  position: 'absolute',
                  // The tick is at the TOP of a section's space: it marks where
                  // that section begins, and the space below it is the run
                  // through it.
                  top,
                  left: 0,
                  right: 0,
                  height: rowH,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  minWidth: 0,
                }}
              >
                {/* THE TICK, drawn ACROSS the bar rather than beside it — a mark
                    on a scale. IT CARRIES THE FUNCTION HUE once reached; grey
                    until then, because a colour that meant both "what this is"
                    and "where you are" would mean neither. */}
                <span
                  style={{
                    position: 'absolute',
                    left: BAR_X - TICK_BIG / 2,
                    top: '50%',
                    marginTop: -2,
                    width: TICK_BIG,
                    height: 4,
                    borderRadius: 2,
                    background: here || passed ? colours.border : '#d0d0d0',
                  }}
                />

                {/* THE BOX: the section's whole share of the scale, painted in
                    its own hue. The title is CENTRED in it because the box is
                    the division — a title pinned to the top would read as a
                    heading over the space below rather than as the name of it.
                    The one you are on is deepened and ringed; nothing else has
                    to change, since the hue is saying what rather than where. */}
                <span
                  style={{
                    position: 'absolute',
                    left: BOX_LEFT,
                    right: 0,
                    top: 2,
                    bottom: 2,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '0 10px',
                    background: colours.wash(here ? 0.66 : 0.88),
                    boxShadow: here ? `inset 0 0 0 2px ${colours.border}` : 'none',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      // The hue's own dark ink, which is legible on a wash of
                      // it whatever the function — a fixed grey is not.
                      color: colours.inverted.color,
                      opacity: here || touchedCount > 0 ? 1 : 0.5,
                    }}
                  >
                    {section.label}
                  </span>

                  {/* ONE PIP PER GROUP, FILLED ONCE ANSWERED. What the knub
                      cannot say: it only marks where you ARE, so walking back
                      up the rail would otherwise leave the sections ahead
                      looking untouched however much had been answered in them.
                      This is the group level back on the scale in the only form
                      that costs no room — see the note on why the labels went. */}
                  {section.groups.length > 0 && (
                    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {section.groups.map((group) => {
                        const done = groupTouched(group, run)
                        return (
                          <span
                            key={group.id}
                            title={`${group.name}${done ? ' — answered' : ' — not yet'}`}
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: done ? colours.inverted.color : 'transparent',
                              border: `1px solid ${colours.inverted.color}`,
                              opacity: done ? 0.9 : 0.35,
                            }}
                          />
                        )
                      })}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// --- The cards ----------------------------------------------------------------

// THE SECTION IS A HEADER, NEVER A QUESTION. Nothing asks whether a section
// exists — it is the divider the catalog is organised by, and the first thing
// asked is always a group. Its name sits over the card so you know where you
// are, and it is the same string the rail's big tick carries.
function Eyebrow({ children }) {
  return (
    <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999' }}>{children}</div>
  )
}


// Row heights, because a branch has to meet its row at a KNOWN point — `head`
// is measured from the top of the branch's own box, so a row that sized itself
// to its text would put the elbow somewhere else on every card.
const GATE_ROW = 34
const DEPT_ROW = 26
const QUESTION_ROW = 26
const CONNECTION_ROW = 26

// THE TYPE LADDER, largest first, one step per level of the tree: the group is
// what the section asks, a department is what that opened, a question is asked
// about the department and a connection is its answer. Each level smaller than
// the one it hangs off — an answer set larger than its question read as the
// subject of the card rather than as the reply to it.
const GATE_TYPE = 22
const DEPT_TYPE = 17
const QUESTION_TYPE = 15
const CONNECTION_TYPE = 14

// WHERE EVERY ANSWER SITS, from the card's own left edge. The switches and the
// counters are a COLUMN, so it is set once on the box the whole tree is drawn
// in and every row inside ends on it whatever its depth. Left to the card's full
// width, a 15px question put its switch a hand's width away with nothing in
// between, and the eye had to travel the gap to find out what it had answered.
const ANSWER_COLUMN = 560

// THE GROUP'S OWN ROW, and the root everything in the card hangs off. It takes
// no branch of its own — there is nothing above it in this card — so it is
// `BranchRoot`'s anchor, exactly as a department's heading is in PanelShell.
function GateRow({ group, gate, yes, run }) {
  const anchor = useRootAnchor()

  return (
    <>
      <div
        ref={anchor}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          height: GATE_ROW,
          paddingLeft: BRANCH_ORIGIN_CONTENT,
          minWidth: 0,
        }}
      >
        {/* The authored prompt when there is one — the gate still owns the
            wording — and the group's own name when there is not. */}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: GATE_TYPE,
            fontWeight: 600,
          }}
        >
          {gate?.prompt || group.name}
        </span>

        <span style={{ transform: 'scale(1.25)', transformOrigin: 'center right', flexShrink: 0 }}>
          <Toggle
            checked={yes}
            onChange={(v) => run.setGate(group.id, { yes: v })}
            title={gate?.prompt || group.name}
          />
        </span>
      </div>

      {gate?.comment && (
        <div
          style={{
            fontSize: 13,
            color: '#888',
            marginTop: 6,
            paddingLeft: BRANCH_ORIGIN_CONTENT,
            whiteSpace: 'pre-wrap',
          }}
        >
          {gate.comment}
        </div>
      )}

      {/* A gate's number is a headline figure for the brief and sizes nothing of
          its own — see data/questionnaire.js. It is the group's own row rather
          than a child, so it gets no branch. */}
      {yes && gate?.number && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginTop: 10,
            paddingLeft: BRANCH_ORIGIN_CONTENT,
            fontSize: 15,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, color: '#555' }}>{gate.number.label || 'How many in total?'}</span>
          <CountField
            value={run.answers.gates[group.id]?.number ?? 0}
            min={0}
            step={1}
            prefix=""
            width={90}
            onChange={(n) => run.setGate(group.id, { number: n })}
          />
        </div>
      )}
    </>
  )
}

// THE SECTION'S OWN CARD: what is in it, and a way into any of it.
//
// It asks nothing. Next walks the groups in order, and this is what makes that
// order visible and skippable — the one place you can see a whole section at
// once and go back to the group you meant.
function SectionCard({ step, run, revealedOf, onReveal }) {
  const { section } = step
  // EVERY GROUP IS ALWAYS VISIBLE. The gates are what the section asks, and a
  // section that showed one at a time would hide the question it exists to put.
  const groups = section.groups

  return (
    <div style={{ minWidth: 0 }}>
      <Eyebrow>Section</Eyebrow>
      <div style={{ fontSize: 38, lineHeight: 1.15, fontWeight: 600, marginTop: 6 }}>{section.name}</div>
      <div style={{ fontSize: 15, color: '#777', marginTop: 10 }}>
        {section.groups.length === 0
          ? 'Nothing is asked in this section yet.'
          : 'Which of these does the facility have?'}
      </div>

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups.map((group) => {
          const yes = run.gateYes(group.id)
          const gate = group.gate
          const all = group.departments.filter((d) => d.role !== SUPPORTING)
          const supporting = group.departments.filter((d) => d.role === SUPPORTING)
          // ONE DEPARTMENT AT A TIME, INSIDE THE GROUP. A group of six opened at
          // once is six departments and their questions in one drop, which is
          // the wall this tab exists to avoid.
          const shown = revealedOf(group.id)
          const functioning = all.slice(0, shown)
          const more = all.length - functioning.length

          return (
            <div
              key={group.id}
              style={{
                padding: '14px 18px',
                borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.08)',
                background: '#fff',
                minWidth: 0,
              }}
            >
              {/* THE SAME TREE THE PANELS AND THE OUTLINE DRAW — one drawing over
                  the group, hanging off the gate's own row. What is under a
                  question and what is under a department were two indents saying
                  so; this says it in the app's own ink.
                  The width is ANSWER_COLUMN's: every row inside ends on the same
                  right edge whatever its depth, which is what makes the switches
                  and counters a column. */}
              <div style={{ maxWidth: ANSWER_COLUMN, minWidth: 0 }}>
              <TreeLayer>
                <BranchRoot>
                  <GateRow group={group} gate={gate} yes={yes} run={run} />

                  {/* YES OPENS THE GROUP HERE, under the switch that opened it.
                      The departments used to be cards of their own and you lost
                      the thread by the third — see the note on deckOf. */}
                  {yes && functioning.length === 0 && (
                    <PanelNote>Nothing is asked about this group yet.</PanelNote>
                  )}
                  {yes &&
                    functioning.map((department) => (
                      <DepartmentBlock key={department.id} department={department} run={run} />
                    ))}
                </BranchRoot>
              </TreeLayer>
              </div>

              {/* THE REVEAL, at the foot of what this group has opened — it is
                  the next thing you will read, so it stands where your eye
                  already is. It goes once the group is fully out; the bar's own
                  Next is what leaves for the next section, and two buttons
                  meaning "onward" on one screen would be one too many. */}
              {yes && more > 0 && (
                <button
                  type="button"
                  onClick={() => onReveal(group.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: ANSWER_COLUMN,
                    marginTop: 12,
                    padding: '10px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: 'left',
                    borderRadius: 8,
                    border: '1px dashed rgba(0,0,0,0.18)',
                    background: 'rgba(0,0,0,0.015)',
                    color: '#666',
                    cursor: 'pointer',
                  }}
                >
                  Next — {more} more in {group.name}
                </button>
              )}

              {yes && supporting.length > 0 && (
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 10, paddingLeft: BRANCH_ORIGIN_CONTENT }}>
                  {supporting.map((d) => d.name).join(', ')} {supporting.length === 1 ? 'is' : 'are'} sized by a rule
                  and never asked for.
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ONE DEPARTMENT, INSIDE ITS GROUP'S ROW: its questions, and under each yes what
// it connects to, with their counters. This is where most of a run is spent.
//
// Its name is a heading rather than a card: it sits inside the group that is
// already boxed, and a box inside a box inside the section's own card is three
// borders saying one thing.
function DepartmentBlock({ department, run }) {
  return (
    <Branch endpoint="dot" padTop={14} head={14 + DEPT_ROW / 2}>
      <div
        style={{
          height: DEPT_ROW,
          display: 'flex',
          alignItems: 'center',
          fontSize: DEPT_TYPE,
          fontWeight: 600,
          color: '#555',
        }}
      >
        {department.name}
      </div>

      {department.questions.length === 0 && (
        <PanelNote>Nothing is asked about this department yet — author it on the Questions tab.</PanelNote>
      )}

      {department.questions.map((node) => {
        const asked = run.questionYes(node.id)
        return (
          <Branch key={node.id} endpoint="dot" padTop={10} head={10 + QUESTION_ROW / 2}>
            <div style={{ minHeight: QUESTION_ROW, display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: QUESTION_TYPE, lineHeight: 1.35 }}>
                {node.question.prompt || 'Untitled question'}
              </span>
              <span style={{ flexShrink: 0 }}>
                <Toggle
                  checked={asked}
                  onChange={(v) => run.setQuestion(node.id, { yes: v })}
                  title={node.question.prompt}
                />
              </span>
            </div>

            {/* The comment is the question's own row, not a child of it — it
                gets no branch, and the trunk simply runs past it. */}
            {node.question.comment && (
              <div style={{ fontSize: 13, color: '#999', marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {node.question.comment}
              </div>
            )}

            {/* The follow-up, and it is always the same thing: what the question
                connects to, one counter each. */}
            {asked && node.connections.length === 0 && (
              <PanelNote>This question connects to no rooms yet.</PanelNote>
            )}
            {asked &&
              node.connections.map((connection) => (
                <Branch key={connection.instance_id} endpoint="dot" head={CONNECTION_ROW / 2}>
                  <ConnectionRow
                    connection={connection}
                    count={run.countOf(connection.instance_id)}
                    onCount={(n) => run.setCount(connection.instance_id, n)}
                  />
                </Branch>
              ))}
          </Branch>
        )
      })}
    </Branch>
  )
}

// One connection — a catalog room group or a single room — and the counter that
// is its whole answer. 0 is "not chosen" and the row is greyed at it, the same
// reading the designer draws.
//
// >>> THE ROOMS A GROUP BRINGS ARE NOT LISTED HERE. A run is answered by what a
// >>> thing IS — two 3 Tesla MRIs — not by which rooms that buys, and the list
// >>> sat under the one row on the card that already had a number to read. Side
// >>> is where the rooms appear, as they are counted.
function ConnectionRow({ connection, count, onCount }) {
  const chosen = count > 0

  return (
    <div
      style={{
        height: CONNECTION_ROW,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        minWidth: 0,
        fontSize: CONNECTION_TYPE,
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: chosen ? '#222' : '#aaa',
        }}
      >
        {connection.name}
      </span>
      <CountField
        value={count}
        min={0}
        step={1}
        prefix=""
        width={84}
        colour={chosen ? '#333' : '#bbb'}
        title={`How many ${connection.name}`}
        onChange={onCount}
      />
    </div>
  )
}

// --- The tab ------------------------------------------------------------------

export default function TestRun({ buildingId }) {
  const { sections, groups, departments, rooms, functions } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  const run = useTestRun()

  const model = buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms })
  const deck = deckOf(model)

  const [at, setAt] = useState(0)
  // HOW MANY DEPARTMENTS EACH GROUP HAS REVEALED, by group instance id — kept
  // here rather than in the card so stepping to the next section and back does
  // not close a group you had worked through. One is the start.
  const [revealed, setRevealed] = useState({})

  // Switching building changes the deck under the pointer; without this, step 7
  // of a long building becomes an out-of-range index in a short one, and a
  // reveal count belongs to the building it was counted in.
  useEffect(() => {
    setAt(0)
    setRevealed({})
  }, [buildingId])

  const here = Math.min(at, Math.max(deck.length - 1, 0))
  const step = deck[here]

  // THE CANVAS TAKES THE SECTION'S COLOUR. A PALE WASH, not the solid: the rows
  // on it are white and their text is black, and the heading is read at 38px.
  // 0.9 is far enough toward white to carry both and still be a hue rather than
  // a grey.
  const stepColours = functionColours(functions, step?.section.functionId ?? null)

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* NO BANDS ON THIS TAB — no project, no option, no building picker. This
          is a run of the questionnaire from the top, and the things those rows
          switch between would all restart it. The building comes from `b=`, set
          on the Questions tab; the footer's own Test run button is the way out.
          App drops its band for this view too. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', minWidth: 0 }}>
        <Rail deck={deck} at={here} onJump={setAt} functions={functions} run={run} />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!step ? (
            <PanelNote pad>
              Nothing to ask for this building yet. Author its questions on the Questions tab.
            </PanelNote>
          ) : (
            <>
              {/* THE CARD FILLS WHAT IS LEFT, capped so a line of 38px text on a
                  wide screen does not run past what an eye tracks in one go. */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '40px 32px',
                  background: stepColours.wash(0.9),
                  transition: 'background-color 200ms ease',
                }}
              >
                <div style={{ maxWidth: CARD_MAX, margin: '0 auto', minWidth: 0, color: '#1a1a1a' }}>
                  <SectionCard
                    step={step}
                    run={run}
                    revealedOf={(groupId) => revealed[groupId] ?? 1}
                    onReveal={(groupId) =>
                      setRevealed((r) => ({ ...r, [groupId]: (r[groupId] ?? 1) + 1 }))
                    }
                  />
                </div>
              </div>

              <div
                style={{
                  borderTop: '1px solid #ececec',
                  padding: '12px 32px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                {/* BACK SITS BESIDE NEXT. The two that step through the deck
                    are one control in two halves, and Start over — which is not
                    navigation but undoing the whole run — goes to the far end
                    where it cannot be hit for Back. */}
                <button
                  type="button"
                  onClick={() => {
                    run.reset()
                    setAt(0)
                    setRevealed({})
                  }}
                  style={{
                    padding: '9px 16px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: '#888',
                    cursor: 'pointer',
                  }}
                >
                  Start over
                </button>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 13, color: '#999' }}>
                  {here + 1} of {deck.length}
                </span>
                <Step label="Back" disabled={here === 0} onClick={() => setAt(Math.max(0, here - 1))} />
                <Step
                  label="Next"
                  primary
                  disabled={here >= deck.length - 1}
                  onClick={() => setAt(Math.min(deck.length - 1, here + 1))}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Step({ label, onClick, disabled, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '9px 24px',
        fontSize: 14,
        fontWeight: 600,
        borderRadius: 6,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        border: primary ? 'none' : '1px solid #ccc',
        background: primary ? INK : '#fff',
        color: primary ? '#fff' : '#333',
      }}
    >
      {label}
    </button>
  )
}
