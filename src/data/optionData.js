// AN OPTION — sp_option.data
// ==========================
//
// A project has several options: competing versions of the program, each
// selecting a subset of the catalog tree and sizing it. An option is one
// row in `sp_option` whose `data` column holds a flat list of departments:
//
//   {
//     "phase_count": 1,                 <- how many phases this option has
//     "buildings": ["...", "..."],      <- sp_building ids this option includes
//     "sections": ["...", "..."],       <- sp_section ids this option includes
//     "departments": [{
//       "instance_id": "...",
//       "department_def_id": "...",
//       "tree_node_id": "...",     <- WHICH placement in sp_section.tree
//       "phase": 1 | 2 | …,        <- which phase THIS entry programs
//       "fallback_section_name": "...", <- display-only, see below
//       "fallback_group_name": "...",
//       "rooms": [{
//         "instance_id": "...",
//         "room_def_id": "...",
//         "tree_room_node_id": "...",
//         "count": 1,                 <- how many of this room, see below
//         "objects": [{ "instance_id": "...", "object_def_id": "...", "count": 1 }]
//       }]
//     }]
//   }
//
// WHY tree_node_id MATTERS
//
// It anchors the entry to one specific placement in the catalog tree (see
// tree.js). That is what makes "which rooms may I add here?" a direct lookup of
// that one node's rooms instead of a union across every placement of the same
// department — the same duplicable-entity bug as in the tree, one layer up.
//
// It also means the same department definition may legitimately appear twice in
// one option, under two different placements. Deduplication on add is therefore
// "do we already have this NODE in this PHASE", never "do we already have this
// definition" — see the phase note below for the second half of that key.
//
// WHY SECTIONS ARE STORED
//
// A section is in the option because someone added it, not because something
// inside it happens to be added. That is what lets an option hold a section
// with nothing in it yet — the empty shell you fill in as you go — and a
// section that has been emptied again without it vanishing under you. Groups
// are NOT stored: a group appears exactly when a department inside it does.
//
// A section is one row in sp_section, never duplicated, so its own id is the
// identity here — there is no placement to disambiguate as there is one level
// down. (See tree.js on why departments cannot be keyed this way.)
//
// WHY BUILDINGS ARE STORED THE SAME WAY, AND WHY THEY AREN'T ANCHORED
//
// Same argument, one level up again: a building is in the option because
// someone added it, so an option can hold a building with no sections filled in
// yet. A building appears at most once per option, so its own id is the
// identity — there is nothing to disambiguate.
//
// Nothing else stores a building. A department's building resolves live through
// `tree_node_id -> section -> section.building_id`, which is what keeps this
// change small: no department entry needed a new anchor, and moving a section
// between buildings moves everything in it without rewriting a single option.
//
// The price is that two buildings of the SAME type can't coexist in one option
// — a campus with two separate hospitals. That would make tree_node_id
// ambiguous within an option, so every department would need an explicit
// building_instance_id alongside it, exactly as the tree needs instance_id.
// It is a deliberate second pass, not an oversight. Per-department phasing
// covers the staging case that would otherwise want it.
//
// WHY PHASE IS A NUMBER, AND WHY THERE IS NO PHASE TABLE
//
// Phasing is a design decision, and options exist to hold competing design
// decisions: the same department is phase 1 in one option and phase 2 in
// another. So it belongs to the option, not the catalog.
//
// And it is a plain natural number — 1, 2, 3 — not a pointer to a row. A phase
// has no name of its own, no colour, no attributes, and no existence apart from
// an option that declares it. A table would add a uuid, a join, a seeding step
// and a foreign key that jsonb cannot enforce anyway, all to store an ordinal
// that already carries its own meaning.
//
// AN OPTION DECLARES ITS PHASES, AND A DEPARTMENT HAS ONE ENTRY PER PHASE
//
// `phase_count` is chosen when the option is created — 1 by default — and
// changed afterwards in the dialog off the option chip. The option's phases are
// 1..phase_count, and they exist whether or not anything is in them: an empty
// phase 3 is the one you have not staged yet, not a phase that has stopped
// existing.
//
// A department is programmed SEPARATELY IN EACH PHASE it appears in, because
// that is what staging a building means: phase 1 is twenty beds, phase 3 is
// another forty in a different mix. So the departments list holds one entry per
// (tree_node_id, phase), each with its own rooms and objects and its own
// instance_id. Nothing carries over between them; adding a phase entry seeds it
// with a COPY of the closest lower phase purely as a starting point to edit.
//
// A department may be in any subset of the phases — phase 3 and not 1 or 2 is
// normal, and is exactly what a facility built out of an existing shell looks
// like.
//
// There is no unphased state. It existed when a department carried a single
// phase and had to start somewhere; now the phase is which of the option's
// declared phases this entry programs, and there is nothing for null to mean.
// An entry loaded without one is phase 1 — see loadInstanceData.
//
// A ROOM'S COUNT IS A BARE FIGURE
//
// A room carries how many of it this department has — twelve single-bed rooms,
// one nurse station. It is the figure the questionnaire's numbers will write
// into, and the reason it exists.
//
// It deliberately does NOT multiply anything. Area is still the sum of
// `object.count × area_sqft` across the room's objects, exactly as before, and a
// room's count does not scale it. So twelve single-bed rooms holding one bed
// between them is a legitimate — if incomplete — state, and the objects say how
// much is actually programmed.
//
// That is a decision, not an oversight, and it is the one to revisit first if
// the figures ever look wrong: making the count multiply would silently
// re-price every option that already has one.
//
// It DOES count towards `roomCount`. Twelve of a room is twelve rooms; saying
// "1" there while the panel says 12 would be the panel and the totals
// disagreeing about the same number.
//
// WHY THE LIST IS FLAT
//
// Section and group are not stored structurally. They're resolved live from
// tree_node_id at render time, so reorganising the Tree tab keeps
// every option in sync automatically. The frozen fallback_*_name strings are a
// display courtesy for the one case that can't be resolved: the placement was
// deleted from the catalog after this option referenced it.
//
// Like the tree, this stores only ids and counts. Names and areas resolve from
// the definition tables on load.

