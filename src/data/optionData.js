// AN OPTION — sp_option.data
// ==========================
//
// A project has several options: competing versions of the program, each
// selecting a subset of the catalog tree (tree.js) and sizing it.
//
//   {
//     "phase_count": 1,
//     "buildings": ["<sp_building id>"],
//     "sections": ["<sp_section id>"],
//     "building_factors": { "<sp_building id>": { "built_area_grossing_factor": 1.2 } },
//     "departments": [{
//       "instance_id": "...",
//       "department_def_id": "...",
//       "tree_node_id": "...",          <- which placement in sp_section.tree
//       "phase": 1,                     <- which phase THIS entry programs
//       "occupancy_multiplier": 1,      <- override, absent = inherit
//       "grossing_factor": 1,           <- override, absent = inherit
//       "fallback_section_name": "...", <- display-only, for a deleted placement
//       "fallback_group_name": "...",
//       "rooms": [{
//         "instance_id": "...", "room_def_id": "...", "tree_room_node_id": "...",
//         "count": 1,                   <- how many of this room
//         "area_sqft": 0,               <- area of ONE of it, typed
//         "notes": "...",               <- optional, this option's own note
//         "schedules": { "occupancy": "..." },  <- overrides, absent = inherit
//         "loads": { "people": 6 },     <- overrides, absent = inherit
//         "hvac": { "conditioned": true },      <- overrides, absent = inherit
//         "objects": [{ "instance_id": "...", "object_def_id": "...", "count": 1 }]
//       }]
//     }]
//   }
//
// Ids and counts only; names and areas resolve from the definition tables on
// load. The list is FLAT — section and group resolve live from tree_node_id, so
// reorganising the Tree tab keeps every option in sync. The frozen
// fallback_*_name strings cover the one case that cannot resolve: the placement
// was deleted from the catalog.
//
// KEYS
//
// `tree_node_id` anchors an entry to one placement, so "which rooms may I add
// here?" is one node's rooms rather than a union across every placement of the
// same department. Dedup on add is (tree_node_id, phase), never the definition
// id — the same duplicable-entity trap as in the tree, one layer up.
//
// Sections and buildings are stored because they are ADDED deliberately: an
// option may hold an empty one of either. Groups are not — a group appears
// exactly when a department inside it does. Neither needs a placement anchor,
// since each appears at most once per option.
//
// A department's building is DERIVED (tree_node_id -> section -> building_id),
// never stored, so moving a section between buildings rewrites no options. The
// price: two buildings of the same type cannot coexist in one option, since
// tree_node_id would stop identifying one place in it. Fixing that needs a
// building-instance level and an explicit anchor on every department — a
// deliberate second pass, and per-department phasing covers the staging case
// that would otherwise want it.
//
// PHASES
//
// `phase_count` is declared by the option; the phases are 1..N and exist
// whether or not anything is in them. A phase is a bare ordinal — no name, no
// attributes — so there is no phase table and should not be.
//
// A department is programmed SEPARATELY IN EACH PHASE: one entry per
// (tree_node_id, phase), each with its own instance_id, rooms and objects.
// Nothing carries over; adding a phase entry seeds it with a COPY of the
// closest lower phase, purely as a base to edit. Any subset of the phases is
// normal. There is no unphased state — a legacy `phase: null` loads as 1.
//
// AREA
//
// `area_sqft` is the area of ONE of a room, typed by hand. Its objects do NOT
// sum to it — a room is mostly the space between them. That difference is
// CIRCULATION, derived and never stored:
//
//     circulation = area_sqft − Σ object.count × object.area_sqft
//
// It goes negative when the objects do not fit, which is a real state worth
// seeing rather than clamping. An object's own area decides nothing else.
//
//   >>> THE COUNT MULTIPLIES THE AREA. Twelve 200 sqft rooms are 2,400 sqft.
//   >>> This REVERSED an earlier decision taken when area was summed from
//   >>> objects. If areas ever look wrong by an exact factor, look here first —
//   >>> it is the one rule that was inverted rather than added.
//
// The chain, each step multiplying the one above it:
//
//   net    Σ (room.area_sqft × room.count)            the rooms as entered
//   built  net × the BUILDING's built-area factor     what those rooms occupy
//   dept   built × the DEPARTMENT's grossing factor   its own footprint
//   floor  Σ dept × the BUILDING's floor-area factor  <- BUILDING level only
//
// FACTORS AND SCHEDULES ARE OVERRIDES
//
// `grossing_factor`, `occupancy_multiplier` and a room's `schedules` all follow
// one rule: the catalog states the default, this document stores only a
// departure, and clearing one DELETES the key rather than writing a null. So
// resolution is `option ?? catalog ?? fallback`, with no third state.
//
//   >>> KNOWN LIMIT, deliberate: an option cannot say "explicitly none" against
//   >>> a catalog default that has one. Supporting it means making key PRESENCE
//   >>> significant (Object.hasOwn) and every reader agreeing — a trap worth
//   >>> not laying until something needs it.
//
// Occupancy densities are calibrated for a PRIVATE facility, so 1 is the
// baseline and a public one raises it. Every multiplier is then >= 1 and a
// lower one is a visible data error. A department needing a permanently
// different density is a DIFFERENT DEPARTMENT — see CLAUDE.md. Nothing consumes
// it yet; the questionnaire's gates are what will set it.
//
// `building_factors` is keyed by building id — safe because a building appears
// at most once — and kept beside `buildings` so that list stays a plain id
// array everything can `includes()`.
//
// data/factors.js and data/schedules.js own the resolution for all three.

