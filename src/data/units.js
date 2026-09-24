// The one conversion this app's data layer needs: the definition tables state
// `area_sqm` in m² — sp_room, sp_object and sp_equipment — while everything
// else here, every room and department area, is held in sqft (see CLAUDE.md,
// Area). A definition's area is converted once, at the point it is read off the
// row, so nothing downstream has to know which unit a column came in.
//
// Lives in data/, not ui/map/area.js, because data/ must not import from ui/
// and this is read from data/optionData.js as well as from several panels.

export const SQM_PER_SQFT = 0.09290304

export function sqmToSqft(sqm) {
  return sqm == null ? null : sqm / SQM_PER_SQFT
}

// The other way, for the one place an area leaves sqft on purpose: a
// questionnaire formula's area variable is always m², whatever the reader's
// toggle says. See data/questionnaire.js.
export function sqftToSqm(sqft) {
  return sqft == null ? null : sqft * SQM_PER_SQFT
}

// Cooling tonnage, a rule of thumb: one ton of refrigeration per 200 sqft. Read
// off the same grossed area each HUD prints, so the two figures cannot disagree.
export const SQFT_PER_TON = 200

export function coolingTons(sqft) {
  return sqft / SQFT_PER_TON
}
