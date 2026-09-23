import { useEffect, useState } from 'react'
import { featureCollection, multiPolygon, point } from '@turf/helpers'
import { bbox } from '@turf/bbox'
import { intersect } from '@turf/intersect'
import { voronoi } from '@turf/voronoi'
import { GeoJSON } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../../data/supabase.js'

// THE REFERENCE CANCER HOSPITALS — campus boundaries and building outlines, read
// through the two *_geojson views (sql/cancer_hospital_geojson_views.sql) for the
// reason sp_project_geojson exists: PostgREST cannot serialise geometry.
//
// Read-only context under the project sites, so it never takes a click while a
// site is being drawn. A failed read draws nothing rather than taking the map
// down — most likely the SQL has not been run yet.
const CAMPUS_STYLE = { color: '#7b3fa0', weight: 1.5, dashArray: '5 4', fillOpacity: 0.04 }
const BUILT_STYLE = { color: '#7b3fa0', weight: 1, fillColor: '#9b59b6', fillOpacity: 0.35 }
// Faint: a backdrop the sites and hospitals sit on, not a layer competing with them.
const VORONOI_STYLE = { color: '#7b3fa0', weight: 1, opacity: 0.6, fillColor: '#9b59b6', fillOpacity: 0.04 }

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

// ONE FEATURE PER POLYGON. `floors_all[i]` and `types_all[i]` describe the i-th
// polygon of the row's MultiPolygon, so the row is split and each outline
// carries its own pair — a popup listing every part's floors would not say which
// outline you clicked.
function builtFeatures(row) {
  const floors = Array.isArray(row.floors_all) ? row.floors_all : []
  const types = Array.isArray(row.types_all) ? row.types_all : []
  const g = row.geojson
  const polygons = g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : []
  return {
    type: 'FeatureCollection',
    features: polygons.map((coordinates, i) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates },
      properties: { name: row.name, floors: floors[i] ?? null, type: types[i] ?? null },
    })),
  }
}

function builtPopup({ name, floors, type }) {
  const detail = [type && escape(type), floors != null && `${escape(floors)} floors`].filter(Boolean).join(' · ')
  return `<b>${escape(name || 'Unnamed building')}</b>${detail ? `<br>${detail}` : ''}`
}

// INDIA AS ONE MULTIPOLYGON, out of india_boundary_view's `geometry` values —
// GeoJSON in whatever wrapping it comes: an object or a JSON string, a bare
// geometry, a Feature, a FeatureCollection or a GeometryCollection.
function boundaryOf(values) {
  const polygons = []
  const collect = (g) => {
    if (typeof g === 'string') {
      try {
        g = JSON.parse(g)
      } catch {
        return
      }
    }
    if (!g || typeof g !== 'object') return
    if (g.type === 'FeatureCollection') return (g.features ?? []).forEach(collect)
    if (g.type === 'GeometryCollection') return (g.geometries ?? []).forEach(collect)
    if (g.type === 'Feature') return collect(g.geometry)
    if (g.type === 'Polygon') polygons.push(g.coordinates)
    if (g.type === 'MultiPolygon') polygons.push(...g.coordinates)
  }
  ;(values ?? []).forEach(collect)
  return polygons.length ? multiPolygon(polygons) : null
}

// A CELL PER POINT, clipped to India. Planar in degrees, as Turf is — an edge is
// equidistant in lat/long, not on the ground, which skews east-west edges by
// cos(latitude). A picture of catchments, not a measurement of one. Two points
// on one spot share a cell, and Turf returns null for the second.
function voronoiCells(points, india) {
  if (points.length < 2) return []
  const [w, s, e, n] = bbox(india)
  const seeds = featureCollection(points.map(({ bounds }) => point([bounds.getCenter().lng, bounds.getCenter().lat])))
  const diagram = voronoi(seeds, { bbox: [w - 1, s - 1, e + 1, n + 1] })
  return diagram.features.flatMap((cell, i) => {
    if (!cell) return []
    // One awkward edge must not cost every other cell: a failed clip draws that
    // cell unclipped and says so, rather than throwing out of the render.
    let clipped
    try {
      clipped = intersect(featureCollection([cell, india]))
    } catch (e) {
      console.warn('Voronoi clip failed for', points[i].row.name, e)
      clipped = cell
    }
    if (!clipped) return []
    const { row, source } = points[i]
    return [{ key: `${source}-${row.id}`, name: row.name, feature: clipped }]
  })
}

// ONE SEED PER HOSPITAL: a campus, or a building whose hospital has no campus.
function seedsOf(campuses, built) {
  const withCampus = new Set(campuses.map((c) => c.hospital_id).filter((id) => id != null))
  return [
    ...campuses.map((row) => ({ row, source: 'campus' })),
    ...built.filter((b) => b.hospital_id == null || !withCampus.has(b.hospital_id)).map((row) => ({ row, source: 'built' })),
  ]
    .filter(({ row }) => row.geojson)
    .map((p) => ({ ...p, bounds: L.geoJSON(p.row.geojson).getBounds() }))
    .filter(({ bounds }) => bounds.isValid())
}

async function read(table, columns) {
  const { data, error } = await supabase.from(table).select(columns)
  if (error) {
    console.warn(`Could not read ${table}:`, error.message)
    return []
  }
  return data ?? []
}

// THE CELLS ARE WORKED OUT ONCE, WHEN THE DATA ARRIVES — all three tables in one
// go, then one Voronoi pass stored as state. Nothing re-runs it on render or on a
// toggle; hiding the layer unmounts it, and showing it again is a fresh fetch.
export default function ReferenceHospitalsLayer({ drawMode }) {
  const [campuses, setCampuses] = useState([])
  const [built, setBuilt] = useState([])
  const [cells, setCells] = useState([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      read('cancer_hospital_campus_geojson', 'id, name, hospital_id, geojson'),
      read('cancer_hospital_built_geojson', 'id, name, hospital_id, floors_all, types_all, geojson'),
      read('india_boundary_view', 'geometry'),
    ]).then(([campusRows, builtRows, indiaRows]) => {
      if (cancelled) return
      setCampuses(campusRows)
      setBuilt(builtRows)
      const india = boundaryOf(indiaRows.map((row) => row.geometry))
      if (!india) return console.warn('india_boundary_view.geometry holds no polygon', indiaRows)
      setCells(voronoiCells(seedsOf(campusRows, builtRows), india))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {cells.map(({ key, feature }) => (
        <GeoJSON
          key={key}
          data={feature}
          style={VORONOI_STYLE}
          // A backdrop, not a control: it takes no pointer, so the outlines and
          // sites above it keep every hover and click.
          interactive={false}
        />
      ))}
      {campuses
        .filter((row) => row.geojson)
        .map((row) => (
          <GeoJSON
            key={`campus-${row.id}`}
            data={row.geojson}
            style={CAMPUS_STYLE}
            interactive={!drawMode}
            onEachFeature={(_, layer) => layer.bindTooltip(escape(row.name || 'Unnamed campus'), { sticky: true })}
          />
        ))}
      {built
        .filter((row) => row.geojson)
        .map((row) => (
          <GeoJSON
            key={`built-${row.id}`}
            data={builtFeatures(row)}
            style={BUILT_STYLE}
            interactive={!drawMode}
            onEachFeature={(feature, layer) => layer.bindPopup(builtPopup(feature.properties))}
          />
        ))}
    </>
  )
}