// SCHEMA VERSIONS. Every older row still loads, and absence always means the
// behaviour that version had, so none of these needs a migration.
//
// 13  a room may carry `loads` and `hvac` — overrides only, exactly as
//     `schedules` are. Absent: everything inherited. Note that 0 is a VALUE in
//     both, as is `false` for a boolean, unlike a department factor where only
//     > 0 means anything; there, only absence means "nobody has said". See
//     data/roomEnergy.js.
// 12  a room may carry `notes`. This is the option's OWN note, not an override
//     of the catalog's — both are shown, one above the other. Absent: no note,
//     which is what every version before this had.
// 11  `building_factors`. Absent: every building inherits what sp_building says.
// 10  `grossing_factor` / `occupancy_multiplier` became OVERRIDES — absent now
//     means "inherit" where in 9 it meant 1. 9 only wrote them when they were
//     not 1, so every stored value was already a departure and stays one; an
//     option that relied on the implied 1 now takes the catalog's default,
//     which is the point.
// 9   `area_sqft` per room, typed rather than summed from objects, and the
//     count now MULTIPLIES it; `grossing_factor` per department. An older row
//     opens with no areas rather than wrong ones — its figures were sums of
//     object areas and nothing could turn those into room areas.
// 8   `occupancy_multiplier`. Absent: 1, the baseline.
// 7   a room's `schedules`, overrides only. Absent: everything inherited.
// 6   a room's `count`. Absent: 1.
// 5   `phase_count`, and one department entry per phase rather than one entry
//     carrying a phase. A v4 row opens with as many phases as its highest in
//     use; `phase: null` becomes 1.
// 4   buildings explicit, departments phased. Older rows take the buildings
//     their SECTIONS imply, so an option holding an empty section still shows
//     its building. A short-lived v4 wrote `phase_id` into a phase table that
//     was never created — always null, and simply dropped on the next write.
// 3   sections explicit. Older rows derive them from their departments.
// 2   the anchor keys were renamed from `hierarchy_*`. Nothing reads v1: an
//     entry with no anchor is dropped on load, so a v1 row opens empty rather
//     than wrong.

// The catalog says what may be in a room, not how many.
export const DEFAULT_OBJECT_COUNT = 1

import {
  BUILT_AREA,
  buildingFactorValue,
  DEPARTMENT_FACTORS,
  factorValue,
  FLOOR_AREA,
  GROSSING,
} from './factors.js'
import { deptNodeIndex } from './tree.js'

