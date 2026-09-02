import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'

export default function SiteClusterLayer({ projects, projectId, onSelectProject, drawMode, skipNextFlyRef }) {
  const map = useMap()

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup()

    projects
      .filter((p) => p.site_geojson)
      .forEach((p) => {
        const center = L.geoJSON(p.site_geojson).getBounds().getCenter()
        const marker = L.circleMarker(center, {
          radius: 6,
          color: p.id === projectId ? '#1a73e8' : '#c0392b',
          fillColor: p.id === projectId ? '#1a73e8' : '#c0392b',
          fillOpacity: 0.8,
        }).bindTooltip(p.name)

        if (!drawMode) {
          marker.on('click', () => {
            skipNextFlyRef.current = true
            onSelectProject?.(p.id)
          })
        }

        clusterGroup.addLayer(marker)
      })

    map.addLayer(clusterGroup)

    return () => {
      map.removeLayer(clusterGroup)
    }
  }, [projects, projectId, map, drawMode, onSelectProject, skipNextFlyRef])

  return null
}
