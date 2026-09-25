// Side, on the Test run tab: WHAT THE ANSWERS HAVE BUILT so far.
//
// The same tree the outline and the side panels draw — TreeLayer and Branch out
// of ui/panel/PanelTree.jsx — because it is the same information: what sits
// inside what. What differs is that this one is EMPTY until something is
// answered and grows a branch at a time, which is the whole point of putting it
// beside the carousel.
//
// It shows only what was said yes to and counted above zero. A section, group or
// department with nothing under it is not drawn at all — see buildProgram.
// Nothing here is saved; see useTestRun.jsx.

import { useEffect, useRef, useState } from 'react'
import { useCatalog } from '../../data/catalog.jsx'
import { functionColours } from '../../data/functions.js'
import { Branch, TreeLayer, useTreeMeasure } from '../panel/PanelTree.jsx'
import { PanelNote } from '../panel/panelParts.jsx'
import Presence, { LeavingCtx, PRESENCE_MS } from '../primitives/Presence.jsx'
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'
import { buildModel, roomLabel, scopeToDmgs } from './questionModel.js'
import { bedTally, buildProgram, evaluateRun, grossedAreas, useTestRun } from './useTestRun.jsx'
import { useAreaUnit } from '../AreaUnitContext.jsx'
import { formatArea, SQM_PER_SQFT } from '../map/area.js'
import { coolingTons } from '../../data/units.js'
import { optionSettingsOf } from './createOption.js'
import { RULE } from '../layout.js'

// THE TREE'S TEXT SIZE, in px — the one number to change. Every row's type is
// stepped down from it (group/department, then room, then object), and the row
// height scales with it so the branch lines still meet each row's middle.
const TREE_TEXT = 13
const ROW = Math.round(TREE_TEXT * (24 / 13))
const ROOM_TEXT = TREE_TEXT - 1
const OBJECT_TEXT = TREE_TEXT - 2
const TREE_SMALL = TREE_TEXT - 3

// A COUNT THAT MOVED FLASHES ITS WHOLE ROW — name and figure together — green
// up, red down, then fades. Only a change flashes: a row arriving is Presence's
// to animate, and the first value it mounts with is not a change. The key
// restarts the animation when the same direction repeats.
function useChangeFlash(n) {
  const prev = useRef(n)
  const [flash, setFlash] = useState(null)
  useEffect(() => {
    const was = prev.current
    prev.current = n
    if (Number.isFinite(was) && Number.isFinite(n) && n !== was) {
      setFlash((f) => ({ dir: n > was ? 'up' : 'down', k: (f?.k ?? 0) + 1 }))
    }
  }, [n])
  return flash
}

export const COUNT_FLASH_STYLE = `
  @keyframes trFlashUp { 0% { background-color: rgba(30, 142, 62, 0.28); color: #137333; } 100% { background-color: transparent; } }
  @keyframes trFlashDown { 0% { background-color: rgba(197, 34, 31, 0.24); color: #b3261e; } 100% { background-color: transparent; } }
  @keyframes trInkUp { 0% { color: #137333; } }
  @keyframes trInkDown { 0% { color: #b3261e; } }
  .tr-flash-up { animation: trFlashUp var(--tr-flash-ms, 1100ms) ease-out; }
  .tr-flash-down { animation: trFlashDown var(--tr-flash-ms, 1100ms) ease-out; }
  /* The text takes the colour; only the row takes the wash, or it doubles. */
  .tr-flash-up * { animation: trInkUp var(--tr-flash-ms, 1100ms) ease-out; }
  .tr-flash-down * { animation: trInkDown var(--tr-flash-ms, 1100ms) ease-out; }
  @media (prefers-reduced-motion: reduce) { .tr-flash-up, .tr-flash-up *, .tr-flash-down, .tr-flash-down * { animation: none; } }
`

// `beside` sits right after the name rather than on the panel's right edge —
// the group and department areas, read with the name they belong to.
function Row({ label, size = TREE_TEXT, weight = 400, caps = false, colour = '#222', right, beside, track }) {
  const flash = useChangeFlash(track)
  return (
    <div
      key={flash?.k ?? 0}
      className={flash ? `tr-flash-${flash.dir}` : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 8, height: ROW, minWidth: 0, borderRadius: 3 }}
    >
      <span
        title={label}
        style={{
          flex: beside ? '0 1 auto' : 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: size,
          fontWeight: weight,
          textTransform: caps ? 'uppercase' : undefined,
          letterSpacing: caps ? '0.03em' : undefined,
          color: colour,
        }}
      >
        {label}
      </span>
      {beside}
      {beside && <span style={{ flex: 1 }} />}
      {right}
    </div>
  )
}