export const SCHEMA_VERSION = 13

// Re-exported because this is where every other option figure is imported from.
export {
  DEFAULT_GROSSING_FACTOR,
  DEFAULT_OCCUPANCY_MULTIPLIER,
  DEPARTMENT_FACTORS,
  resolveFactors,
} from './factors.js'

// Zero, not null: it totals honestly and reads as "no area entered" without
// every caller handling an absence.
export const DEFAULT_ROOM_AREA_SQFT = 0

export const DEFAULT_ROOM_COUNT = 1

// The cap keeps the phase strips on a department card readable — the card is a
// fixed width and they divide it.
export const DEFAULT_PHASE_COUNT = 1
export const MAX_PHASE_COUNT = 6

// For the INPUTS that set the number, not for reading a row back — see the note
// in loadInstanceData on why capping there would lose entries.
export function clampPhaseCount(n) {
  if (!Number.isInteger(n)) return DEFAULT_PHASE_COUNT
  return Math.min(MAX_PHASE_COUNT, Math.max(DEFAULT_PHASE_COUNT, n))
}

// In-memory (camelCase, names/areas resolved) -> wire format (ids only).
export function buildInstanceData(
  departments,
  sectionIds = [],
  buildingIds = [],
  phaseCount = DEFAULT_PHASE_COUNT,
  buildingFactors = {}
) {
  return {
    // Written as given, not clamped: the builder already holds a valid count,
    // and a legacy option using more phases than the input offers must keep them.
    phase_count: Number.isInteger(phaseCount) && phaseCount > 0 ? phaseCount : DEFAULT_PHASE_COUNT,
    buildings: [...buildingIds],
    sections: [...sectionIds],
    // Only buildings still in the option, so a removed one leaves no orphaned
    // factors to reappear if it is added again.
    building_factors: Object.fromEntries(
      Object.entries(buildingFactors ?? {}).filter(
        ([id, blob]) => buildingIds.includes(id) && blob && Object.keys(blob).length > 0
      )
    ),
    departments: departments.map((d) => ({
      instance_id: d.instanceId,
      department_def_id: d.defId,
      tree_node_id: d.treeNodeId ?? null,
      phase: d.phase ?? DEFAULT_PHASE_COUNT,
      fallback_section_name: d.fallbackSectionName ?? null,
      fallback_group_name: d.fallbackGroupName ?? null,
      // Overrides only: a department nobody has departed from writes neither
      // key, and 1 is never written — "explicitly 1" and "inherits" must stay
      // different things.
      ...DEPARTMENT_FACTORS.reduce(
        (out, f) => (Number.isFinite(d[f.key]) && d[f.key] > 0 ? { ...out, [f.treeKey]: d[f.key] } : out),
        {}
      ),
      rooms: d.rooms.map((r) => ({
        instance_id: r.instanceId,
        room_def_id: r.defId,
        tree_room_node_id: r.treeRoomNodeId ?? null,
        count: r.count ?? DEFAULT_ROOM_COUNT,
        // Always written, including 0, so the row's shape stays stable.
        area_sqft: Number.isFinite(r.areaSqft) ? r.areaSqft : DEFAULT_ROOM_AREA_SQFT,
        // Only when there is one, and trimmed — an emptied note leaves no key
        // behind, so a room nobody has annotated writes what it always did.
        ...(r.notes?.trim() ? { notes: r.notes.trim() } : {}),
        // Only when there are any, so an option that never touches a schedule,
        // a load or its air writes exactly the payload it wrote before these
        // existed.
        ...(r.schedules && Object.keys(r.schedules).length > 0 ? { schedules: r.schedules } : {}),
        ...(r.loads && Object.keys(r.loads).length > 0 ? { loads: r.loads } : {}),
        ...(r.hvac && Object.keys(r.hvac).length > 0 ? { hvac: r.hvac } : {}),
        objects: r.objects.map((o) => ({
          instance_id: o.instanceId,
          object_def_id: o.defId,
          count: o.count,
        })),
      })),
    })),
  }
}

