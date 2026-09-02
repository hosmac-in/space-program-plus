import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../data/supabase.js'

function extractGeometry(parsed) {
  if (parsed.type === 'Feature') return parsed.geometry
  if (parsed.type === 'FeatureCollection') return parsed.features[0]?.geometry
  return parsed
}

export default function NewProject({
  onCreated,
  isDrawingSite,
  onStartDrawSite,
  onStopDrawSite,
  drawnSiteGeometry,
}) {
  const [name, setName] = useState('')
  const [siteText, setSiteText] = useState('')
  const [contextText, setContextText] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (drawnSiteGeometry) {
      setSiteText(JSON.stringify(drawnSiteGeometry, null, 2))
    }
  }, [drawnSiteGeometry])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    let site, context
    try {
      site = extractGeometry(JSON.parse(siteText))
      context = contextText.trim() === '' ? null : extractGeometry(JSON.parse(contextText))
    } catch {
      setError('Site and context (if provided) must be valid GeoJSON.')
      return
    }

    if (!site?.type || !site?.coordinates) {
      setError('Could not find a geometry in the Site input.')
      return
    }

    // A ref, not the `loading` state: state disables the button on the NEXT
    // render, which a fast second submit beats — and two calls are two projects.
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    const { data, error } = await supabase.rpc('create_project', {
      project_name: name,
      site_geojson: site,
      context_geojson: context,
    })
    submittingRef.current = false
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setName('')
    setSiteText('')
    setContextText('')
    onCreated?.(data)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: 6 }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label>Site (GeoJSON MultiPolygon)</label>
          {isDrawingSite ? (
            <button type="button" onClick={onStopDrawSite}>Done drawing</button>
          ) : (
            <button type="button" onClick={onStartDrawSite}>Draw on map</button>
          )}
        </div>

        {isDrawingSite && (
          <p style={{ color: '#666', margin: '4px 0' }}>
            Use the drawing tools on the map to the left, then click "Done drawing".
          </p>
        )}

        <textarea
          value={siteText}
          onChange={(e) => setSiteText(e.target.value)}
          rows={6}
          style={{ width: '100%', fontFamily: 'monospace' }}
          placeholder='{"type":"MultiPolygon","coordinates":[...]}'
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Context (GeoJSON, optional)</label>
        <textarea
          value={contextText}
          onChange={(e) => setContextText(e.target.value)}
          rows={6}
          style={{ width: '100%', fontFamily: 'monospace' }}
          placeholder='{"type":"Polygon","coordinates":[...]}'
        />
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  )
}
