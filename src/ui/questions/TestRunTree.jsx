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
import { optionSettingsOf } from './createOption.js'
import { RULE } from '../layout.js'

const ROW = 24

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
function Row({ label, size = 13, weight = 400, caps = false, colour = '#222', right, beside, track }) {
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
      <span title="No rule on the room — only what stands in it is counted" style={{ flexShrink: 0, fontSize: 12, color: '#ccc' }}>
        —
      </span>
    )
  }
  return (
    <span style={{ flexShrink: 0, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#555' }}>×{n}</span>
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
// site's area in the creator, an ASSUMED 3 acres on the Test run tab (labelled
// so, since it measures nothing). FSI area is plot × the FSI answered on the General card, and the
// run's area is tallied against it the way beds are against theirs: "a / b",
// red when over.
export function TestRunHud({ buildingId, projectName = null, siteGeojson = null }) {
  const { buildings, sections, groups, departments, rooms, objects } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  const run = useTestRun()
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()

  const model = scopeToDmgs(
    buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects }),
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
  // No site to measure means the figure is App's stand-in, not a measurement.
  const assumed = plot && !siteGeojson
  const fsi = optionSettingsOf(run).fsi
  const fsiSqft = plot && fsi > 0 ? plot.sqft * fsi : null
  const overFsi = fsiSqft !== null && areaSqft > fsiSqft

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        borderTop: RULE,
        background: '#fff',
        padding: '8px 16px',
        overflowY: 'auto',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, color: '#8a8a8a', marginBottom: 6 }}>
        {projectName ?? 'Nothing on this tab is saved'}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', minWidth: 0 }}>
        <Figure
          label="Beds"
          // Against the target when there is one: the figure alone answers half
          // the question, and the half it leaves out is the one that was asked.
          value={target === null ? placed : `${placed} / ${target}`}
          muted={placed === 0}
          tone={over ? '#b3261e' : null}
        />
        <Figure
          label={fsiSqft === null ? 'Area' : 'Area / FSI area'}
          value={
            fsiSqft === null
              ? formatArea(toDisplay(areaSqft))
              : `${formatArea(toDisplay(areaSqft))} / ${formatArea(toDisplay(fsiSqft))}`
          }
          unit={AREA_UNIT}
          muted={areaSqft === 0}
          tone={overFsi ? '#b3261e' : null}
        />
        <Figure
          label={assumed ? 'Plot (assumed)' : 'Plot'}
          value={plot ? formatArea(toDisplay(plot.sqft)) : '—'}
          unit={plot ? AREA_UNIT : undefined}
          muted={!plot}
        />
      </div>
    </div>
  )
}

// The HUD's own figure. Not Hud.jsx's: that one is bound to an option's totals
// and this tab has no option, and two components sharing a slot is not the same
// thing as sharing a definition.
function Figure({ label, value, unit, muted = false, tone = null }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: '#8a8a8a',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: tone ?? (muted ? '#bbb' : '#222'), whiteSpace: 'nowrap' }}>
        {value}
        {unit && <span style={{ fontSize: 10, fontWeight: 400, color: '#8a8a8a', marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  )
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
  const { buildings, sections, groups, departments, rooms, objects, functions } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  const run = useTestRun()

  const model = scopeToDmgs(
    buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects }),
    run.dmgIds
  )
  const whole = buildProgram(model, run)
  // Grossed totals for the group and department rows — see grossedAreas.
  const { byId: areas } = grossedAreas(whole, buildings.find((b) => b.id === buildingId), model)
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()
  const areaOf = (id) => (
    <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#555' }}>
      – {formatArea(toDisplay(areas.get(id) ?? 0))}
      <span style={{ fontSize: 10, color: '#8a8a8a', marginLeft: 3 }}>{AREA_UNIT}</span>
    </span>
  )

  // ONLY THE SECTION THE CARD IS ON. The tree beside the carousel reports on
  // what is being asked, and the whole building's worth of it pushed the section
  // you were answering off the bottom of the column exactly when it started
  // filling up. The HUD above keeps the whole-building totals, which is where a
  // figure that spans sections belongs.
  //
  // It falls back to the WHOLE program while no card is reported — the frame
  // before the carousel has said, and the Companion-less case where nothing
  // sets it — rather than drawing nothing, which would read as "you have built
  // nothing" instead of "nobody has said which section".
  const program = run.sectionId ? whole.filter((s) => s.id === run.sectionId) : whole

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

  const buildingName = buildings.find((b) => b.id === buildingId)?.name ?? 'This building'
  const totalRooms = program
    .flatMap((s) => s.groups)
    .flatMap((g) => g.departments)
    .flatMap((d) => d.rooms)
    .reduce((sum, r) => sum + (r.count ?? 0), 0)

  return (
    <div style={{ minWidth: 0 }}>
      <style>{COUNT_FLASH_STYLE}</style>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888' }}>
        What this builds
      </div>
      <div style={{ fontSize: 22, marginTop: 2 }}>{buildingName}</div>
      {/* The count is one SECTION's now. The section is not named here: its own
          row is the first thing in the tree below, and naming it twice two lines
          apart is what the department heading already refuses to do. When there
          is no tree to name it, the note below says which card you are on. */}
      <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
        {totalRooms === 0 ? 'Nothing yet' : `${totalRooms} room${totalRooms === 1 ? '' : 's'} so far`}
      </div>

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
            <Branch endpoint="caret" expanded={section.open} head={HEAD_PAD + ROW / 2} padTop={HEAD_PAD}>
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
                            size={12}
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
                              <Row label={object.name} size={11} colour="#777" beside={<Count n={object.count} />} track={object.count} />
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
