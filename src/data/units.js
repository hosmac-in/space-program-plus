// The one conversion this app's data layer needs: sp_object.area_sqm is
// stated in m² while everything else here — every room and department area —
// is held in sqft (see CLAUDE.md, Area). A catalog object's area is converted
// once, at the point it is read off the definition row, so nothing downstream
// has to know which table's column came in which unit.
//
// Lives in data/, not ui/map/area.js, because data/ must not import from ui/
// and this is read from data/optionData.js as well as from several panels.

export const SQM_PER_SQFT = 0.09290304

export function sqmToSqft(sqm) {
  return sqm == null ? null : sqm / SQM_PER_SQFT
}
