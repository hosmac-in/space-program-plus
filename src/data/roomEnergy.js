// A ROOM'S ENERGY MODEL — loads and HVAC, and where each answer came from
// =======================================================================
//
// The numeric half of what a room is, beside the schedules that say WHEN it
// runs (data/schedules.js). Two groups:
//
//   loads   what the room holds and draws — people, activity, lighting,
//           equipment, illuminance, hot water, infiltration
//   hvac    how it is served — setpoints, air changes, pressure, and whether it
//           is conditioned at all
//
// The SPLIT IS STORAGE ONLY. The panel draws one list called Room Parameters:
// the two headings were removed once every field beneath them read as a property
// of the room rather than as a member of a category, and "Loads" over a column
// that begins with a schedule was never quite true. Two maps remain because they
// are two jsonb keys with two subjects — a room can be fully specified for its
// loads and say nothing about its air — and merging them would be a migration
// for a caption.
//
// Both are stored and resolved exactly as schedules are: the catalog placement
// in sp_section.tree states the DEFAULT, and an option stores OVERRIDES ONLY.
//
//   catalog   { instance_id, room_def_id, loads: { people: 4 }, hvac: { ... } }
//   option    { instance_id, room_def_id, loads: { people: 6 } }
//
// A field absent from an option's map inherits; clearing an override deletes the
// key. So resolution is the plain chain the rest of the app uses, with no third
// state:
//
//     option[group]?.[key] ?? treeRoom[group]?.[key] ?? null
//
// Adding a field to either group is one line below; neither jsonb shape
// changes, and which group it goes in decides only which key it is stored
// under.
//
//   >>> WHAT COUNTS AS "SET" DEPENDS ON THE TYPE, and getting this wrong loses
//   >>> data silently:
//   >>>
//   >>>   number   finite and >= 0. ZERO IS A VALUE — nought people in a store,
//   >>>            no daylight in a plant room. (Contrast a department factor,
//   >>>            where 0 would collapse the department and only > 0 means
//   >>>            anything; see data/factors.js.)
//   >>>   choice   one of the ids the field offers, and nothing else.
//   >>>   boolean  strictly true OR FALSE. `false` is an answer — "this room is
//   >>>            not conditioned" — so a truthiness test would throw it away
//   >>>            and read it back as inherited.
//   >>>
//   >>> Absence, and only absence, means "nobody has said".
//
// EVERY FIELD HAS A FALLBACK, SO EVERY ROW ALWAYS SHOWS A VALUE
//
// Nothing stated at either level resolves to the field's `fallback` — 0, or
// unpressured, or not conditioned. There is no empty row and no "set this
// first" button: a room that says nothing about its air is a room at 0 ACH,
// unpressured and unconditioned, which is a defensible reading and the one an
// export would have to make anyway.
//
// `source` still distinguishes the three cases, and that is what the panel
// draws: 'option' overridden here, 'inherited' from the catalog, null nobody has
// said and you are looking at the fallback. Only a stated value is ever written.
//
// Nothing consumes any of this yet. It is authored, inherited and overridden;
// the export to EnergyPlus is what will read it.

// `key` is stored in jsonb, so renaming one is a data migration. `short` is for
// the collapsed summary line, where everything set has to fit together.
//
// `unit` is part of the figure and drawn with it — a power density with no unit
// beside it is a number nobody can check. Watts per SQUARE FOOT because every
// area in this app is sqft; °C, lux and ACH because those have no form anyone
// uses otherwise.
export const ROOM_LOADS = [
  {
    key: 'people',
    label: 'People',
    short: 'People',
    type: 'number',
    unit: '',
    fallback: 0,
    // A person is a whole person. The rest are measurements and are not.
    decimals: 0,
    step: 1,
    describe: (room) => `How many people ${room} holds`,
  },
  {
    key: 'activity_level_w_per_person',
    label: 'Activity level',
    short: 'Met',
    type: 'number',
    // EnergyPlus's People Activity Level: the metabolic heat one occupant gives
    // off. Per PERSON, and directly under the people count for the same reason
    // hot water is — the two multiply, and reading them apart invites entering
    // one as a room total.
    unit: 'W/person',
    fallback: 0,
    decimals: 0,
    step: 10,
    describe: (room) => `Metabolic heat per occupant of ${room}, in watts`,
  },
  {
    key: 'lighting_w_per_sqft',
    label: 'Lighting',
    short: 'LPD',
    type: 'number',
    unit: 'W/sqft',
    fallback: 0,
    decimals: 2,
    step: 0.05,
    describe: (room) => `Lighting power density in ${room}, in watts per square foot`,
  },
  {
    key: 'equipment_w_per_sqft',
    label: 'Equipment',
    short: 'EPD',
    type: 'number',
    // Beside lighting and in the same unit: the two are the room's plug and
    // fixture loads and are almost always entered together. A ward's is a bed
    // and a monitor; an imaging room's is the scanner.
    unit: 'W/sqft',
    fallback: 0,
    decimals: 2,
    step: 0.05,
    describe: (room) => `Electric equipment power density in ${room}, in watts per square foot`,
  },
  {
    key: 'illuminance_lux',
    label: 'Illuminance',
    short: 'Lux',
    type: 'number',
    unit: 'lux',
    fallback: 0,
    decimals: 0,
    step: 10,
    describe: (room) => `The illuminance ${room} is designed to, in lux`,
  },
  {
    label: 'Hot water',
    type: 'pair',
    // The two halves do NOT share a unit, so each prints its own and both are
    // shortened to fit — see PAIR_WIDTH in ui/panel/panelLayout.js.
    parts: [
      {
        key: 'hot_water_l_per_person_day',
        // Per PERSON rather than per area: the people count is stated a few rows
        // above and the two compose — demand follows occupants, not floor.
        unit: 'L/p/d',
        fallback: 0,
        decimals: 0,
        step: 5,
        describe: (room) => `Hot water ${room} uses, in litres per person per day`,
      },
      {
        key: 'hot_water_temp_c',
        unit: '°C',
        fallback: 0,
        decimals: 0,
        step: 5,
        describe: (room) => `The temperature ${room}'s hot water is delivered at, in °C`,
      },
    ],
  },
  {
    key: 'infiltration_ach',
    label: 'Infiltration',
    short: 'Infil',
    type: 'number',
    // Air changes per hour, like the ventilation figure under HVAC. They are
    // deliberately two fields: this is the air that leaks in, that is the air
    // that is delivered.
    unit: 'ACH',
    fallback: 0,
    decimals: 2,
    step: 0.05,
    describe: (room) => `Air leaking into ${room}, in air changes per hour`,
  },
]

