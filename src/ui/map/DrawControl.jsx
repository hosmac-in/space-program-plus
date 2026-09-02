import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'

export default function DrawControl({ onChange }) {
  const map = useMap()
  const featureGroupRef = useRef(null)

  useEffect(() => {
    const featureGroup = new L.FeatureGroup()
    featureGroupRef.current = featureGroup
    map.addLayer(featureGroup)

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: true,
        marker: false,
        circle: false,
        circlemarker: false,
        polyline: false,
        rectangle: true,
      },
      edit: {
        featureGroup,
      },
    })
    map.addControl(drawControl)

    function emitChange() {
      const layers = featureGroup.getLayers()
      if (layers.length === 0) {
        onChange(null)
        return
      }
      onChange(layers[layers.length - 1].toGeoJSON().geometry)
    }

    function handleCreated(e) {
      featureGroup.clearLayers()
      featureGroup.addLayer(e.layer)
      emitChange()
    }

    map.on(L.Draw.Event.CREATED, handleCreated)
    map.on(L.Draw.Event.EDITED, emitChange)
    map.on(L.Draw.Event.DELETED, emitChange)

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated)
      map.off(L.Draw.Event.EDITED, emitChange)
      map.off(L.Draw.Event.DELETED, emitChange)
      map.removeControl(drawControl)
      map.removeLayer(featureGroup)
    }
  }, [map, onChange])

  return null
}
