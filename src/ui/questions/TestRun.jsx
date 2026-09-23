// THE TEST RUN, in main: the questionnaire as a carousel.
//
// ONE CARD IS ONE SECTION. Its gates are its rows, and a yes opens that group's
// questions in place, one after another.
//
// IT NAMES NOTHING THE QUESTIONNAIRE IS BUILT FROM — no "section", no
// department, no room. Those are the author's words for the document's own
// levels, and this tab is read by whoever is being asked, who did not write it
// and cannot act on any of them. What is asked is a prompt and a number; what
// the number buys is drawn in SIDE, as the building fills up.
//
// BIG TYPE, FILLING THE CANVAS. This is the one screen in the app read from
// across a desk rather than worked in — someone answers it while someone else
// talks — so it is set at presentation size rather than at the panel sizes the
// rest of the app uses.
//
// Nothing here is saved. See useTestRun.jsx.

import { Children, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useCatalog } from '../../data/catalog.jsx'
import { functionColours } from '../../data/functions.js'
import Toggle from '../primitives/Toggle.jsx'
import useHoldRepeat from '../primitives/useHoldRepeat.js'
import { CountField, PanelNote } from '../panel/panelParts.jsx'
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'
import { buildModel, scopeToDmgs, SUPPORTING } from './questionModel.js'
import { bedTally, useTestRun } from './useTestRun.jsx'

const RAIL_WIDTH = 240
const CARD_MAX = 860

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
  return (
    model
      // GENERAL IS THE FIRST CARD, and it is dropped when nothing has been
      // authored on it — an empty card at the head of the deck is a page saying
      // nothing in front of every run. Every other section keeps its card
      // whatever it holds, because the deck is the shape of the building.
      .filter((section) => section.kind !== 'general' || section.questions.length > 0)
      .map((section) => ({ id: `section:${section.id}`, section }))
  )
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
    department.questions.some((node) => run.answers.questions[node.id] !== undefined)
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

// >>> NOTHING ON THIS TAB NAMES THE DATA. No "Section" eyebrow, no department
// >>> heading, no room names — the words a questionnaire is BUILT from are the
// >>> author's vocabulary, and this tab is read by whoever is being asked. The
// >>> section's name is still the card's title because it is a place in a
// >>> hospital; what went is the label saying what kind of thing that name is.

const GATE_ROW = 34
const QUESTION_ROW = 26

// Two levels, not four: what is asked about, and the questions. A department is
// no longer drawn, so its step in the ladder went with it.
const GATE_TYPE = 22
const QUESTION_TYPE = 16

// WHERE EVERY ANSWER SITS, from the card's own left edge. The switches and the
// counters are a COLUMN, so it is set once on the box the whole tree is drawn
// in and every row inside ends on it whatever its depth. Left to the card's full
// width, a 15px question put its switch a hand's width away with nothing in
// between, and the eye had to travel the gap to find out what it had answered.
const ANSWER_COLUMN = 560

// THE END OF EVERY ROW IS THREE FIXED SLOTS: the stepper, the box, the unit.
// Fixed, because left to the flex row a box was pushed left by exactly the width
// of the unit beside it — so "1 beds" sat half an inch inside the boxes with no
// unit at all, and the answers read as a ragged edge rather than as one thing to
// fill in. Each slot is left-aligned, and the box's slot is only as wide as the
// box: leftover width there prints as a gap between the figure and its unit.
const STEP_COL = 40
const FIELD_COL = 58
const UNIT_COL = 64
const ANSWER_GAP = 6
// The answer boxes' and steppers' stroke: ink, not the app's pale #ddd, which
// disappeared on the white group cards.
const ANSWER_STROKE = '#222'
// Every card's stroke on this tab.
const CARD_STROKE = '#9a9a9a'

