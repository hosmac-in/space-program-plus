// Everything a room says about energy, in ONE collapsed row: what it holds and
// draws, and how it is served.
//
// ONE definition, rendered by both side panels. Each caller keeps only its own
// data mapping and its own writes.
//
// WHY ONE BAND, SPLIT DOWN THE MIDDLE
//
// This was three bands, then one band of sections stacked down the page, and
// both wasted the panel. A room's energy is a dozen short label/value pairs;
// one per line they made every room taller than its own object list while
// leaving the right half of the panel empty.
//
// So the box is divided VERTICALLY: Loads in the left column, HVAC in the
// right, each a plain stack of rows under its own heading, with a rule between
// them. Two subjects side by side, read down rather than across — which is also
// why they are not one grid of rows flowing left to right, where "Illuminance"
// would sit beside "Setpoint" and mean nothing.
//
// Adding a field lengthens one column and changes nothing else.
//
// THE OCCUPANCY SCHEDULE IS A LOAD, IN THE UI
//
// It sits in Loads beside the people count, which is the number it modulates —
// "five people, on this pattern" is one statement, and it was a section of its
// own saying very little. It is still STORED in the room's `schedules` map,
// because it is a pointer to an sp_schedule row and data/schedules.js owns that;
// only where it is drawn has moved. Each row carries the `group` it writes to,
// so one handler routes both.
//
// EVERY ROW IN EITHER SECTION IS THE SAME SHAPE — label, value, reset — which is
// why the schedule is mapped into a field row rather than drawn by a picker of
// its own. A schedule IS a choice between named things, exactly as pressure is.

import { LOADS_GROUP, HVAC_GROUP } from '../../data/roomEnergy.js'
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

// One column of the split: a heading, then its rows stacked under it.
//
// The divider between columns is NOT here. It is `.spp-energy-grid > * + *` in
// index.css, because a rule between two columns becomes a rule ABOVE the second
// one when they stack, and an inline style cannot know which way the container
// query went.
function Column({ caption, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          marginBottom: 3,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          opacity: 0.75,
        }}
      >
        {caption}
      </div>
      {children}
    </div>
  )
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
  const sections = [
    {
      caption: 'Loads',
      group: LOADS_GROUP,
      rows: [
        ...scheduleRows.map((r) => scheduleFieldRow(r, schedules)),
        ...(fieldRows[LOADS_GROUP] ?? []).map((r) => ({ ...r, group: LOADS_GROUP })),
      ],
    },
    {
      caption: 'HVAC',
      group: HVAC_GROUP,
      rows: (fieldRows[HVAC_GROUP] ?? []).map((r) => ({ ...r, group: HVAC_GROUP })),
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
    <StripBand title="Energy" colours={colours}>
      {/* Two columns that stack when the panel is too narrow to hold both — see
          .spp-energy-grid in index.css, which owns the widths, the gap and the
          divider because all three change when it wraps. */}
      <div className="spp-energy" style={{ marginTop: 4 }}>
        <div className="spp-energy-grid">
          {sections.map((section) => (
            <Column key={section.group} caption={section.caption}>
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