// Wire format -> in-memory, resolving every id against the definition tables.
//
// An entry with no tree_node_id can't be placed, room-filtered or matched to a
// card, so it would sit in the data invisibly. Those are dropped here; the
// caller compares lengths and says how many, so it isn't silent.
//
// `sectionIds` and `buildingIds` come back null, not [], for a row saved before
// those keys existed — the caller can then tell "no key" (derive it) from "the
// user removed every one", which is legitimate.
export function loadInstanceData(data, departmentDefs, roomDefs, objectDefs) {
  const rows = (data?.departments ?? []).filter((d) => d.tree_node_id)

  // Number.isInteger, not truthiness, so 0 and the stale uuid an early v4 row
  // may carry in phase_id are all rejected without a special case.
  const phaseOf = (d) => (Number.isInteger(d.phase) && d.phase > 0 ? d.phase : 1)

  // The highest phase in use is the floor: a smaller declared count would hide
  // entries with no strip to reach them on. NOT clamped to MAX_PHASE_COUNT —
  // that cap belongs to the input, and capping here would fold every phase
  // above it onto one strip and merge two entries of the same department.
  const phaseCount = Math.max(
    Number.isInteger(data?.phase_count) ? data.phase_count : DEFAULT_PHASE_COUNT,
    ...rows.map(phaseOf),
    DEFAULT_PHASE_COUNT
  )

  const departments = rows
    .map((d) => {
      const deptDef = departmentDefs.find((x) => x.id === d.department_def_id)
      return {
        instanceId: d.instance_id ?? crypto.randomUUID(),
        defId: d.department_def_id,
        name: deptDef?.name,
        type: deptDef?.type,
        treeNodeId: d.tree_node_id,
        phase: phaseOf(d),
        fallbackSectionName: d.fallback_section_name ?? null,
        fallbackGroupName: d.fallback_group_name ?? null,
        // Null, not 1: baking the fallback in here would make every department
        // look overridden and stop the catalog's default ever reaching it.
        ...DEPARTMENT_FACTORS.reduce(
          (out, f) => ({
            ...out,
            [f.key]: Number.isFinite(d[f.treeKey]) && d[f.treeKey] > 0 ? d[f.treeKey] : null,
          }),
          {}
        ),
        rooms: (d.rooms ?? []).map((r) => {
          const roomDef = roomDefs.find((x) => x.id === r.room_def_id)
          return {
            instanceId: r.instance_id ?? crypto.randomUUID(),
            defId: r.room_def_id,
            name: roomDef?.name,
            type: roomDef?.type,
            treeRoomNodeId: r.tree_room_node_id ?? null,
            count: Number.isInteger(r.count) && r.count > 0 ? r.count : DEFAULT_ROOM_COUNT,
            // Negative is not an area.
            areaSqft:
              Number.isFinite(r.area_sqft) && r.area_sqft >= 0 ? r.area_sqft : DEFAULT_ROOM_AREA_SQFT,
            // '' rather than null, so the field bound to it is always
            // controlled and the dirty check compares like with like.
            notes: typeof r.notes === 'string' ? r.notes : '',
            // Carried ONLY when the row has some: absent here must mean the
            // same as absent on the wire, or the panel's dirty check would see
            // a change ({} against nothing) the moment an option loaded.
            ...(r.schedules ? { schedules: r.schedules } : {}),
            ...(r.loads ? { loads: r.loads } : {}),
            ...(r.hvac ? { hvac: r.hvac } : {}),
            objects: (r.objects ?? []).map((o) => {
              const objectDef = objectDefs.find((x) => x.id === o.object_def_id)
              return {
                instanceId: o.instance_id ?? crypto.randomUUID(),
                defId: o.object_def_id,
                name: objectDef?.name,
                type: objectDef?.type,
                areaSqft: objectDef?.area_sqft ?? null,
                count: o.count,
              }
            }),
          }
        }),
      }
    })

  return {
    departments,
    sectionIds: data?.sections ?? null,
    buildingIds: data?.buildings ?? null,
    // {} rather than null: unlike sections and buildings there is nothing to
    // derive from an absent key, and "no overrides" reads both the same.
    buildingFactors: data?.building_factors ?? {},
    phaseCount,
  }
}

