// Site areas, measured from a project's drawn geometry.
//
// Lives here rather than in MapPanel because both main and side need it now:
// the map draws the site, side reports how big it is. Leaflet does the geodesic
// maths, so this is UI-side — data/ never imports Leaflet.

import L from 'leaflet'

export const SQM_PER_SQFT = 0.09290304
const SQM_PER_ACRE = 4046.8564224

function ringArea(ring) {
  return L.GeometryUtil.geodesicArea(ring)
}

function polygonArea(rings) {
  if (!rings || rings.length === 0) return 0
  let area = ringArea(rings[0])
  for (let i = 1; i < rings.length; i++) {
    area -= ringArea(rings[i])
  }
  return area
}

function calcAreaSqm(geojson) {
  let area = 0
  L.geoJSON(geojson).eachLayer((layer) => {
    if (!layer.getLatLngs) return
    const latlngs = layer.getLatLngs()
    if (latlngs.length === 0) return

    const first = latlngs[0]
    if (Array.isArray(first) && Array.isArray(first[0])) {
      // MultiPolygon: array of polygons, each an array of rings
      latlngs.forEach((polygonRings) => {
        area += polygonArea(polygonRings)
      })
    } else if (Array.isArray(first)) {
      // Polygon with optional holes: array of rings
      area += polygonArea(latlngs)
    } else {
      // Single ring
      area += ringArea(latlngs)
    }
  })
  return area
}

// One area in the three units the brief is written in. Null geometry (a project
// with no site drawn yet) returns null rather than zeros, so a caller can tell
// "not drawn" from "drawn, and tiny".
export function siteAreas(geojson) {
  if (!geojson) return null
  const sqm = calcAreaSqm(geojson)
  if (!sqm) return null
  return { sqm, sqft: sqm / SQM_PER_SQFT, acre: sqm / SQM_PER_ACRE }
}

// THE UNIT EVERY AREA IN THIS APP IS STATED IN, written once because it is
// printed beside a figure in a dozen places and spelled out — "sqft" — it cost a
// canvas card more width than the figure it labels. The squared glyph is one
// character and reads the same.
//
// It is NOT the unit the energy model will report in; see the note on the
// department heading in CLAUDE.md, which is the open question this does not
// settle.
export const AREA_UNIT = 'ft²'

// Every number the app prints goes through here, so thousands separators and
// rounding are the same wherever a figure appears. It was defined four times
// under three names.
//
// ONE DECIMAL PLACE, ALWAYS, AND ALWAYS WRITTEN. Every caller that leaves the
// precision to this default is printing an AREA — and areas are read down a
// column against each other: a room's typed 20.0 beside a card header's 20 read
// as two different quantities, which is what sent this to 1. `minDigits`
// defaults to `digits` for the same reason: a whole number has to keep the
// place, or the column jitters between "20" and "20.5" as the rooms change.
//
// A caller measuring something else states its own precision — a percentage,
// acres, a multiplier showing 1.00 — and CountField passes both, which is what
// keeps a COUNT reading "×3" rather than "×3.0".
export function formatArea(n, digits = 1, minDigits = digits) {
  return Number(n ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: minDigits,
  })
}
