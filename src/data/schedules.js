// ROOM SCHEDULES — what a room runs on, and where that answer came from
// =====================================================================
//
// A room says when it is occupied, when its lights are on, when its equipment
// runs and when its HVAC is available. Each of those is a ROLE pointing at one
// sp_schedule row; the hourly profile itself lives on the EnergyPlus /
// Grasshopper side and this app stores only which schedule applies.
//
// The DEFAULT lives on the catalog placement in sp_section.tree, not on sp_room
// — a Toilet under an ICU runs on a different schedule than one under an OPD
// and those are the same sp_room row (see tree.js).
//
// An option stores OVERRIDES ONLY, in the same-shaped map. A role absent from
// it inherits; clearing an override deletes the key rather than writing a null,
// so resolution stays `option ?? catalog ?? null` with no third state.
//
//   >>> KNOWN LIMIT, deliberate: an option cannot say "explicitly NO occupancy
//   >>> schedule" against a template that has one. Supporting it means making
//   >>> key PRESENCE significant (Object.hasOwn) and every reader agreeing.
//
// Pure functions over the two maps and the sp_schedule rows the catalog holds —
// nothing here reads the database.

// The ONLY list of roles. Adding a fifth is one line here: nothing enumerates
// them elsewhere and neither jsonb shape changes, since both are maps keyed by
// these strings.
//
// `key` is stored in jsonb and matched against a schedule's category, so
// renaming one is a data migration. `short` is for the collapsed summary, where
// four role names and four schedule names share a line.
// Occupancy alone, for now. Lighting, equipment and HVAC-availability roles were
// here and were removed: four schedule rows on every room said very little that
// occupancy did not, and the room's LOADS are where the interesting differences
// turned out to be. Adding one back is a line here and nothing else — no
// component enumerates roles and neither jsonb shape changes.
//
// A role removed from this list leaves any id already stored under its key in
// place, unread. Re-add the role and those assignments reappear; they are not
// deleted by being unlisted.
export const SCHEDULE_ROLES = [{ key: 'occupancy', label: 'Occupancy', short: 'Occ' }]

// UNTIL THERE IS A TABLE
//
// `sp_schedule` does not exist yet. These stand in for its rows and are served
// through useCatalog() exactly as the table's will be, so the swap is one line
// in data/catalog.jsx.
//
//   >>> The ids are SLUGS, not uuids, deliberately: legible while debugging,
//   >>> unmistakably placeholders, and a uuid would trip the secret-scan grep
//   >>> this repo runs before every commit (the repo is public).
//
// WHEN sp_schedule IS CREATED its rows get real uuids, so every slug already
// written into a tree or an option becomes a dangling id. Either seed the table
// with these exact slugs as its primary keys, or plan a one-off rewrite of the
// two jsonb columns.
export const PLACEHOLDER_SCHEDULES = [
  { id: 'sched-always-on', name: 'Always On', category: null },
  { id: 'sched-always-off', name: 'Always Off', category: null },

  { id: 'sched-occ-hospital-24-7', name: 'Hospital Occupancy 24/7', category: 'occupancy' },
  { id: 'sched-occ-opd-daytime', name: 'OPD Occupancy Daytime', category: 'occupancy' },
  { id: 'sched-occ-office-weekday', name: 'Office Occupancy Weekday', category: 'occupancy' },

  { id: 'sched-lgt-hospital-24-7', name: 'Hospital Lighting 24/7', category: 'lighting' },
  { id: 'sched-lgt-opd-daytime', name: 'OPD Lighting Daytime', category: 'lighting' },
  { id: 'sched-lgt-corridor-24-7', name: 'Corridor Lighting 24/7', category: 'lighting' },

  { id: 'sched-eqp-clinical-24-7', name: 'Clinical Equipment 24/7', category: 'equipment' },
  { id: 'sched-eqp-office-weekday', name: 'Office Equipment Weekday', category: 'equipment' },

  { id: 'sched-hvac-24-7', name: 'HVAC Available 24/7', category: 'hvac' },
  { id: 'sched-hvac-daytime', name: 'HVAC Available Daytime', category: 'hvac' },
]

// Drawn where a schedule is assigned but the list no longer has the row — the
// dangling-id case jsonb cannot be protected from. Missing rather than blank,
// the same courtesy functions.js does for an unresolvable function_id.
export const MISSING_SCHEDULE_NAME = '(missing)'

// Every role for one room AS AN OPTION SEES IT, each with `source` — 'option',
// 'inherited', or null. That is the whole reason this returns objects rather
// than ids: the Project tab draws an inherited value differently and offers a
// revert only for an overridden one, and the two are the same id.
//
// `inheritedId` rides along even on an overridden row, so the UI can say what
// reverting would restore.
//
// `treeRoomNode` (from catalogRoomNode in tree.js) may be null: an option room
// whose placement has left the catalog inherits nothing, which is not an error.
export function resolveRoomSchedules(treeRoomNode, optionSchedules) {
  const inherited = treeRoomNode?.schedules ?? {}
  const overrides = optionSchedules ?? {}

  return SCHEDULE_ROLES.map((role) => {
    const inheritedId = inherited[role.key] ?? null
    const override = overrides[role.key]

    if (override) return { ...role, scheduleId: override, source: 'option', inheritedId }
    if (inheritedId) return { ...role, scheduleId: inheritedId, source: 'inherited', inheritedId }
    return { ...role, scheduleId: null, source: null, inheritedId }
  })
}

// The same rows AS THE CATALOG SEES THEM, with no option in the picture. The
// source is 'here', not 'inherited', because this is the thing inherited FROM:
// on the Tree tab a schedule is simply set or unset, with no lower level to
// fall back to.
export function catalogRoomSchedules(treeRoomNode) {
  const assigned = treeRoomNode?.schedules ?? {}
  return SCHEDULE_ROLES.map((role) => {
    const scheduleId = assigned[role.key] ?? null
    return { ...role, scheduleId, source: scheduleId ? 'here' : null, inheritedId: null }
  })
}

// Null id means nothing is assigned, which the caller draws as its own kind of
// empty — only an id resolving to no row is "(missing)".
export function scheduleName(schedules, id) {
  if (!id) return null
  return schedules?.find((s) => s.id === id)?.name ?? MISSING_SCHEDULE_NAME
}

// A row with no category is offered for EVERY role: "Always On" is legitimately
// an occupancy, a lighting and an HVAC schedule, and hiding it would be the
// is_duplicable mistake in miniature — filtering a picker down to nothing is how
// a list becomes a dead end.
export function schedulesForRole(schedules, roleKey) {
  return (schedules ?? []).filter((s) => !s.category || s.category === roleKey)
}

// Set or clear one role on a room node — a catalog one or an option one, which
// take the whole node so both get the same two rules:
//
//   * clearing DELETES the key rather than writing a null, since absence is the
//     only "not set" this shape has;
//   * a node with nothing left carries no `schedules` key at all. That keeps an
//     untouched room byte-identical to before this feature existed, and keeps
//     the panel's dirty check honest — it compares JSON, and `{}` is not the
//     same string as nothing.
export function roomWithSchedule(room, roleKey, scheduleId) {
  const next = { ...(room.schedules ?? {}) }
  if (scheduleId) next[roleKey] = scheduleId
  else delete next[roleKey]

  const updated = { ...room, schedules: next }
  if (Object.keys(next).length === 0) delete updated.schedules
  return updated
}