// Circulation is a real row in sp_object, matched by name because that is the
// only stable handle — an id would have to be configured somewhere, and there
// is nowhere to configure it yet.
export const CIRCULATION_OBJECT_NAME = 'circulation'

export function findCirculationDef(objectDefs = []) {
  return objectDefs.find((o) => o.name?.trim().toLowerCase() === CIRCULATION_OBJECT_NAME) ?? null
}

// What a room's objects leave over, per ONE of the room. Negative when they do
// not fit, which is reported rather than clamped.
//
// `circulationDefId` is excluded from the sum: an explicitly placed circulation
// object would be counted against itself, and the figure would fall by its own
// value every time it was recomputed.
export function circulationSqft(room, circulationDefId = null) {
  const objects = (room?.objects ?? [])
    .filter((o) => !circulationDefId || o.defId !== circulationDefId)
    .reduce((sum, o) => sum + o.count * (o.areaSqft ?? 0), 0)
  return (room?.areaSqft ?? DEFAULT_ROOM_AREA_SQFT) - objects
}

// What one department comes to — the `dept` step of the chain at the top of
// this file, and the ONE definition of it. summarize() calls it and so does the
// panel, so a card's figure cannot drift from the HUD's.
//
// `treeDeptNode` is the catalog node this entry is anchored to, since the
// grossing factor may be inherited from it. Null means "nothing to inherit".
// The BUILDING is needed too, for its built-area factor. Its floor-area factor
// deliberately is not applied here — that one lands once, on the sum of a
// building's departments.
export function departmentAreaSqft(dept, treeDeptNode = null, buildingRow = null, buildingOverrides = null) {
  return departmentBuiltAreaSqft(dept, buildingRow, buildingOverrides) * factorValue(GROSSING, treeDeptNode, dept)
}

// The rooms grossed to what they occupy in this building, before the
// department's own grossing.
export function departmentBuiltAreaSqft(dept, buildingRow = null, buildingOverrides = null) {
  return departmentNetAreaSqft(dept) * buildingFactorValue(BUILT_AREA, buildingRow, buildingOverrides)
}

// A building's total: its departments, then its floor-area factor once.
export function buildingAreaSqft(departmentTotal, buildingRow = null, buildingOverrides = null) {
  return departmentTotal * buildingFactorValue(FLOOR_AREA, buildingRow, buildingOverrides)
}

// The rooms alone: Σ (area × count), before any grossing — the figure an
// architect checks their room list against. Separate from departmentAreaSqft
// rather than inlined so the panel can show both without writing the sum twice.
export function departmentNetAreaSqft(dept) {
  return (dept?.rooms ?? []).reduce(
    (sum, r) => sum + (r.count ?? DEFAULT_ROOM_COUNT) * (r.areaSqft ?? DEFAULT_ROOM_AREA_SQFT),
    0
  )
}