// 6: a room carries a `count`. A row without one loads with 1 per room, which
// is exactly what every version before this displayed and totalled.
//
// 5: the option declares `phase_count`, and a department has one entry per
// phase it is in rather than one entry carrying a phase. Nothing to migrate: a
// version 4 row has no phase_count and opens with as many phases as its highest
// phase used (1 if none), and each of its departments is a single entry in the
// phase it already named — which is exactly what it displayed. `phase: null`
// becomes phase 1, since with phases declared there is no unphased state left
// for it to mean.
//
// 4: buildings became explicit, and departments gained a phase. Older rows have
// neither key. They load with the buildings their *sections* imply — not their
// departments, so an option holding an empty section still shows the building
// it sits in — and every department unphased, which is exactly what those
// versions displayed.
//
// A short-lived version of 4 wrote `phase_id`, a uuid into a phase table that
// no longer exists. Nothing is read from it: it was only ever null, because the
// table was never created, so those rows load unphased like any other. It needs
// no migration — the next write of an option simply drops the key.
//
// 3: sections became explicit (see above). Older rows have no `sections` key;
// they load with the sections their departments imply, which is exactly what
// those versions displayed.
//
// 2: the anchor keys were `hierarchy_node_id` / `hierarchy_room_node_id` in 1,
// renamed when the Tree tab was. Nothing reads version 1 — an entry without an
// anchor under the current names is dropped on load, so a v1 row would load as
// an empty option rather than a wrong one.
// How many of an object a room starts with when you add one. The catalog has
// no opinion — it says what may be in a room, not how many.
export const DEFAULT_OBJECT_COUNT = 1

export const SCHEMA_VERSION = 6

// How many of a room a department starts with when you add one.
export const DEFAULT_ROOM_COUNT = 1

// Every option has at least one phase, and an option that has never been staged
// is an option with exactly one — which is why 1 is both the default and the
// floor. The cap keeps the phase strips on a department card readable: the card
// is a fixed width and they divide it.
export const DEFAULT_PHASE_COUNT = 1
export const MAX_PHASE_COUNT = 6

// For the INPUTS that set the number, not for reading a row back — see the note
// in loadInstanceData on why capping there would lose entries.
export function clampPhaseCount(n) {
  if (!Number.isInteger(n)) return DEFAULT_PHASE_COUNT
  return Math.min(MAX_PHASE_COUNT, Math.max(DEFAULT_PHASE_COUNT, n))
}

