// DEPARTMENT FACTORS — the two numbers a department is scaled by
// ==============================================================
//
//   grossing factor       net rooms -> the department's own footprint: the
//                         walls, corridors and shafts that belong to it but are
//                         nobody's room.
//
//   occupancy multiplier  how crowded it is against the density the catalog
//                         states. Densities are stated for a PRIVATE facility,
//                         so 1 is the baseline and a public one goes above it —
//                         every multiplier is then >= 1, which makes anything
//                         below one a spottable error rather than a plausible
//                         number.
//
// The catalog states a default on the department node in sp_section.tree; an
// option stores OVERRIDES ONLY on its department entry. Absent, null or not a
// usable number all inherit, so resolution is `option ?? catalog ?? 1` — the
// same arrangement schedules.js describes, and it lives here so a total and a
// panel can never disagree about which value is in force.
//
//   >>> 1 IS NOT AN OVERRIDE. Clearing removes the field rather than writing 1,
//   >>> so an option cannot say "explicitly ungrossed" against a catalog that
//   >>> grosses — the deliberate limit schedules have too.

export const DEFAULT_GROSSING_FACTOR = 1
export const DEFAULT_OCCUPANCY_MULTIPLIER = 1

// In the order they are drawn. `key` is the field on an option's department
// entry, `treeKey` the one on the catalog node.
export const DEPARTMENT_FACTORS = [
  {
    key: 'grossingFactor',
    treeKey: 'grossing_factor',
    label: 'Department Grossing Factor',
    fallback: DEFAULT_GROSSING_FACTOR,
    // Grossing adds area to a department; it never takes any away.
    min: DEFAULT_GROSSING_FACTOR,
    describe: (name) => `How much bigger ${name} is than the sum of its rooms`,
  },
  {
    key: 'occupancyMultiplier',
    treeKey: 'occupancy_multiplier',
    label: 'Occupancy multiplier',
    fallback: DEFAULT_OCCUPANCY_MULTIPLIER,
    min: DEFAULT_OCCUPANCY_MULTIPLIER,
    describe: (name) => `How crowded ${name} is, against the catalog's density`,
  },
]

export const GROSSING = DEPARTMENT_FACTORS[0]
export const OCCUPANCY = DEPARTMENT_FACTORS[1]

// A factor is a positive number or it is not set: zero would collapse a
// department to nothing and a negative one is not a scale, so both inherit.
const usable = (n) => Number.isFinite(n) && n > 0

// One factor's answer, and where it came from — 'option', 'inherited', or null
// for the fallback. `source` is what the panel draws differently and what
// decides whether there is anything to revert.
export function resolveFactor(factor, treeDeptNode, optionDept) {
  const inherited = usable(treeDeptNode?.[factor.treeKey]) ? treeDeptNode[factor.treeKey] : null
  const override = optionDept?.[factor.key]

  if (usable(override)) return { ...factor, value: override, source: 'option', inherited }
  if (inherited != null) return { ...factor, value: inherited, source: 'inherited', inherited }
  return { ...factor, value: factor.fallback, source: null, inherited: null }
}

export function resolveFactors(treeDeptNode, optionDept) {
  return DEPARTMENT_FACTORS.map((f) => resolveFactor(f, treeDeptNode, optionDept))
}

// The effective value alone, for arithmetic that does not care where it came
// from.
export function factorValue(factor, treeDeptNode, optionDept) {
  return resolveFactor(factor, treeDeptNode, optionDept).value
}

// Set or clear a factor on an option's department entry or a catalog one; they
// differ only in which key they use. Clearing DELETES the key rather than
// writing the fallback, so "inherits" and "happens to be 1" stay distinct.
export function withFactor(node, factor, value, { tree = false } = {}) {
  const field = tree ? factor.treeKey : factor.key
  const next = { ...node }
  if (usable(value)) next[field] = value
  else delete next[field]
  return next
}

// BUILDING FACTORS
// ================
//
// The same arrangement one level up. A building is grossed twice: from the
// departments it holds to its BUILT area, and from that to its FLOOR area.
//
// The defaults are two COLUMNS on sp_building, not jsonb — in this schema jsonb
// is for documents and a scalar on a definition table is a column. A
// department's factors sit in sp_section.tree because they belong to a
// PLACEMENT, which exists only inside that document; a building is a row.
//
// An option overrides them in `sp_option.data.building_factors`, keyed by
// building id — safe because unlike a department, a building appears at most
// once in an option.
//
// `key` is the sp_building column AND the key the override map uses: one name
// for both levels, differing only in where it is read from.
export const BUILDING_FACTORS = [
  {
    key: 'built_area_grossing_factor',
    label: 'Built Area Grossing Factor',
    fallback: 1,
    min: 1,
    describe: (name) => `How much bigger ${name}'s built area is than the departments in it`,
  },
  {
    key: 'floor_area_grossing_factor',
    label: 'Floor Area Grossing Factor',
    fallback: 1,
    min: 1,
    describe: (name) => `How much bigger ${name}'s floor area is than its built area`,
  },
]

// As resolveFactor, one level up. `overrides` is this option's map for that one
// building, normally absent.
export function resolveBuildingFactor(factor, buildingRow, overrides) {
  // PostgREST delivers numeric columns as strings often enough to coerce rather
  // than trust the type — a "1.15" would otherwise read as unusable and fall
  // back to 1.
  const stated = Number(buildingRow?.[factor.key])
  const inherited = usable(stated) ? stated : null
  const override = overrides?.[factor.key]

  if (usable(override)) return { ...factor, value: override, source: 'option', inherited }
  if (inherited != null) return { ...factor, value: inherited, source: 'inherited', inherited }
  return { ...factor, value: factor.fallback, source: null, inherited: null }
}

export function resolveBuildingFactors(buildingRow, overrides) {
  return BUILDING_FACTORS.map((f) => resolveBuildingFactor(f, buildingRow, overrides))
}

// The counterpart to factorValue.
export function buildingFactorValue(factor, buildingRow, overrides) {
  return resolveBuildingFactor(factor, buildingRow, overrides).value
}

export const BUILT_AREA = BUILDING_FACTORS[0]
export const FLOOR_AREA = BUILDING_FACTORS[1]

// Set or clear one factor in an option's per-building override map. Returns
// undefined once nothing is left, so an empty blob is never written where an
// absent one says the same thing. The catalog side needs none of this — it is
// two columns, written directly.
export function withBuildingFactor(blob, factor, value) {
  const next = { ...(blob ?? {}) }
  if (usable(value)) next[factor.key] = value
  else delete next[factor.key]
  return Object.keys(next).length > 0 ? next : undefined
}