// A room's count, in the value column every figure in this app ends on.
//
// A ROOM WITH NO COUNT SHOWS NO FIGURE — it is here because something inside it
// is counted, and a ×0 would say the opposite of what is true. The dash says
// nobody has counted the rooms, which is a different thing from none.
function Count({ n }) {
  if (n === null || n === undefined) {
    return (
      <span title="No rule on the room — only what stands in it is counted" style={{ flexShrink: 0, fontSize: ROOM_TEXT, color: '#ccc' }}>
        —
      </span>
    )
  }
  return (
    <span style={{ flexShrink: 0, fontSize: ROOM_TEXT, fontVariantNumeric: 'tabular-nums', color: '#555' }}>×{n}</span>
  )
}

// Only the objects a rule actually sized — the same filter every reading column
// here applies. A broken or unresolved rule is drawn by the carousel, which is
// where the states are told apart; this column is what got built.
function sized(room) {
  return (room.objects ?? []).filter((o) => o.state === 'ok' && o.count > 0)
}

// THE RUN'S HUD, in the slot the option's own takes on every other tab: how many
// beds this run has placed against the number it was told, and how much area.
//
// >>> IT IS A CHECK, NOT A REPORT. The tree above says what was asked for; these
// >>> two say whether it adds up to the brief. Beds first, because that is the
// >>> figure the run was given a target for — an area with no target beside it
// >>> is a reading, and a bed count with one is a question.
//
// The figures come from `bedTally`, which walks the SAME results the tree does,
// so a room on screen and a room in the total cannot be different rooms. Nothing
// here is saved — see useTestRun.jsx.
//
// THE PLOT AND WHAT FSI ALLOWS ON IT. Plot is `run.plotAreaSqm` — the very figure
// the rules read as plot_area, so the HUD and a rule cannot disagree: the project
// site's area in the creator, an ASSUMED 3 acres on the Test run tab. Footprint
// and achieved FSI are both read off it.
export function TestRunHud({ buildingId }) {
  const { buildings, sections, groups, departments, rooms, objects, equipment, dmgs } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  const run = useTestRun()
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()

  const model = scopeToDmgs(
    buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects, equipment }),
    run.dmgIds
  )
  const answered = evaluateRun(model, run)
  const { target, placed } = bedTally(model, run, answered)
  // GROSSED, as an option's HUD is: the floor area the building's factors and
  // each department's grossing come to, not the net rooms.
  const areaSqft = grossedAreas(
    buildProgram(model, run, answered),
    buildings.find((b) => b.id === buildingId),
    model
  ).building
  const over = target !== null && placed > target

  const plot = Number.isFinite(run.plotAreaSqm)
    ? { sqm: run.plotAreaSqm, sqft: run.plotAreaSqm / SQM_PER_SQFT }
    : null
  const { fsi, groundCover } = optionSettingsOf(run)
  // FOOTPRINT is the floorplate the General card shows: ground cover is a
  // PERCENTAGE of the plot (40, not 0.4). Floors are the built-up area over it,
  // to one decimal — the same arithmetic, so the card and the HUD agree.
  const footprintSqft = plot && groundCover > 0 ? (plot.sqft * groundCover) / 100 : null
  const floors = footprintSqft && areaSqft > 0 ? areaSqft / footprintSqft : null
  // FSI DESIGNED is the answer; ACHIEVED is what the run built on the plot.
  const achievedFsi = plot && plot.sqft > 0 ? areaSqft / plot.sqft : null
  const overFsi = achievedFsi !== null && fsi > 0 && achievedFsi > fsi
  const dash = '—'
  // BUA AND FOOTPRINT READ TO THE NEAREST 50, in the reader's unit — a brief
  // figure, not a measurement, so no decimal. Display only; nothing reads it.
  const toFifty = (sqft) => formatArea(Math.round(toDisplay(sqft) / 50) * 50, 0)
  // "General - 100 Beds": the DMGs answered (none is the untagged groups alone,
  // the general hospital) and the bed count stated — what was placed until then.
  const dmgNames = dmgs.filter((d) => run.dmgIds.includes(d.id)).map((d) => d.name)
  const headingBeds = target ?? placed

  return (
    <div
      style={{
        // TWICE THE OPTION HUD'S HEIGHT. Side is split 7:1 (App.jsx); 7:7/3
        // makes this a quarter of the column where the option's is an eighth.
        flex: 7 / 3,
        minHeight: 0,
        borderTop: RULE,
        background: '#fff',
        overflowY: 'auto',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* THREE ROWS, TWO COLUMNS, filling the slot edge to edge: area left, the
          building's shape right, read across in pairs. No border of its own —
          the slot's rule above is its top edge. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          // The heading row is half a cell.
          gridTemplateRows: '0.5fr repeat(3, 1fr)',
        }}
      >
        <div
          style={{
            gridColumn: '1 / -1',
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            fontSize: TITLE_SIZE + 2,
            fontWeight: 700,
            color: '#000',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {dmgNames.length ? dmgNames.join(', ') : 'General'} - {headingBeds} {headingBeds === 1 ? 'Bed' : 'Beds'}
        </div>
        {/* A TITLE IS ITS LINES, one per entry; `unit` is its last line. */}
        <Figure cell={0} label={['Built-up', 'area']} unit={AREA_UNIT} value={toFifty(areaSqft)} muted={areaSqft === 0} />
        <Figure
          cell={1}
          label={['Footprint', 'area']}
          unit={AREA_UNIT}
          value={footprintSqft === null ? dash : toFifty(footprintSqft)}
          muted={footprintSqft === null}
        />
        <Figure cell={2} label={['Cooling', 'load']} unit="TR" value={formatArea(coolingTons(areaSqft), 0)} muted={areaSqft === 0} />
        <Figure cell={3} label={['Number of', 'floors']} value={floors === null ? dash : floors.toFixed(1)} muted={floors === null} />
        <Figure
          cell={4}
          label={['Total','Beds']}
          // Against the target when there is one: the figure alone answers half
          // the question, and the half it leaves out is the one that was asked.
          value={target === null ? placed : `${placed} / ${target}`}
          muted={placed === 0}
          tone={over ? '#b3261e' : null}
        />
        <Figure
          cell={5}
          // Achieved OUT OF designed, the way beds read: what was built / the brief.
          label={['FSI', 'designed/', 'maximum']}
          value={`${achievedFsi === null ? dash : achievedFsi.toFixed(1)} / ${fsi > 0 ? fsi.toFixed(1) : dash}`}
          muted={achievedFsi === null || areaSqft === 0}
          tone={overFsi ? '#b3261e' : null}
        />
      </div>
    </div>
  )
}

// The HUD's own figure. Not Hud.jsx's: that one is bound to an option's totals
// and this tab has no option, and two components sharing a slot is not the same
// thing as sharing a definition. `cell` is its index in the 2×3 table, which
// decides which inner rules it draws.
//
// NAME LEFT AND TOP, FIGURE RIGHT. The name WRAPS in a fixed share of the cell;
// the figure takes the rest, at FIGURE_SIZE.
function Figure({ cell, label, unit, value, muted = false, tone = null }) {
  return (
    <div
      style={{
        minWidth: 0,
        minHeight: 0,
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'stretch',
        gap: 8,
        borderLeft: cell % 2 === 1 ? RULE : undefined,
        borderTop: RULE,
      }}
    >
      <div
        style={{
          flex: '0 0 38%',
          minWidth: 0,
          alignSelf: 'flex-start',
          letterSpacing: '0.04em',
          color: '#000',
          overflowWrap: 'break-word',
        }}
      >
        {/* The unit in caps too, like the rest of the title: M², FT², TR. */}
        {[...label, ...(unit ? [unit] : [])].map((line) => (
          <div key={line} style={{ ...TITLE_LINE, textTransform: 'uppercase' }}>
            {line}
          </div>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          fontSize: FIGURE_SIZE,
          fontWeight: 700,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          color: tone ?? (muted ? '#bbb' : '#222'),
        }}
      >
        {/* No unit beside the figure — each cell's title carries its own. */}
        <span>{value}</span>
      </div>
    </div>
  )
}

// ONE SIZE FOR EVERY FIGURE IN THE HUD, set by hand. Too large and the widest
// ("3.00 / 0.03") spills past the cell's right edge.
const FIGURE_SIZE = 32
// The cell's title — "BUILT UP AREA" — in px.
const TITLE_SIZE = 12
// EVERY TITLE LINE ONE SIZE AND ONE PITCH, the unit's included. A px height
// rather than a ratio, so a glyph from a fallback font ("²") cannot make its
// line taller than the others.
const TITLE_LINE = {
  fontSize: TITLE_SIZE,
  lineHeight: `${Math.round(TITLE_SIZE * 1.3)}px`,
  height: Math.round(TITLE_SIZE * 1.3),
  whiteSpace: 'nowrap',
}

// A SECTION OPENS AND SHUTS AS ONE BLOCK. Sliding each group on its own timer
// read as a stutter; one grid row moving the whole body is smooth. A shut body
// stays mounted and counts as leaving, so its tree lines drop out with it.
// Air above and below a section's title, inside its strip.
const HEAD_PAD = 6

function Collapse({ open, children }) {
  // THE LINES FOLLOW THE SLIDE. The layer measures rows once, when they
  // register — at the start, with the body still shut — so it is asked again
  // every frame until the slide has finished.
  const measure = useTreeMeasure()
  useEffect(() => {
    if (!measure) return undefined
    const end = performance.now() + PRESENCE_MS + 50
    let frame
    const tick = () => {
      measure()
      if (performance.now() < end) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [open, measure])

  return (
    <LeavingCtx.Provider value={!open}>
      <div
        className="spp-slide"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          opacity: open ? 1 : 0,
          transition: `grid-template-rows ${PRESENCE_MS}ms ease-in-out, opacity ${PRESENCE_MS}ms ease-in-out`,
        }}
      >
        {/* The air goes on a box INSIDE the clipped one: padding on the grid
            item itself cannot shrink to 0fr, and a shut section would keep it. */}
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          <div style={{ paddingTop: 8 }}>{children}</div>
        </div>
      </div>
    </LeavingCtx.Provider>
  )
}

export default function TestRunTree({ buildingId }) {
  const { buildings, sections, groups, departments, rooms, objects, equipment, functions } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  const run = useTestRun()

  const model = scopeToDmgs(
    buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects, equipment }),
    run.dmgIds
  )
  const whole = buildProgram(model, run)
  // Grossed totals for the group and department rows — see grossedAreas.
  const { byId: areas } = grossedAreas(whole, buildings.find((b) => b.id === buildingId), model)
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()
  const areaOf = (id) => (
    <span style={{ flexShrink: 0, fontSize: ROOM_TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#555' }}>
      – {formatArea(toDisplay(areas.get(id) ?? 0))}
      <span style={{ fontSize: TREE_SMALL, color: '#8a8a8a', marginLeft: 3 }}>{AREA_UNIT}</span>
    </span>
  )

  // EVERY SECTION IS LISTED, and only the one the card is on is open — so the
  // building's shape stays on screen while you answer one part of it. On the
  // General card nothing is open.
  const allSections = model
    .filter((s) => s.kind !== 'general')
    .map((s) => {
      const built = whole.find((b) => b.id === s.id)
      return {
        id: s.id,
        name: s.name,
        open: s.id === run.sectionId,
        groups: built?.groups ?? [],
        colours: functionColours(functions, s.functionId),
      }
    })
  // From the MODEL, not from the program: a section that has built nothing yet
  // is not in the program, and it is exactly then that the empty note needs to
  // say which section is empty.
  const shownSection = run.sectionId ? model.find((s) => s.id === run.sectionId) : null


  return (
    <div style={{ minWidth: 0 }}>
      <style>{COUNT_FLASH_STYLE}</style>

      {allSections.length === 0 && (
        <PanelNote>
          {shownSection
            ? `Answer yes to a group in ${shownSection.name} and count something, and it appears here.`
            : 'Answer yes to a group and count something, and it appears here.'}{' '}
          Nothing on this tab is saved.
        </PanelNote>
      )}
      {
        // EVERY LEVEL SLIDES — a row an answer adds opens, one it takes away
        // shuts, as the option canvas's cards move. See Presence; the tree's
        // lines follow because the layer re-measures as the column resizes.
        //
        // MOUNTED EVEN WHEN EMPTY: a Presence treats what it mounts with as
        // already there, so a tree created by the first answer never slid or
        // flashed. KEYED BY THE SECTION: moving to another card is not the tree
        // changing, and without a fresh mount it read as a whole section going
        // red and another arriving green.
        // NOT KEYED BY THE SECTION any more: every section is always listed, so
        // switching card opens one and shuts another in place, and Presence
        // slides both (Collapse). Every section's groups stay mounted, so a switch
        // changes no list and nothing flashes red or green.
        <TreeLayer>
          <Presence items={allSections} keyOf={(s) => s.id}>
          {(section) => (
            // A SECTION IS A CARD: its title a header strip, what it has built
            // the body. The strip's rule shows only when open — shut, the card is
            // the header alone and a rule would double its border.
            <div
              style={{
                position: 'relative',
                // THE SECTION'S OWN HUE on the title strip and the outline; the
                // body stays white.
                border: `1px solid ${section.colours.border}`,
                background: '#fff',
                borderRadius: 8,
                marginBottom: 8,
                paddingBottom: section.open ? 6 : 0,
                transition: `padding-bottom ${PRESENCE_MS}ms ease-in-out`,
                overflow: 'hidden',
              }}
            >
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: ROW + 2 * HEAD_PAD,
                // The rail's wash: deeper for the section you are on, as there.
                background: section.colours.wash(section.open ? 0.66 : 0.88),
                borderBottom: `1px solid ${section.colours.border}`,
                transition: `background-color ${PRESENCE_MS}ms ease-in-out, border-color ${PRESENCE_MS}ms ease-in-out`,
              }}
            />
            <Branch
              endpoint="caret"
              expanded={section.open}
              // THE CARET MOVES THE CAROUSEL to this section's card; the tree
              // then opens it, since the tree always opens the card you are on.
              onToggle={() => run.requestSection(section.id)}
              title={`Go to ${section.name}`}
              head={HEAD_PAD + ROW / 2}
              padTop={HEAD_PAD}
            >
              <div style={{ paddingBottom: HEAD_PAD }}>
                <Row label={section.name} weight={700} caps
                  colour={section.colours.inverted.color}
                />
              </div>

              <Collapse open={section.open}>
              <Presence flash items={section.groups} keyOf={(g) => g.id}>
              {(group) => (
                <Branch endpoint="caret" expanded head={ROW / 2}>
                  <Row label={group.name} weight={700} beside={areaOf(group.id)} />

                  <Presence flash items={group.departments} keyOf={(d) => d.id}>
                  {(department) => (
                    <Branch endpoint="caret" expanded head={ROW / 2}>
                      <Row label={department.name} weight={700} beside={areaOf(department.id)} />

                      {/* Keyed by placement: the once-per-department rule means
                          no room id repeats inside one department. */}
                      <Presence flash items={department.rooms} keyOf={(r) => r.instance_id}>
                      {(room) => (
                        <Branch
                          endpoint={sized(room).length > 0 ? 'caret' : 'dot'}
                          expanded={sized(room).length > 0}
                          head={ROW / 2}
                        >
                          <Row
                            label={roomLabel(room, department)}
                            size={ROOM_TEXT}
                            colour="#444"
                            beside={<Count n={room.count} />}
                            track={room.count}
                          />
                          {/* WHAT STANDS IN IT, for the objects a rule sized.
                              This is the one column that lists them: the
                              carousel answers by what a thing IS, and side is
                              where what that buys appears. */}
                          <Presence flash items={sized(room)} keyOf={(o) => o.instance_id}>
                          {(object) => (
                            <Branch endpoint="dot" head={ROW / 2}>
                              <Row label={object.name} size={OBJECT_TEXT} colour="#777" beside={<Count n={object.count} />} track={object.count} />
                            </Branch>
                          )}
                          </Presence>
                        </Branch>
                      )}
                      </Presence>
                    </Branch>
                  )}
                  </Presence>
                </Branch>
              )}
              </Presence>
              </Collapse>
            </Branch>
            </div>
          )}
          </Presence>
        </TreeLayer>
      }
    </div>
  )
}
