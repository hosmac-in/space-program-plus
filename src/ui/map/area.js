// Site areas, measured from a project's drawn geometry.
//
// Lives here rather than in MapPanel because both main and side need it now:
// the map draws the site, side reports how big it is. Leaflet does the geodesic
// maths, so this is UI-side — data/ never imports Leaflet.

import L from 'leaflet'

const SQM_PER_SQFT = 0.09290304
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

// Every number the app prints goes through here, so thousands separators and
// rounding are the same wherever a figure appears. It was defined four times
// under three names.
export function formatArea(n, digits = 0) {
  return Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: digits })
}
