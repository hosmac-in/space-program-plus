// BUILDINGS — the one write this app makes to a definition table
// ==============================================================
//
// Every other definition row (sp_department, sp_room, sp_object, sp_group) is
// read-only here and edited in the Supabase table editor. A building's two
// grossing factors are the exception, because they are the catalog's DEFAULT
// for something an option overrides — the job sp_section.tree already does for
// a department's factors.
//
//   >>> This edits the SHARED catalog: a building's factors are not per
//   >>> project, so changing one changes what every option everywhere inherits.
//   >>> The Tree tab is admin-only for that reason, and the RLS policy in
//   >>> sql/building_factors.sql enforces it regardless.
//
// Nothing else is ever written here — a building's name, function and sort order
// stay where they are.

import { supabase } from './supabase.js'

// Sets or clears ONE factor column. Returns an error message or null, matching
// writeSectionTree — the caller reloads the catalog.
//
// Null, never undefined: undefined is dropped by the client and would leave the
// column as it was, the opposite of clearing.
//
//   >>> THE .select() IS LOAD-BEARING. An update matching no rows — RLS refused
//   >>> it, or the id is gone — comes back with NO error and no data, so a
//   >>> refusal is indistinguishable from success. That is exactly how this
//   >>> looked the first time: a toast, a reload, and the old value.
export async function writeBuildingFactor(buildingId, factor, value) {
  const usable = Number.isFinite(value) && value > 0
  const { data, error } = await supabase
    .from('sp_building')
    .update({ [factor.key]: usable ? value : null })
    .eq('id', buildingId)
    .select('id')

  // Logged as well as returned: the panel gets a sentence, but the cause —
  // which column, which constraint, which policy — is only in the object.
  if (error || !data || data.length === 0) {
    console.error('sp_building write failed', { buildingId, column: factor.key, value, error, data })
  }

  if (error) return error.message
  if (!data || data.length === 0) {
    return 'That write was refused — building factors are admin-only, and the database enforces it.'
  }
  return null
}
