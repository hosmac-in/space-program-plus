// WEATHER STATIONS — hb_weather
// =============================
//
// The EnergyPlus weather files (ISHRAE and IWEC) an energy model runs against.
// One row per station per source; `epw_url` points at the file on S3, which is
// what Grasshopper eventually fetches.
//
// A project carries `sp_project.weather_station` — the station nearest its
// site, assigned once when the project is created. It is a SUGGESTION frozen at
// creation, not a live lookup: nearest is a starting point, someone may pick a
// different station deliberately, and recomputing it would silently undo that.
//
// Nothing here writes. The one writer is NewProject on create, and
// scripts/backfillProjectStations.js for the projects that predate the column.

import { supabase } from './supabase.js'

export async function loadStations() {
  const { data, error } = await supabase
    .from('hb_weather')
    .select('id, city, state, source, wmo, latitude, longitude, epw_url')
  if (error) throw error
  return data
}

// What gets copied into sp_option.data. Null when the project has no station,
// and null on any failure — never an exception, because a station that cannot
// be read must not stop an option loading or saving.
export async function loadProjectWeather(projectId) {
  if (!projectId) return null
  const { data, error } = await supabase
    .from('sp_project')
    .select('station:weather_station(id, city, source, epw_url)')
    .eq('id', projectId)
    .single()
  const s = data?.station
  if (error || !s?.epw_url) return null
  return { station_id: s.id, epw_url: s.epw_url, city: s.city, source: s.source }
}

// Mean of the ring's vertices, not a true area centroid: a site is a small
// polygon and both land inside it, which is all that "which station is nearest"
// needs. GeoJSON is [lng, lat] — the one thing worth getting wrong once.
export function siteCentre(geometry) {
  const points = []
  const walk = (node) => {
    if (!Array.isArray(node)) return
    if (typeof node[0] === 'number' && typeof node[1] === 'number') points.push(node)
    else node.forEach(walk)
  }
  walk(geometry?.coordinates)
  if (points.length === 0) return null
  const sum = points.reduce((a, [lng, lat]) => [a[0] + lng, a[1] + lat], [0, 0])
  return { lng: sum[0] / points.length, lat: sum[1] / points.length }
}

// Great-circle distance in km. Straight-line distance on lat/long degrees is
// wrong by a factor of cos(latitude) in longitude, which across India is enough
// to pick the wrong station.
export function distanceKm(a, b) {
  const R = 6371
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// ISHRAE wins a tie because it covers India densely and is the local standard;
// the eight IWEC duplicates sit on the same stations, so without a rule the
// choice would come down to row order.
export function nearestStation(centre, stations) {
  if (!centre) return null
  let best = null
  let bestKm = Infinity
  for (const s of stations) {
    const km = distanceKm(centre, { lat: Number(s.latitude), lng: Number(s.longitude) })
    const better = km < bestKm || (km === bestKm && s.source === 'ISHRAE')
    if (better) {
      best = s
      bestKm = km
    }
  }
  return best && { station: best, km: bestKm }
}