// A RULE BETWEEN QUESTIONS, never above the first or under the last — the
// card's own edge already does that job. One list for every card, so no card
// can be the one without them.
function RuledList({ children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {Children.toArray(children).map((child, i) => (
        <div
          key={child.key ?? i}
          style={{
            paddingBlock: 12,
            borderTop: i === 0 ? 'none' : '1px solid #bdbdbd',
            ...(i === 0 ? { paddingTop: 0 } : null),
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

// THE UNIT IS NEVER CUT OFF, AND NEVER MOVES THE FIELDS. A fixed width that a
// long unit simply runs past to the right: a width that GREW with its text
// pushed that row's stepper and box left, since the rows are right-aligned, and
// the answers stopped being one column.
const unitStyle = {
  width: UNIT_COL,
  flexShrink: 0,
  fontSize: 12,
  color: '#999',
  whiteSpace: 'nowrap',
  overflow: 'visible',
}

// THE COUNTER SITS OUTSIDE THE BOX, to its left. CountField's own steppers live
// INSIDE the border — right for a figure in a sentence, wrong for a box someone
// is filling in, where they crowd the caret they share a frame with.
//
// It nudges the answer directly rather than through the field, so the two agree:
// the field redraws from `value` whenever nobody is typing in it.
function Stepper({ value, onChange }) {
  const from = Number.isFinite(value) ? value : 0
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      <StepKey label="−" by={-1} from={from} onChange={onChange} />
      <StepKey label="+" by={1} from={from} onChange={onChange} />
    </span>
  )
}

// PRESS AND HOLD KEEPS GOING, the same as every other stepper in the app —
// `useHoldRepeat`, which is where that behaviour is defined. Nothing is
// committed on release: this tab writes nowhere.
//
// It steps from a ref rather than from `from`, because at the fast end of a hold
// two ticks can land inside one render and the second would otherwise read the
// value the first had already replaced.
function StepKey({ label, by, from, onChange }) {
  const at = useRef(from)
  at.current = from
  const step = () => {
    const next = Math.max(0, at.current + by)
    at.current = next
    onChange(next)
  }

  const disabled = by < 0 && from === 0

  return (
    <button
      type="button"
      {...useHoldRepeat(disabled ? () => {} : step, null)}
      title={by < 0 ? 'One fewer — hold to keep going' : 'One more — hold to keep going'}
      disabled={disabled}
      style={{
        width: 18,
        height: 22,
        padding: 0,
        fontSize: 14,
        lineHeight: '20px',
        borderRadius: 4,
        border: `1px solid ${ANSWER_STROKE}`,
        background: '#fff',
        color: '#222',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {label}
    </button>
  )
}

// THE GROUP'S OWN ROW: the one thing the section asks, and the switch for it.
// It is the card's TITLE STRIP: in the group's colour once yes, and the switch
// at its far right edge rather than in the answer column — it answers the whole
// card, not one row in it.
function GateRow({ group, gate, yes, run, tint, ink = '#222' }) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          height: GATE_ROW,
          minWidth: 0,
          color: ink,
          transition: 'color 250ms ease',
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

        <span style={{ flexShrink: 0, transform: 'scale(1.25)', transformOrigin: 'center right' }}>
          <Toggle
            checked={yes}
            onChange={(v) => run.setGate(group.id, { yes: v })}
            title={gate?.prompt || group.name}
            tint={tint}
          />
        </span>
      </div>

      {gate?.comment && (
        <div
          style={{
            fontSize: 13,
            color: '#888',
            marginTop: 6,
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
            fontSize: 15,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, color: '#555' }}>{gate.number.label || 'How many in total?'}</span>
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: ANSWER_GAP }}>
            <span style={{ width: STEP_COL, display: 'flex', justifyContent: 'flex-start' }}>
              <Stepper
                value={run.answers.gates[group.id]?.number}
                onChange={(n) => run.setGate(group.id, { number: n })}
              />
            </span>
            <span style={{ width: FIELD_COL, display: 'flex', justifyContent: 'flex-start' }}>
              <CountField
                value={run.answers.gates[group.id]?.number ?? 0}
                min={0}
                step={1}
                prefix=""
                boxed
                digits={4}
                steppers={false}
                size="1.15em"
                colour="#222"
                boxBorder={ANSWER_STROKE}
                onChange={(n) => run.setGate(group.id, { number: n })}
              />
            </span>
            <span style={{ width: UNIT_COL }} />
          </span>
        </div>
      )}
    </>
  )
}

// THE SECTION'S OWN CARD: its gates, and under each yes the questions that gate
// opened — one after another, in order, and nothing else.
//
// >>> THE TREE IS GONE FROM HERE, and so is every level it was drawing. What a
// >>> group opened was a department heading, its questions under it, and each
// >>> question's rooms under those: four levels of structure to carry ONE number
// >>> per question. The person answering does not know what a department is
// >>> called, does not choose it, and cannot act on the room list — the whole
// >>> reply is the figure in the box. Two levels, no indent, no ink: the gate,
// >>> then the questions. Side is where the building appears as it is built.
// GENERAL: THE FACILITY'S OWN QUESTIONS, and the only card with no gates. There
// is nothing to switch on — these are asked of every building — so its questions
// stand directly on the card, in the one box, at the same pitch a group's are.
//
// It is answered FIRST because everything after it may read the answers: see
// GENERAL in data/questionnaire.js.
function GeneralCard({ section, run, beds }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 38, lineHeight: 1.15, fontWeight: 600 }}>{section.name}</div>

      <div style={{ marginTop: 24 }}>
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 8,
            // The group cards' stroke, so the first card is not the one that
            // melts into the wash.
            border: `1px solid ${CARD_STROKE}`,
            background: '#fff',
            minWidth: 0,
          }}
        >
          <div style={{ maxWidth: ANSWER_COLUMN, minWidth: 0 }}>
            <RuledList>
              {section.questions.map((node) => (
                <GeneralRow key={node.id} node={node} run={run} beds={beds} />
              ))}
            </RuledList>
          </div>
        </div>
      </div>
    </div>
  )
}

