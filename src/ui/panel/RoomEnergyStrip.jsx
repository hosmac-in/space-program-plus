// ROOM PARAMETERS — everything a room says about itself, in one collapsed band.
//
// ONE definition, rendered by both side panels. Each caller keeps only its own
// data mapping and its own writes.
//
// WHY ONE BAND, SPLIT DOWN THE MIDDLE
//
// This was three bands, then one band of sections stacked down the page, and
// both wasted the panel: a dozen short label/value pairs one per line made every
// room taller than its own object list while leaving the right half empty. So
// the box is divided VERTICALLY and each half is read DOWN — which is why it is
// not one grid flowing left to right, where "Illuminance" would sit beside
// "Cooling setpoint" and mean nothing.
//
// The columns are UNLABELLED. They were "Loads" and "HVAC", after the two jsonb
// maps behind them, but every row is simply a property of the room and the band
// says so once at the top. The groups still decide which key a value is stored
// under (data/roomEnergy.js) — they no longer name anything on screen.
//
// Adding a field lengthens one column and changes nothing else.
//
// THE OCCUPANCY SCHEDULE IS DRAWN HERE, STORED ELSEWHERE
//
// It sits beside the people count, which is the number it modulates — "five
// people, on this pattern" is one statement. It is still STORED in the room's
// `schedules` map, because it is a pointer to an sp_schedule row and
// data/schedules.js owns that; only where it is drawn has moved. Each row
// carries the `group` it writes to, so one handler routes all three.
//
// EVERY ROW IS THE SAME SHAPE — label, value, reset — which is why the schedule
// is mapped into a field row rather than drawn by a picker of its own. A
// schedule IS a choice between named things, exactly as pressure is.

import { LOADS_GROUP, HVAC_GROUP, CONDITIONED_KEY } from '../../data/roomEnergy.js'
import { schedulesForRole } from '../../data/schedules.js'
import EnergyFieldRows from './EnergyFieldRows.jsx'
import StripBand from './StripBand.jsx'

// Which jsonb map a schedule row writes to. Named like a field group so the
// caller's one handler can route by it.
export const SCHEDULES_GROUP = 'schedules'

// "Not on a schedule", as an option — so a schedule row behaves like every other
// choice: it always has a value, and clearing is picking rather than a separate
// ×. It is not an id and never reaches storage; see below.
const NO_SCHEDULE = '(none)'

// A resolved schedule row -> the field row EnergyFieldRows draws.
function scheduleFieldRow(row, schedules) {
  const options = [
    { id: NO_SCHEDULE, name: 'None' },
    ...schedulesForRole(schedules, row.key).map((s) => ({ id: s.id, name: s.name })),
  ]
  return {
    ...row,
    type: 'choice',
    group: SCHEDULES_GROUP,
    options,
    fallback: NO_SCHEDULE,
    // An id whose schedule has gone still has to resolve to something the
    // <select> can show, or the control falls back to its first option and
    // silently reports a value nobody chose.
    value: row.scheduleId && options.some((o) => o.id === row.scheduleId) ? row.scheduleId : NO_SCHEDULE,
    inherited: row.inheritedId ?? null,
    describe: (room) => `Which ${row.label.toLowerCase()} schedule ${room} runs on`,
  }
}

// Which map a row writes to, stamped on the row AND on each half of a pair. The
// handlers route by `field.group` and a pair hands them a HALF, not the row, so
// a group left off the halves writes a setpoint into nothing at all.
function tag(row, group) {
  return {
    ...row,
    group,
    ...(row.parts ? { parts: row.parts.map((p) => ({ ...p, group })) } : null),
  }
}

// One column of the split.
//
// NO CAPTION. "Loads" and "HVAC" were headings over columns that are simply the
// left and right halves of one list — every row is a property of the room, the
// band above already says Room Parameters, and a column beginning with a
// schedule was never really "Loads" anyway. The two groups survive in storage
// and in the routing, and nowhere else.
//
// The divider between columns is NOT here. It is `.spp-energy-grid > * + *` in
// index.css, because a rule between two columns becomes a rule ABOVE the second
// one when they stack, and an inline style cannot know which way the container
// query went.
function Column({ children }) {
  return <div style={{ minWidth: 0 }}>{children}</div>
}

export default function RoomEnergyStrip({
  // Resolved schedule rows, from resolveRoomSchedules / catalogRoomSchedules.
  scheduleRows,
  // Resolved field rows per group, keyed by group: { loads: [...], hvac: [...] }.
  fieldRows,
  // Every schedule there is, from useCatalog().
  schedules,
  // The ROOM's function colours, from functionColours().
  colours,
  roomName = 'this room',
  canEdit = true,
  // Takes the resolved ROW, its GROUP and the value, so a caller can name the
  // field in an undo message and write to the right map without looking either
  // up. A schedule arrives here too, with SCHEDULES_GROUP and an id — or null,
  // which is what picking "None" sends.
  onFieldChange,
  onFieldCommit,
  onFieldReset,
}) {
  const conditioned = (fieldRows[HVAC_GROUP] ?? []).find((r) => r.key === CONDITIONED_KEY)?.value === true

  const sections = [
    {
      group: LOADS_GROUP,
      rows: [
        ...scheduleRows.map((r) => scheduleFieldRow(r, schedules)),
        ...(fieldRows[LOADS_GROUP] ?? []).map((r) => tag(r, LOADS_GROUP)),
      ],
    },
    {
      group: HVAC_GROUP,
      // `conditioned` GOVERNS the rest of its column: with it off there are no
      // setpoints, no delivered air and no pressure regime, so those rows are
      // greyed and locked rather than removed — see EnergyFieldRows. It is
      // first in the list (data/roomEnergy.js), so the switch is above
      // everything it turns off.
      //
      // The resolved value is what counts, not just an override: a room
      // inheriting `conditioned: false` from the catalog is as unconditioned as
      // one told so here.
      rows: (fieldRows[HVAC_GROUP] ?? []).map((r) => ({
        ...tag(r, HVAC_GROUP),
        disabled: r.key !== CONDITIONED_KEY && !conditioned,
      })),
    },
  ]

  // Nothing stated and nothing settable: the band would be a permanent empty
  // heading above every room, announcing nothing a reader can act on.
  const anyStated = sections
    .flatMap((s) => s.rows)
    .some((r) => r.source != null && r.value !== NO_SCHEDULE)
  if (!canEdit && !anyStated) return null

  // Routed by the row's OWN group, not the section's, because the occupancy
  // schedule is drawn under Loads but stored in `schedules`. "None" is this
  // UI's way of saying "clear it", not an id, so it never reaches storage.
  const send = (fn) =>
    fn && ((field, value) => fn(field, field.group, value === NO_SCHEDULE ? null : value))

  return (
    <StripBand title="Room Parameters" colours={colours}>
      {/* Two columns that stack when the panel is too narrow to hold both — see
          .spp-energy-grid in index.css, which owns the widths, the gap and the
          divider because all three change when it wraps. */}
      <div className="spp-energy" style={{ marginTop: 4 }}>
        <div className="spp-energy-grid">
          {sections.map((section) => (
            <Column key={section.group}>
              <EnergyFieldRows
                rows={section.rows}
                roomName={roomName}
                colours={colours}
                canEdit={canEdit}
                onChange={send(onFieldChange)}
                onCommit={send(onFieldCommit)}
                onReset={onFieldReset && ((field) => onFieldReset(field, field.group))}
              />
            </Column>
          ))}
        </div>
      </div>
    </StripBand>
  )
}
