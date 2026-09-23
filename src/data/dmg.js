// DISEASE MANAGEMENT GROUPS — sp_dmg, and sp_group.dmg_id pointing at it.
//
// A DMG is a speciality a facility targets: oncology, cardiac, ophthalmology. It
// lives on the DEPARTMENT GROUP's definition row, authored in Supabase only, so
// one tag reaches every placement of that group in every building at once.
//
// A GROUP WITH NO DMG IS FOR EVERY FACILITY. That is everything entered before
// DMGs existed, and it stays in scope whatever is picked.
//
// Two readers, one rule: an option's `dmgs` decides which groups the Project tab
// offers as ghosts, and the General answer of the same name decides which groups
// the Test run asks. `groupInScope` is the one definition of it.

export const DMG_COLUMN = 'dmg_id'

// THE `default` DMG IS PART OF EVERY HOSPITAL, so it is never a choice. Matched
// by NAME, like the `default` function row: this repo is public and a uuid in
// source is exactly what CLAUDE.md forbids committing.
export const DEFAULT_DMG_NAME = 'default'
const isDefault = (dmg) => (dmg?.name ?? '').trim().toLowerCase() === DEFAULT_DMG_NAME

// Applied ONCE, as the catalog loads: a group tagged `default` reads as untagged
// — in scope everywhere — and the row leaves the list every picker draws. In
// memory only; sp_group is never written from here.
export function foldDefaultDmg({ groups, dmgs }) {
  const defaults = new Set(dmgs.filter(isDefault).map((d) => d.id))
  if (defaults.size === 0) return { groups, dmgs }
  return {
    dmgs: dmgs.filter((d) => !defaults.has(d.id)),
    groups: groups.map((g) => (defaults.has(g[DMG_COLUMN]) ? { ...g, [DMG_COLUMN]: null } : g)),
  }
}

// `dmgIds` null means NO FILTER — an option saved before DMGs existed, which
// must go on offering everything it always did. An array, even an empty one,
// is a choice: the untagged groups plus the ones picked.
export function groupInScope(groupDef, dmgIds) {
  return tagInScope(groupDef?.[DMG_COLUMN] ?? null, dmgIds)
}

// The same, for a reader holding the tag rather than the row.
export function tagInScope(tag, dmgIds) {
  if (!Array.isArray(dmgIds)) return true
  return tag == null || dmgIds.includes(tag)
}

// A stored list, normalised: strings only, no repeats. Anything else is no key.
export function readDmgIds(stored) {
  if (!Array.isArray(stored)) return null
  return [...new Set(stored.filter((id) => typeof id === 'string' && id))]
}
