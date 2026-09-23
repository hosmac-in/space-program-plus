import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { Z } from '../primitives/zIndex.js'

// Place search on the UHDP map, through OpenStreetMap's Nominatim — no key, so
// nothing secret ships in a public bundle. Its usage policy allows at most one
// request a second, which is why this searches on ENTER and never per keystroke.
// Biased to India (the map's own bounds) but not restricted to it.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const VIEWBOX = '68.11,35.67,97.40,6.55'

export default function PlaceSearch() {
  const map = useMap()
  const boxRef = useRef(null)
  const requestRef = useRef(0)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Leaflet otherwise reads a click in the field as a click on the map, and a
  // wheel over the results as a zoom.
  useEffect(() => {
    if (!boxRef.current) return
    L.DomEvent.disableClickPropagation(boxRef.current)
    L.DomEvent.disableScrollPropagation(boxRef.current)
  }, [])

  const search = async () => {
    const q = query.trim()
    if (!q) return
    // Ignore superseded responses — a second Enter must not be overwritten by
    // the first one's late answer.
    const request = ++requestRef.current
    setBusy(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q, format: 'json', limit: '6', viewbox: VIEWBOX })
      const res = await fetch(`${NOMINATIM}?${params}`, { headers: { 'Accept-Language': 'en' } })
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      const rows = await res.json()
      if (request !== requestRef.current) return
      setResults(rows)
    } catch (e) {
      if (request !== requestRef.current) return
      setError(e.message)
      setResults(null)
    } finally {
      if (request === requestRef.current) setBusy(false)
    }
  }

  const go = (row) => {
    const [s, n, w, e] = row.boundingbox.map(Number)
    const bounds = L.latLngBounds([s, w], [n, e])
    if (bounds.isValid()) map.flyToBounds(bounds, { padding: [20, 20], duration: 1.5, maxZoom: 18 })
    else map.flyTo([Number(row.lat), Number(row.lon)], 16, { duration: 1.5 })
    setResults(null)
  }

  return (
    <div
      ref={boxRef}
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: Z.mapControls,
        width: 280,
        background: '#fff',
        borderRadius: 6,
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        fontSize: 12,
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          search()
        }}
        style={{ display: 'flex', padding: 6, gap: 6 }}
      >
        <input
          type="search"
          value={query}
          placeholder="Search for a place…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setResults(null)
          }}
          style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '4px 6px' }}
        />
        <button type="submit" disabled={busy} style={{ fontSize: 12 }}>
          {busy ? '…' : 'Search'}
        </button>
      </form>

      {error && <div style={{ padding: '0 8px 8px', color: '#c0392b' }}>{error}</div>}

      {results && (
        <div style={{ borderTop: '1px solid #eee', maxHeight: 240, overflowY: 'auto' }}>
          {results.length === 0 && <div style={{ padding: 8, color: '#888' }}>No places found.</div>}
          {results.map((row) => (
            <button
              key={row.place_id}
              type="button"
              onClick={() => go(row)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: 'none',
                padding: '6px 8px',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {row.display_name ?? ''}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '0 8px 4px', color: '#aaa', fontSize: 10 }}>Search by OpenStreetMap Nominatim</div>
    </div>
  )
}