// In-memory (camelCase, names/areas resolved) -> wire format (ids only).
export function buildInstanceData(departments, sectionIds = [], buildingIds = [], phaseCount = DEFAULT_PHASE_COUNT) {
  return {
    // Written as given, not clamped: the builder already holds a valid count,
    // and a legacy option using more phases than the input offers must keep them.
    phase_count: Number.isInteger(phaseCount) && phaseCount > 0 ? phaseCount : DEFAULT_PHASE_COUNT,
    buildings: [...buildingIds],
    sections: [...sectionIds],
    departments: departments.map((d) => ({
      instance_id: d.instanceId,
      department_def_id: d.defId,
      tree_node_id: d.treeNodeId ?? null,
      phase: d.phase ?? DEFAULT_PHASE_COUNT,
      fallback_section_name: d.fallbackSectionName ?? null,
      fallback_group_name: d.fallbackGroupName ?? null,
      rooms: d.rooms.map((r) => ({
        instance_id: r.instanceId,
        room_def_id: r.defId,
        tree_room_node_id: r.treeRoomNodeId ?? null,
        count: r.count ?? DEFAULT_ROOM_COUNT,
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
// An entry with no tree_node_id can't be shown as a placement, room-filtered,
// or matched to a card — it would sit in the data invisibly. Those are dropped
// here; the caller compares lengths and tells the user how many, so it isn't
// silent.
//
// Returns the departments, the option's section and building ids, and how many
// phases it has. `sectionIds` and `buildingIds` are null, not [], for a row
// saved before those keys existed: the caller can then tell "no key" (derive it)
// from "the user removed every one" (an option with none, which is legitimate).
//
// `phaseCount` needs no such distinction — a row without the key opens with as
// many phases as its departments already use, and one is a perfectly good
// answer.
export function loadInstanceData(data, departmentDefs, roomDefs, objectDefs) {
  const rows = (data?.departments ?? []).filter((d) => d.tree_node_id)

  // An entry with no usable phase is phase 1: unphased no longer exists, and 0
  // and the stale uuid an early v4 row may carry in phase_id are not phases
  // either. Number.isInteger, not a truthiness check, is what rejects all three
  // without a special case.
  const phaseOf = (d) => (Number.isInteger(d.phase) && d.phase > 0 ? d.phase : 1)

  // A declared count smaller than what the departments actually use would hide
  // entries with no strip to reach them on, so the highest phase in use is the
  // floor. That is also how a row saved before the key existed gets its count.
  //
  // NOT clamped to MAX_PHASE_COUNT: that cap belongs to the input that sets the
  // number, not to reading a row back. Capping here would fold every phase above
  // it onto one strip and merge two entries of the same department into it —
  // loading must never lose an entry.
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
        rooms: (d.rooms ?? []).map((r) => {
          const roomDef = roomDefs.find((x) => x.id === r.room_def_id)
          return {
            instanceId: r.instance_id ?? crypto.randomUUID(),
            defId: r.room_def_id,
            name: roomDef?.name,
            type: roomDef?.type,
            treeRoomNodeId: r.tree_room_node_id ?? null,
            // A row saved before rooms had counts has one of each, which is
            // what it displayed.
            count: Number.isInteger(r.count) && r.count > 0 ? r.count : DEFAULT_ROOM_COUNT,
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
    phaseCount,
  }
}

// Room/object/area totals for an option, per department and overall.
//
// Takes the IN-MEMORY departments array, not the wire format. That's deliberate
// and load-bearing: area can only be summed here because loadInstanceData has
// already resolved areaSqft from sp_object. The wire format stores no areas, so
// summarising it would silently return zeros.
//
// Phase is totalled here because the department carries its own phase — the
// figure is honest without consulting anything else. Building deliberately is
// NOT: a department knows only its treeNodeId, and freezing a resolved building
// onto it would go stale the moment a section moved. Per-building totals belong
// wherever the tree is already being walked (see departmentGraphLayout.js).
export function summarize(departments = []) {
  let roomCount = 0
  let objectCount = 0
  let areaSqft = 0

  // Keyed by phase number. A Map, not an object, so the keys stay numbers
  // instead of becoming strings. Only phases something is IN appear here;
  // phaseRows fills in the declared-but-empty ones, which is the only place
  // that knows how many were declared.
  const perPhase = new Map()

  const perDepartment = departments.map((d) => {
    const rooms = d.rooms ?? []
    let dRoomCount = 0
    let dObjectCount = 0
    let dArea = 0

    rooms.forEach((r) => {
      // Twelve of a room is twelve rooms. The count does NOT reach the area or
      // the objects, though — see the note at the top of this file.
      dRoomCount += r.count ?? DEFAULT_ROOM_COUNT
      ;(r.objects ?? []).forEach((o) => {
        dObjectCount += o.count
        dArea += o.count * (o.areaSqft ?? 0)
      })
    })

    roomCount += dRoomCount
    objectCount += dObjectCount
    areaSqft += dArea

    const phaseKey = d.phase ?? 1
    const bucket = perPhase.get(phaseKey) ?? { departmentCount: 0, roomCount: 0, objectCount: 0, areaSqft: 0 }
    bucket.departmentCount += 1
    bucket.roomCount += dRoomCount
    bucket.objectCount += dObjectCount
    bucket.areaSqft += dArea
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

  return { departmentCount: departments.length, roomCount, objectCount, areaSqft, perDepartment, perPhase }
}

// The phase rows worth showing: one per phase the option DECLARES, 1..N, in
// order — including the ones nothing is in yet, which read as zero. A declared
// empty phase is a real state and worth seeing; it is the one you have not
// staged.
//
// Empty for a one-phase option, which is every option nobody has staged. Those
// read exactly as they did before phases existed, which is what keeps the figure
// from being noise on an option that will never use it.
//
// Shared because the HUD and OptionStats ask the same question and answered it
// with the same fifteen lines twice.
const EMPTY_PHASE = { departmentCount: 0, roomCount: 0, objectCount: 0, areaSqft: 0 }

export function phaseRows(perPhase, phaseCount = DEFAULT_PHASE_COUNT) {
  if (!perPhase || phaseCount <= 1) return []
  return Array.from({ length: phaseCount }, (_, i) => ({
    key: i + 1,
    label: `Phase ${i + 1}`,
    totals: perPhase.get(i + 1) ?? EMPTY_PHASE,
  }))
}