export const ROOM_HVAC = [
  // FIRST, and the reason is not tidiness: it GOVERNS everything under it. An
  // unconditioned room has no setpoints, no delivered air and no pressure
  // regime, so the panel greys the rest of this list out when this is off (see
  // RoomEnergyStrip). A governing switch below the things it governs would have
  // people typing into rows that were about to go dead.
  //
  // The values themselves are kept, not cleared — turning conditioning back on
  // must restore what was there rather than silently wiping a room's air spec.
  {
    key: 'conditioned',
    label: 'Conditioned',
    short: 'Cond',
    type: 'boolean',
    fallback: false,
    describe: (room) => `Whether ${room} is served by HVAC at all`,
  },
  // >>> `setpoint_c` WAS ONE FIELD and is now these two. Nothing migrates: a
  // >>> room that already carries `setpoint_c` keeps the key, unread, and reads
  // >>> as though neither setpoint were stated. Nothing consumed it, so nothing
  // >>> is wrong — but if a catalog was populated before this, those numbers are
  // >>> still in the jsonb and have to be re-entered against the right one of
  // >>> the two, or rewritten in a one-off pass.
  // A BAND, not a number, and drawn as one row of two fields: heating up to the
  // first and cooling down to the second, with the dead band between them the
  // thing an engineer actually reads. Two rows called "Heating setpoint" and
  // "Cooling setpoint" said the same thing in twice the height and made the
  // gap between them something to work out rather than to see.
  {
    label: 'Setpoint',
    type: 'pair',
    unit: '°C',
    parts: [
      {
        key: 'heating_setpoint_c',
        fallback: 0,
        decimals: 1,
        step: 0.5,
        describe: (room) => `The temperature ${room} is heated up to, in °C`,
      },
      {
        key: 'cooling_setpoint_c',
        fallback: 0,
        decimals: 1,
        step: 0.5,
        describe: (room) => `The temperature ${room} is cooled down to, in °C`,
      },
    ],
  },
  // The same band in relative humidity: humidify up to the first, dehumidify
  // down to the second. 0 means "nobody has said" here as everywhere else — an
  // operating theatre at 55% and a store at nothing are both real answers.
  {
    label: 'Humidity',
    type: 'pair',
    unit: '% RH',
    parts: [
      {
        key: 'humidity_setpoint_rh',
        fallback: 0,
        decimals: 0,
        step: 5,
        describe: (room) => `The relative humidity ${room} is humidified up to`,
      },
      {
        key: 'dehumidity_setpoint_rh',
        fallback: 0,
        decimals: 0,
        step: 5,
        describe: (room) => `The relative humidity ${room} is dehumidified down to`,
      },
    ],
  },
  {
    key: 'air_changes_ach',
    label: 'Air changes',
    short: 'ACH',
    type: 'number',
    unit: 'ACH',
    fallback: 0,
    decimals: 1,
    step: 0.5,
    describe: (room) => `Air delivered to ${room}, in air changes per hour`,
  },
  {
    key: 'pressure',
    label: 'Pressure',
    short: 'Press',
    type: 'choice',
    // Unpressured is the DEFAULT and a real answer, not an absence: most rooms
    // sit at the pressure around them, and saying so is the common case rather
    // than a gap in the data.
    options: [
      { id: 'unpressured', name: 'Unpressured' },
      { id: 'positive', name: 'Positive' },
      { id: 'negative', name: 'Negative' },
    ],
    fallback: 'unpressured',
    describe: (room) => `Whether ${room} is held above or below the pressure around it`,
  },
]

