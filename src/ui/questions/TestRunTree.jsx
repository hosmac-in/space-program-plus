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
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'
import { buildModel, roomLabel } from './questionModel.js'
import { bedTally, buildProgram, useTestRun } from './useTestRun.jsx'
import { useAreaUnit } from '../AreaUnitContext.jsx'
import { formatArea } from '../map/area.js'
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
export function TestRunHud({ buildingId }) {
  const { sections, groups, departments, rooms, objects } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  const run = useTestRun()
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()

  const model = buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects })
  const { target, placed, areaSqft } = bedTally(model, run)
  const over = target !== null && placed > target

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
      <div style={{ fontSize: 11, color: '#8a8a8a', marginBottom: 6 }}>Nothing on this tab is saved</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', minWidth: 0 }}>
        <Figure
          label="Beds"
          // Against the target when there is one: the figure alone answers half
          // the question, and the half it leaves out is the one that was asked.
          value={target === null ? placed : `${placed} / ${target}`}
          muted={placed === 0}
          tone={over ? '#b3261e' : null}
        />
        <Figure label="Area" value={formatArea(toDisplay(areaSqft))} unit={AREA_UNIT} muted={areaSqft === 0} />
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

  const model = buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects })
  const program = buildProgram(model, run)

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
      <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
        {totalRooms === 0 ? 'Nothing yet' : `${totalRooms} room${totalRooms === 1 ? '' : 's'} so far`}
      </div>

      {program.length === 0 ? (
        <PanelNote>
          Answer yes to a group and count something, and it appears here. Nothing on this tab is saved.
        </PanelNote>
      ) : (
        <TreeLayer>
          {program.map((section) => (
            <Branch key={section.id} endpoint="caret" expanded head={ROW / 2}>
              <Row label={section.name} weight={700} caps />

              {section.groups.map((group) => (
                <Branch key={group.id} endpoint="caret" expanded head={ROW / 2}>
                  <Row label={group.name} weight={600} />

                  {group.departments.map((department) => (
                    <Branch key={department.id} endpoint="caret" expanded head={ROW / 2}>
                      <Row label={department.name} weight={500} />

                      {department.rooms.map((room, i) => (
                        // A room placed by two sets would repeat its id, which
                        // the once-per-department rule prevents — but the index
                        // rides along so a future relaxation of that rule cannot
                        // collide two keys silently.
                        <Branch
                          key={`${room.instance_id}:${i}`}
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
                          {sized(room).map((object) => (
                            <Branch key={object.instance_id} endpoint="dot" head={ROW / 2}>
                              <Row label={object.name} size={11} colour="#777" right={<Count n={object.count} />} />
                            </Branch>
                          ))}
                        </Branch>
                      ))}
                    </Branch>
                  ))}
                </Branch>
              ))}
            </Branch>
          ))}
        </TreeLayer>
      )}
    </div>
  )
}
