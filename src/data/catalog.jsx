// THE CATALOG — every read of the shared definition tables
// ========================================================
//
// These tables describe what a building can contain. They are global: shared by
// every project and option, edited only by an admin.
//
//   sp_department     id, name, type, is_duplicable, function_id
//   sp_group          id, name, is_duplicable, function_id
//   sp_room           id, name, type, function_id
//   sp_object         id, name, type, area_sqft
//   sp_section        id, name, tree, function_id, building_id, version  <- tree.js
//   sp_building       id, name, function_id, sort_order,
//                     built_area_grossing_factor, floor_area_grossing_factor  <- factors.js
//   sp_function       id, name, bg_colour, text_colour  <- functions.js
//   sp_questionnaire  id, building_id, definition, version  <- questionnaire.js
//
// `schedules` is served from here too, but there is NO sp_schedule table yet —
// it is a constant in data/schedules.js, supplied through this provider rather
// than imported by the panels so that creating the table is one line here.
//
// function_id is nullable everywhere and resolves to the 'default' function row
// when unset. building_id is NOT nullable: a section belongs to exactly one
// building, and that is the only thing partitioning the catalog. Departments and
// groups have no building — they are placeable in any of them.
//
// There is no phase table on purpose: a phase is a natural number on a
// department in sp_option.data, not an entity. A questionnaire is the opposite
// and does get a table — it is authored, outlives every option made from it, and
// points at catalog placements by id.
//
// ONE PROVIDER, ONE COPY. Four components used to fetch these independently and
// drifted apart: placing a department on the Tree canvas left the rooms panel
// beside it working from data fetched before the placement existed. After a
// write, reload the one table — reloadSections(), reloadBuildings(),
// reloadQuestionnaires().

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { PLACEHOLDER_SCHEDULES } from './schedules.js'

// Column lists are always explicit. A shared default was how `type` ended up
// being requested from sp_group, which has no such column.
const TABLES = {
  departments: { table: 'sp_department', columns: 'id, name, type, is_duplicable, function_id', order: 'name' },
  groups: { table: 'sp_group', columns: 'id, name, is_duplicable, function_id', order: 'name' },
  rooms: { table: 'sp_room', columns: 'id, name, type, function_id', order: 'name' },
  objects: { table: 'sp_object', columns: 'id, name, type, area_sqft', order: 'name' },
  // `version` is fetched because every tree write is conditional on it.
  sections: {
    table: 'sp_section',
    columns: 'id, name, tree, function_id, building_id, version',
    order: 'name',
  },
  functions: { table: 'sp_function', columns: 'id, name, bg_colour, text_colour', order: 'name' },
  // By sort_order, not name: buildings have a conventional order that is not
  // alphabetical. The two grossing factors are the only definition columns this
  // app writes to — see data/buildings.js.
  buildings: {
    table: 'sp_building',
    columns: 'id, name, function_id, sort_order, built_area_grossing_factor, floor_area_grossing_factor',
    order: 'sort_order',
  },
  // One row per building; `version` for the same reason as sections.
  questionnaires: {
    table: 'sp_questionnaire',
    columns: 'id, building_id, definition, version',
    order: 'building_id',
  },
}

async function fetchTable(key) {
  const { table, columns, order } = TABLES[key]
  const { data, error } = await supabase.from(table).select(columns).order(order, { ascending: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  return data ?? []
}

const EMPTY = {
  departments: [],
  groups: [],
  rooms: [],
  objects: [],
  sections: [],
  functions: [],
  buildings: [],
  questionnaires: [],
  // Not fetched — no sp_schedule table yet. It sits in EMPTY so every setData
  // below carries it. To move it to the database, add it to TABLES and delete
  // this line.
  schedules: PLACEHOLDER_SCHEDULES,
}

const CatalogContext = createContext({
  ...EMPTY,
  error: null,
  loaded: false,
  reloadSections: async () => {},
  reloadBuildings: async () => {},
  reloadQuestionnaires: async () => {},
  reloadAll: async () => {},
})

export function CatalogProvider({ children }) {
  const [data, setData] = useState(EMPTY)
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  // Reloads are not ordered: two in flight can land oldest last, leaving memory
  // behind the database — and the next edit would be computed from it and
  // silently undo something. One counter across every loader, so a response is
  // ignored unless it belongs to the most recent request.
  const requestRef = useRef(0)

  const reloadAll = useCallback(async () => {
    const mine = ++requestRef.current
    try {
      const keys = Object.keys(TABLES)
      const results = await Promise.all(keys.map(fetchTable))
      if (mine !== requestRef.current) return
      // Built on EMPTY, so anything served without being fetched — schedules —
      // survives a reload instead of being dropped by the key list.
      setData({ ...EMPTY, ...Object.fromEntries(keys.map((k, i) => [k, results[i]])) })
      setError(null)
    } catch (err) {
      if (mine === requestRef.current) setError(err.message)
    } finally {
      if (mine === requestRef.current) setLoaded(true)
    }
  }, [])

  // The tree changes constantly while the definition tables essentially never
  // do, so these three refetch one table rather than the whole catalog.
  const reloadSections = useCallback(async () => {
    const mine = ++requestRef.current
    try {
      const sections = await fetchTable('sections')
      if (mine !== requestRef.current) return
      setData((prev) => ({ ...prev, sections }))
      setError(null)
    } catch (err) {
      if (mine === requestRef.current) setError(err.message)
    }
  }, [])

  const reloadBuildings = useCallback(async () => {
    const mine = ++requestRef.current
    try {
      const buildings = await fetchTable('buildings')
      if (mine !== requestRef.current) return
      setData((prev) => ({ ...prev, buildings }))
      setError(null)
    } catch (err) {
      if (mine === requestRef.current) setError(err.message)
    }
  }, [])

  const reloadQuestionnaires = useCallback(async () => {
    const mine = ++requestRef.current
    try {
      const questionnaires = await fetchTable('questionnaires')
      if (mine !== requestRef.current) return
      setData((prev) => ({ ...prev, questionnaires }))
      setError(null)
    } catch (err) {
      if (mine === requestRef.current) setError(err.message)
    }
  }, [])

  useEffect(() => {
    reloadAll()
  }, [reloadAll])

  return (
    <CatalogContext.Provider
      value={{ ...data, error, loaded, reloadSections, reloadBuildings, reloadQuestionnaires, reloadAll }}
    >
      {children}
    </CatalogContext.Provider>
  )
}

export function useCatalog() {
  return useContext(CatalogContext)
}
