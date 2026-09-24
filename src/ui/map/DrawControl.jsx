import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'

// RIGHT-CLICK A VERTEX TO DELETE IT. leaflet-draw deletes on left click, which a
// drag that barely moves triggers by accident; this routes the context menu to
// the same handler, so its minimum-points guard still holds. Middle (ghost)
// markers carry no `_index` until dragged into a real vertex, and are skipped.
// Patched once on the prototype, because the markers are rebuilt after every edit.
const proto = L.Edit.PolyVerticesEdit.prototype
if (!proto._sppContextDelete) {
  proto._sppContextDelete = true
  const create = proto._createMarker
  proto._createMarker = function (latlng, index) {
    const marker = create.call(this, latlng, index)
    marker.on('contextmenu', (e) => {
      L.DomEvent.preventDefault(e.originalEvent)
      if (marker._index === undefined) return
      this._onMarkerClick({ target: marker })
    })
    return marker
  }
}

// `initial`: an existing site to edit in place. Each polygon of it becomes its own
// layer (leaflet-draw cannot edit a MultiPolygon as one), vertex editing starts
// straight away, and every drag reports the whole shape back.
export default function DrawControl({ onChange, initial }) {
  const map = useMap()
  const featureGroupRef = useRef(null)

  useEffect(() => {
    const featureGroup = new L.FeatureGroup()
    featureGroupRef.current = featureGroup
    map.addLayer(featureGroup)

    const polygons =
      initial?.type === 'MultiPolygon'
        ? initial.coordinates
        : initial?.type === 'Polygon'
          ? [initial.coordinates]
          : []
    polygons.forEach((rings) => {
      L.geoJSON({ type: 'Polygon', coordinates: rings }).eachLayer((l) => featureGroup.addLayer(l))
    })

    const drawControl = new L.Control.Draw({
      position: 'topright',
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
      if (layers.length === 1) {
        onChange(layers[0].toGeoJSON().geometry)
        return
      }
      onChange({
        type: 'MultiPolygon',
        coordinates: layers.map((l) => l.toGeoJSON().geometry.coordinates),
      })
    }

    function handleCreated(e) {
      featureGroup.clearLayers()
      featureGroup.addLayer(e.layer)
      emitChange()
    }

    // Vertex editing on from the start when there is a shape to edit, so the
    // handles are there without finding the toolbar's edit button first.
    let editHandler = null
    if (polygons.length) {
      map.fitBounds(featureGroup.getBounds(), { padding: [40, 40] })
      editHandler = new L.EditToolbar.Edit(map, { featureGroup })
      editHandler.enable()
    }

    map.on(L.Draw.Event.CREATED, handleCreated)
    map.on(L.Draw.Event.EDITED, emitChange)
    map.on(L.Draw.Event.EDITVERTEX, emitChange)
    map.on(L.Draw.Event.DELETED, emitChange)

    return () => {
      editHandler?.disable()
      map.off(L.Draw.Event.CREATED, handleCreated)
      map.off(L.Draw.Event.EDITED, emitChange)
      map.off(L.Draw.Event.EDITVERTEX, emitChange)
      map.off(L.Draw.Event.DELETED, emitChange)
      map.removeControl(drawControl)
      map.removeLayer(featureGroup)
    }
  }, [map, onChange, initial])

  return null
}