// Which field governs the rest of its group, and what it has to be for them to
// apply. Named here rather than in the panel: it is a fact about the fields.
export const CONDITIONED_KEY = 'conditioned'

// Which jsonb key each group is stored under, on both the catalog room node and
// the option's room.
export const LOADS_GROUP = 'loads'
export const HVAC_GROUP = 'hvac'

// Set-ness, per type. See the note at the top: each of these is the reason a
// value that looks empty is or is not an answer.
export function isSet(field, value) {
  if (field.type === 'boolean') return typeof value === 'boolean'
  if (field.type === 'choice') return field.options.some((o) => o.id === value)
  return Number.isFinite(Number(value)) && Number(value) >= 0
}

function normalise(field, value) {
  return field.type === 'number' ? Number(value) : value
}

// Every field in a group for one room AS AN OPTION SEES IT, each with `source` —
// 'option', 'inherited', or null when neither level states one. `source` is what
// the panel draws differently and what decides whether there is anything to
// revert; `inherited` rides along even on an overridden row, so the UI can say
// what reverting would restore.
//
// `treeRoomNode` may be null: an option room whose placement has left the
// catalog inherits nothing, which is not an error.
export function resolveRoomFields(fields, group, treeRoomNode, optionRoom) {
  const inheritedMap = treeRoomNode?.[group] ?? {}
  const overrides = optionRoom?.[group] ?? {}

  const one = (field) => {
    const inheritedValue = isSet(field, inheritedMap[field.key])
      ? normalise(field, inheritedMap[field.key])
      : null
    const override = overrides[field.key]

    if (isSet(field, override)) {
      return { ...field, value: normalise(field, override), source: 'option', inherited: inheritedValue }
    }
    if (inheritedValue != null) {
      return { ...field, value: inheritedValue, source: 'inherited', inherited: inheritedValue }
    }
    // Nobody has said. The row still shows a value — see the note above — but
    // `source: null` is what keeps it from being drawn as anyone's answer.
    return { ...field, value: field.fallback, source: null, inherited: null }
  }

  return fields.map((field) => (field.type === 'pair' ? resolvePair(field, one) : one(field)))
}

// A PAIR is two independent fields sharing one row and one label — each half
// inherits, overrides and reverts on its own, exactly as if it were its own row,
// because that is what it is in storage. Only the drawing is joined.
//
// The row's `source` is the LOUDEST of its halves: overridden if either was
// typed here, otherwise inherited if either came from the catalog. That is what
// decides whether the row shows a revert at all — reverting then clears whichever
// halves were overridden and leaves the others alone.
function resolvePair(field, resolveOne) {
  const parts = field.parts.map((p) => resolveOne({ ...p, type: 'number', label: field.label }))
  // 'here' is the Tree tab's word for the same thing — see catalogRoomFields.
  const loudest = ['option', 'here', 'inherited'].find((s) => parts.some((p) => p.source === s))
  return { ...field, parts, source: loudest ?? null }
}

// The same rows AS THE CATALOG SEES THEM, with no option in the picture. The
// source is 'here', not 'inherited', because this is the thing inherited FROM:
// on the Tree tab a value is simply set or unset, with no lower level to fall
// back to.
export function catalogRoomFields(fields, group, treeRoomNode) {
  const stated = treeRoomNode?.[group] ?? {}
  const one = (field) => {
    const set = isSet(field, stated[field.key])
    return {
      ...field,
      value: set ? normalise(field, stated[field.key]) : field.fallback,
      source: set ? 'here' : null,
      inherited: null,
    }
  }
  return fields.map((field) => (field.type === 'pair' ? resolvePair(field, one) : one(field)))
}

// How a field reads once it has a value. Null is the caller's own kind of empty,
// never a zero — the two mean different things everywhere here.
export function formatField(field, value) {
  if (value == null) return null
  if (field.type === 'boolean') return value ? 'Yes' : 'No'
  if (field.type === 'choice') return field.options.find((o) => o.id === value)?.name ?? '(unknown)'
  const figure = field.decimals > 0 ? Number(value).toFixed(field.decimals) : String(Math.round(value))
  return field.unit ? `${figure} ${field.unit}` : figure
}

// Set or clear one field on a room node — a catalog one or an option one, which
// take the whole node so both get the same two rules:
//
//   * clearing DELETES the key rather than writing a 0 or a false, since both of
//     those are real answers and absence is the only "not set" this shape has;
//   * a node with nothing left in the group carries no key for it at all, which
//     keeps an untouched room byte-identical to before this existed and keeps
//     the panel's dirty check honest — it compares JSON, and `{}` is not the
//     same string as nothing.
export function roomWithField(room, field, group, value) {
  const next = { ...(room[group] ?? {}) }
  if (isSet(field, value)) next[field.key] = normalise(field, value)
  else delete next[field.key]

  const updated = { ...room, [group]: next }
  if (Object.keys(next).length === 0) delete updated[group]
  return updated
}