// ONE GENERAL QUESTION. Three kinds, one row shape: the prompt, then the answer
// in the same three slots every other row on this tab ends with, so a column of
// mixed kinds still reads as one column.
function GeneralRow({ node, run, beds }) {
  const kind = node.question.kind ?? 'number'
  const given = run.generalOf(node.id)
  // THE FIGURE IT IS CHECKED AGAINST, on the row that states it. The bed count
  // is the one answer the run measures itself by, and its own row is where the
  // running total belongs — the bars beside the questions each say how one
  // answer contributed, and nothing else says how the building stands.
  const tally = node.tally === 'beds' && beds?.target ? beds : null

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ minHeight: QUESTION_ROW, display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: QUESTION_TYPE, lineHeight: 1.35 }}>
          {node.question.prompt || 'Untitled question'}
        </span>

        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: ANSWER_GAP }}>
          <span style={{ width: STEP_COL, display: 'flex', justifyContent: 'flex-start' }}>
            {kind === 'number' && (
              <Stepper value={given} onChange={(n) => run.setGeneral(node.id, n)} />
            )}
          </span>
          <span style={{ width: FIELD_COL, display: 'flex', justifyContent: 'flex-start' }}>
            {kind === 'number' && (
              <CountField
                value={Number.isFinite(given) ? given : ''}
                min={0}
                step={1}
                prefix=""
                boxed
                digits={4}
                steppers={false}
                size="1.15em"
                colour="#222"
                boxBorder={ANSWER_STROKE}
                title={node.question.prompt}
                onChange={(n) => run.setGeneral(node.id, n)}
              />
            )}
            {kind === 'yesno' && (
              <Toggle
                checked={given === true}
                onChange={(v) => run.setGeneral(node.id, v)}
                title={node.question.prompt}
              />
            )}
          </span>
          <span style={unitStyle}>
            {kind === 'number' ? node.unit : ''}
          </span>
        </span>
      </div>

      {/* TEXT TAKES THE WHOLE WIDTH, on its own line. A name or a note does not
          fit the answer column the numbers line up in, and squeezing one into it
          would make the column the widest thing on the card. */}
      {kind === 'text' && (
        <input
          type="text"
          value={typeof given === 'string' ? given : ''}
          onChange={(e) => run.setGeneral(node.id, e.target.value)}
          placeholder={node.question.comment ? '' : 'Type an answer'}
          style={{
            marginTop: 6,
            width: '100%',
            boxSizing: 'border-box',
            padding: '6px 8px',
            fontSize: 15,
            fontFamily: 'inherit',
            borderRadius: 4,
            border: '1px solid #ddd',
          }}
        />
      )}

      {kind === 'multiplier' && (
        <MultiplierSlider question={node.question} given={given} onChange={(n) => run.setGeneral(node.id, n)} />
      )}

      {kind === 'dmgs' && <DmgChoices given={given} onChange={(ids) => run.setGeneral(node.id, ids)} />}

      {tally && <BedBar mine={tally.placed} placed={tally.placed} target={tally.target} />}

      {/* BLACK, AT READING SIZE: a caption is what the person answering is told,
          from across a desk — grey 13px was a footnote nobody read. */}
      {node.question.comment && (
        <div style={{ fontSize: 17, color: '#222', marginTop: 6, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
          {node.question.comment}
        </div>
      )}
    </div>
  )
}

