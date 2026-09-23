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

import { useCatalog } from '../../data/catalog.jsx'
import { Branch, TreeLayer } from '../panel/PanelTree.jsx'
import { PanelNote } from '../panel/panelParts.jsx'
import Presence from '../primitives/Presence.jsx'
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'
import { buildModel, roomLabel, scopeToDmgs } from './questionModel.js'
import { bedTally, buildProgram, useTestRun } from './useTestRun.jsx'
import { useAreaUnit } from '../AreaUnitContext.jsx'
import { formatArea, siteAreas } from '../map/area.js'
import { optionSettingsOf } from './createOption.js'
import { RULE } from '../layout.js'

const ROW = 24

function Row({ label, size = 13, weight = 400, caps = false, colour = '#222', right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: ROW, minWidth: 0 }}>
      <span
        title={label}
        style={{
          flex: 1,
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
// THE PLOT AND WHAT FSI ALLOWS ON IT. Plot is the project site's own area — so
// only the option creator has one; the Test run tab belongs to no project and
// shows a dash. FSI area is plot × the FSI answered on the General card, and the
// run's area is tallied against it the way beds are against theirs: "a / b",
// red when over.
export function TestRunHud({ buildingId, projectName = null, siteGeojson = null }) {
  const { sections, groups, departments, rooms, objects } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  const run = useTestRun()
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()

  const model = scopeToDmgs(
    buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects }),
    run.dmgIds
  )
  const { target, placed, areaSqft } = bedTally(model, run)
  const over = target !== null && placed > target

  const plot = siteAreas(siteGeojson)
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
          label="Plot"
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

export default function TestRunTree({ buildingId }) {
  const { buildings, sections, groups, departments, rooms, objects } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  const run = useTestRun()

  const model = scopeToDmgs(
    buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects }),
    run.dmgIds
  )
  const whole = buildProgram(model, run)

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

      {program.length === 0 ? (
        <PanelNote>
          {shownSection
            ? `Answer yes to a group in ${shownSection.name} and count something, and it appears here.`
            : 'Answer yes to a group and count something, and it appears here.'}{' '}
          Nothing on this tab is saved.
        </PanelNote>
      ) : (
        // EVERY LEVEL SLIDES — a row an answer adds opens, one it takes away
        // shuts, as the option canvas's cards move. See Presence; the tree's
        // lines follow because the layer re-measures as the column resizes.
        <TreeLayer>
          <Presence items={program} keyOf={(s) => s.id}>
          {(section) => (
            <Branch endpoint="caret" expanded head={ROW / 2}>
              <Row label={section.name} weight={700} caps />

              <Presence items={section.groups} keyOf={(g) => g.id}>
              {(group) => (
                <Branch endpoint="caret" expanded head={ROW / 2}>
                  <Row label={group.name} weight={600} />

                  <Presence items={group.departments} keyOf={(d) => d.id}>
                  {(department) => (
                    <Branch endpoint="caret" expanded head={ROW / 2}>
                      <Row label={department.name} weight={500} />

                      {/* Keyed by placement: the once-per-department rule means
                          no room id repeats inside one department. */}
                      <Presence items={department.rooms} keyOf={(r) => r.instance_id}>
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
                            right={<Count n={room.count} />}
                          />
                          {/* WHAT STANDS IN IT, for the objects a rule sized.
                              This is the one column that lists them: the
                              carousel answers by what a thing IS, and side is
                              where what that buys appears. */}
                          <Presence items={sized(room)} keyOf={(o) => o.instance_id}>
                          {(object) => (
                            <Branch endpoint="dot" head={ROW / 2}>
                              <Row label={object.name} size={11} colour="#777" right={<Count n={object.count} />} />
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
            </Branch>
          )}
          </Presence>
        </TreeLayer>
      )}
    </div>
  )
}