// Room/object/area totals for an option, per department and overall.
//
// Takes the IN-MEMORY departments array, not the wire format — load-bearing:
// the wire format resolves no object areas, so summarising it returns zeros.
//
// Per-BUILDING totals are deliberately not returned: a department knows only
// its treeNodeId, and they belong wherever the tree is already being walked
// (see departmentGraphLayout.js).
export function summarize(departments = [], { sections, buildings, buildingFactors } = {}) {
  // Indexed once, not once per department — the HUD asks for every one of these
  // on every render. Without `sections` nothing is inherited and the figures
  // fall back to each option's own values, which is what a caller with no
  // catalog to hand can honestly report.
  const catalogNodes = sections ? deptNodeIndex(sections) : null
  const buildingById = new Map((buildings ?? []).map((b) => [b.id, b]))
  const overridesFor = (buildingId) => buildingFactors?.[buildingId] ?? null

  // Summed per building so the FLOOR-area factor lands once on each sum rather
  // than on every department in it. Per phase too, for the same reason.
  const perBuilding = new Map()
  const perBuildingPhase = new Map()
  let roomCount = 0
  let objectCount = 0
  let areaSqft = 0

  // A Map, not an object, so the keys stay numbers. Only phases something is IN
  // appear here; phaseRows fills in the declared-but-empty ones.
  const perPhase = new Map()

  const perDepartment = departments.map((d) => {
    const rooms = d.rooms ?? []
    let dRoomCount = 0
    let dObjectCount = 0
    let dArea = 0

    rooms.forEach((r) => {
      // Twelve of a room is twelve rooms. The count does not reach the objects:
      // theirs are per room, and say what is inside one of them.
      dRoomCount += r.count ?? DEFAULT_ROOM_COUNT
      ;(r.objects ?? []).forEach((o) => {
        dObjectCount += o.count
      })
    })

    // Net, the building's built-area grossing and the department's own. NOT
    // the floor-area factor — that is applied once per building, below.
    const placed = catalogNodes?.get(d.treeNodeId) ?? null
    const buildingId = placed?.buildingId ?? null
    const buildingRow = buildingId ? (buildingById.get(buildingId) ?? null) : null
    dArea = departmentAreaSqft(d, placed?.node ?? null, buildingRow, overridesFor(buildingId))

    perBuilding.set(buildingId, (perBuilding.get(buildingId) ?? 0) + dArea)
    const bpKey = `${buildingId}::${d.phase ?? 1}`
    perBuildingPhase.set(bpKey, {
      buildingId,
      phase: d.phase ?? 1,
      area: (perBuildingPhase.get(bpKey)?.area ?? 0) + dArea,
    })

    roomCount += dRoomCount
    objectCount += dObjectCount

    const phaseKey = d.phase ?? 1
    const bucket = perPhase.get(phaseKey) ?? { departmentCount: 0, roomCount: 0, objectCount: 0, areaSqft: 0 }
    bucket.departmentCount += 1
    bucket.roomCount += dRoomCount
    bucket.objectCount += dObjectCount
    perPhase.set(phaseKey, bucket)

    return {
      departmentId: d.defId,
      treeNodeId: d.treeNodeId,
      name: d.name,
      phase: d.phase ?? 1,
      instanceId: d.instanceId,
      roomCount: dRoomCount,
      objectCount: dObjectCount,
      areaSqft: dArea,
    }
  })

  // The floor-area factor, once per building, on the sum of its departments.
  perBuilding.forEach((total, buildingId) => {
    areaSqft += buildingAreaSqft(total, buildingById.get(buildingId) ?? null, overridesFor(buildingId))
  })
  perBuildingPhase.forEach(({ buildingId, phase, area }) => {
    const bucket = perPhase.get(phase)
    if (!bucket) return
    bucket.areaSqft += buildingAreaSqft(area, buildingById.get(buildingId) ?? null, overridesFor(buildingId))
  })

  return { departmentCount: departments.length, roomCount, objectCount, areaSqft, perDepartment, perPhase }
}

// One row per phase the option DECLARES, 1..N — including the ones nothing is
// in yet, which read as zero: a declared empty phase is the one you have not
// staged. Empty for a one-phase option, so those read as they did before phases
// existed. Shared, because the HUD and OptionStats ask the same question.
const EMPTY_PHASE = { departmentCount: 0, roomCount: 0, objectCount: 0, areaSqft: 0 }

export function phaseRows(perPhase, phaseCount = DEFAULT_PHASE_COUNT) {
  if (!perPhase || phaseCount <= 1) return []
  return Array.from({ length: phaseCount }, (_, i) => ({
    key: i + 1,
    label: `Phase ${i + 1}`,
    totals: perPhase.get(i + 1) ?? EMPTY_PHASE,
  }))
}