// A SLIDER, full width under its prompt with the figure at its end — a range
// needs the length a 58px answer column cannot give it. Untouched shows the
// default, which is also what the rules read.
function MultiplierSlider({ question, given, onChange }) {
  const value = Number.isFinite(given) ? given : question.default ?? 1
  const digits = String(question.step ?? 0.1).split('.')[1]?.length ?? 0
  return (
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
      <input
        type="range"
        min={question.min ?? 1}
        max={question.max ?? 3}
        step={question.step ?? 0.1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        title={question.prompt}
        style={{ flex: 1, minWidth: 0 }}
      />
      <span style={{ ...unitStyle, width: 'auto', fontVariantNumeric: 'tabular-nums' }}>
        {value.toFixed(digits)}
        {question.unit}
      </span>
    </div>
  )
}

// ONE SWITCH PER DMG, each a row in the answer column like a gate's. What is
// switched on decides which department groups the rest of the deck asks — see
// scopeToDmgs. The list is sp_dmg's, read live.
function DmgChoices({ given, onChange }) {
  const { dmgs } = useCatalog()
  const on = Array.isArray(given) ? given : []
  if (dmgs.length === 0) {
    return <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>No disease management groups in sp_dmg yet.</div>
  }
  // CARDS, NOT SWITCHES: a DMG is picked from a set, and a grid of them reads as
  // one choice where a column of switches read as four questions. THREE TO A
  // ROW, every card the same fixed rectangle, so the grid is one picture however
  // long a name is. The card is the whole target; chosen is filled.
  // At least one is required to go on — see needsDmg in TestRun.
  return (
    <>
    {on.length === 0 && (
      <div style={{ fontSize: 13, color: '#c5221f', marginTop: 4 }}>Pick at least one to continue.</div>
    )}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
      {dmgs.map((d) => {
        const chosen = on.includes(d.id)
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={chosen}
            title={d.name ?? ''}
            onClick={() => onChange(chosen ? on.filter((id) => id !== d.id) : [...on, d.id])}
            style={{
              height: 72,
              minWidth: 0,
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              lineHeight: 1.25,
              overflow: 'hidden',
              borderRadius: 8,
              fontSize: 15,
              fontFamily: 'inherit',
              cursor: 'pointer',
              // CHOSEN IS A BLUE EDGE BLEEDING INWARD TO WHITE — an inset glow,
              // not a fill, so the name stays black on white and no tick is
              // needed to say which are on. A shadow rather than a gradient
              // because it follows the rounded corners and it can tween.
              border: `1.5px solid ${chosen ? '#1a73e8' : '#ddd'}`,
              background: '#fff',
              boxShadow: chosen ? 'inset 0 0 14px 0 rgba(26, 115, 232, 0.2)' : 'inset 0 0 0 0 rgba(26, 115, 232, 0)',
              color: '#222',
              // ONE WEIGHT FOR BOTH STATES. Bold on select reflowed the name,
              // which cannot tween and was the jolt; the glow alone says chosen.
              fontWeight: 500,
              transition: 'box-shadow 700ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 700ms cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            {d.name ?? 'Unnamed'}
          </button>
        )
      })}
    </div>
    </>
  )
}

function SectionCard({ step, run, functions, beds }) {
  const { section } = step
  if (section.kind === 'general') return <GeneralCard section={section} run={run} beds={beds} />
  // EVERY GROUP IS ALWAYS VISIBLE. The gates are what the section asks, and a
  // section that showed one at a time would hide the question it exists to put.
  const groups = section.groups

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 38, lineHeight: 1.15, fontWeight: 600 }}>{section.name}</div>
      {section.groups.length === 0 && (
        <div style={{ fontSize: 15, color: '#777', marginTop: 10 }}>Nothing is asked here yet.</div>
      )}

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups.map((group) => {
          const yes = run.gateYes(group.id)
          const gate = group.gate
          // EVERY QUESTION IN THE GROUP, FLAT, in the order it was authored —
          // walked department by department because that is how the model is
          // shaped, not because the grouping is shown. A department that was
          // revealed one at a time is now simply part of the run: with no
          // heading to reveal, a "3 more" button named nothing.
          const questions = group.departments
            .filter((d) => d.role !== SUPPORTING)
            .flatMap((d) => d.questions)
            // A dummy is never asked — it builds in side, off other answers.
            .filter((node) => !node.dummy)

          const opened = yes && questions.length > 0
          return (
            // A TITLE CARD ONCE YES: the strip in the group's colour, the body
            // white. Off, the strip is white too — no colour for the answer
            // nobody gave, the rule the switch follows.
            <div
              key={group.id}
              style={{
                borderRadius: 8,
                // A real stroke, on or off: the pale hairline vanished against
                // the section's wash and the cards ran into one another.
                border: `1px solid ${CARD_STROKE}`,
                background: '#fff',
                overflow: 'hidden',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  padding: '10px 18px',
                  // A neutral grey for now, not the function colour.
                  background: yes ? '#dcdcdc' : '#fff',
                  transition: 'background-color 250ms ease',
                }}
              >
                <GateRow
                  group={group}
                  gate={gate}
                  yes={yes}
                  run={run}
                  ink="#222"
                  tint="#444"
                />
              </div>

              {yes && (
                <div style={{ padding: opened ? '14px 18px' : '4px 18px 12px' }}>
                  {/* ANSWER_COLUMN's width, so every field ends on one right
                      edge and the counters read as a column. */}
                  <div style={{ maxWidth: ANSWER_COLUMN, minWidth: 0 }}>
                    {!opened && <PanelNote>Nothing is asked about this yet.</PanelNote>}
                    {opened && (
                      <RuledList>
                        {questions.map((node) => (
                          <QuestionRow key={node.id} node={node} run={run} beds={beds} />
                        ))}
                      </RuledList>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// HOW MANY OF THE FACILITY'S BEDS THIS ANSWER HAS PLACED.
//
// It hangs off a question exactly when that question's rooms hold beds — which
// nothing declares and nothing should: it is a fact about the catalog (an
// is_bed object with a rule), and it changes the day a bed is placed somewhere
// else. See bedTally.
//
// THE BAR IS THE WHOLE TALLY, NOT THIS ANSWER'S SHARE: the filled part is every
// bed the run has placed so far and this question's own beds are the darker head
// of it, so a bar beside one question says both "how far the building has got"
// and "how much of that is this". Two separate readings would be two bars.
//
// OVER IS A COLOUR, NOT A LONGER BAR — the Companion's ring reached the same
// answer. Past full there is no bar left, and the fault is not "more" but
// "wrong".
const BAR_H = 6

function BedBar({ mine, placed, target }) {
  const over = placed > target
  const width = (n) => `${Math.min(100, (n / target) * 100)}%`
  const ink = over ? '#b3261e' : '#1a73e8'

  return (
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: BAR_H,
          borderRadius: BAR_H / 2,
          background: '#eee',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, width: width(placed), background: over ? '#f3c7c2' : '#cfe0fb' }} />
        <div style={{ position: 'absolute', inset: 0, width: width(mine), background: ink }} />
      </div>
      <span style={{ flexShrink: 0, fontSize: 11, color: over ? '#b3261e' : '#888', fontVariantNumeric: 'tabular-nums' }}>
        {/* On the bed count's own row the head IS the whole, so the two-part
            reading would say the same number twice. */}
        {mine === placed ? `${placed} of ${target} beds placed` : `${mine} here, ${placed} of ${target} beds`}
      </span>
    </div>
  )
}

// ONE QUESTION AND THE ONE NUMBER IT ASKS FOR. No department above it, no rooms
// under it — what the number buys is worked out and drawn in side.
function QuestionRow({ node, run, beds }) {
  const mine = beds?.byQuestion.get(node.id) ?? 0

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ minHeight: QUESTION_ROW, display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: QUESTION_TYPE, lineHeight: 1.35 }}>
          {node.question.prompt || 'Untitled question'}
        </span>
        {/* THE ONE ANSWER, AND IT IS A BOX. Everywhere else in the app a count is
            a figure in a sentence — a value being read — and `boxed` is for the
            one place the number is being SUPPLIED. Here that is the whole row:
            empty until typed (see EMPTY in useTestRun, where a 0 is an answer
            nobody gave), so unboxed it was an invisible field on a blank line and
            there was nothing on the card saying where to answer. */}
        <span
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: ANSWER_GAP,
          }}
        >
          <span style={{ width: STEP_COL, display: 'flex', justifyContent: 'flex-start' }}>
            <Stepper value={run.xOf(node.id)} onChange={(n) => run.setQuestion(node.id, { x: n })} />
          </span>
          <span style={{ width: FIELD_COL, display: 'flex', justifyContent: 'flex-start' }}>
            <CountField
              value={run.xOf(node.id) ?? ''}
              min={0}
              step={1}
              prefix=""
              boxed
              digits={4}
              steppers={false}
              size="1.15em"
              colour="#222"
              boxBorder={ANSWER_STROKE}
              title={node.question.prompt}
              onChange={(n) => run.setQuestion(node.id, { x: n })}
            />
          </span>
          <span style={unitStyle}>{node.unit}</span>
        </span>
      </div>

      {/* Only where this answer actually places beds, and only once somebody has
          said how many the facility has — a bar against no target is a bar
          against 0. */}
      {mine > 0 && beds?.target && <BedBar mine={mine} placed={beds.placed} target={beds.target} />}

      {node.question.comment && (
        <div style={{ fontSize: 13, color: '#999', marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {node.question.comment}
        </div>
      )}
    </div>
  )
}

// --- The tab ------------------------------------------------------------------

export default function TestRun({ buildingId }) {
  const { sections, groups, departments, rooms, objects, functions } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  const run = useTestRun()

  // Scoped to the DMGs answered on the General card — see scopeToDmgs.
  const model = scopeToDmgs(
    buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects }),
    run.dmgIds
  )
  const deck = deckOf(model)
  // >>> THE CARDS DRAW NO COUNTS. Every room figure the carousel had has gone
  // >>> with the room rows — side is where the building appears.
  //
  // The ONE number that comes back here is the bed tally, because it is not a
  // reading of what was built but a check on the answer above it: the beds the
  // run has placed against the bed count the facility was said to have. It is
  // whole-model for evaluateRun's reason — a bed placed in the last section
  // counts towards a bar in the first.
  const beds = bedTally(model, run)

  const [at, setAt] = useState(0)

  // NO DMG, NO FURTHER. The rest of the deck is scoped by them, and none picked
  // would ask only the untagged groups — a building nobody chose. The rail is
  // the only way through, so refusing its jump off General is the whole gate.
  // With no rows in sp_dmg there is nothing to pick and nothing is held.
  const { dmgs } = useCatalog()
  const needsDmg = dmgs.length > 0 && run.dmgIds.length === 0
  const jump = (i) => {
    if (needsDmg && deck[i]?.section.kind !== 'general') return
    setAt(i)
  }

  // Switching building changes the deck under the pointer; without this, step 7
  // of a long building becomes an out-of-range index in a short one.
  useEffect(() => {
    setAt(0)
  }, [buildingId])

  const here = Math.min(at, Math.max(deck.length - 1, 0))
  const step = deck[here]

  // SIDE DRAWS THE SECTION THIS CARD IS ON, and nothing else — so what is being
  // asked and what it has built are the same part of the building. Reported from
  // here rather than worked out again in side, because the deck is what decides
  // which section you are on and it is built in this file.
  const shownSection = step?.section.id ?? null
  useEffect(() => {
    run.setSectionId(shownSection)
  }, [shownSection, run])

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
        <Rail deck={deck} at={here} onJump={jump} functions={functions} run={run} />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!step ? (
            <PanelNote pad>
              Nothing to ask for this building yet. Author its questions on the Questions tab.
            </PanelNote>
          ) : (
            /* THE CARD FILLS WHAT IS LEFT, capped so a line of 38px text on a
               wide screen does not run past what an eye tracks in one go.
               >>> AND IT IS ALL THAT IS LEFT. Back, Next and Start over were a
               >>> bar under it, and the rail already does all three: it marks
               >>> every section, it is clickable and it is draggable. Two ways
               >>> through one deck drift apart, and the pair of them read as a
               >>> wizard you had to finish rather than a picture you move about
               >>> in. */
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
                <SectionCard step={step} run={run} functions={functions} beds={beds} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
