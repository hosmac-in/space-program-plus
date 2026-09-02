// THE CATALOG — every read of the shared definition tables
// ========================================================
//
// These tables describe what a building can contain. They're global: shared by
// every project and option, edited only by an admin.
//
//   sp_department  id, name, type, is_duplicable, function_id
//   sp_group       id, name, is_duplicable, function_id
//   sp_room        id, name, type, function_id
//   sp_object      id, name, type, area_sqft
//   sp_section     id, name, tree, function_id, building_id  <- see tree.js
//   sp_building    id, name, function_id, sort_order
//   sp_function    id, name, bg_colour, text_colour  <- see functions.js
//   sp_questionnaire  id, building_id, definition, version  <- see questionnaire.js
//
// function_id is nullable everywhere and resolves to the 'default' function
// row when unset — see data/functions.js.
//
// building_id is NOT nullable: every section belongs to exactly one building,
// and that is the only thing that partitions the catalog. Departments and
// groups deliberately have no building — they are placeable in any of them.
//
// There is no phase table here on purpose. A phase is a natural number on a
// department in sp_option.data, not an entity — see data/optionData.js. A
// questionnaire is the opposite and does get one: it is authored, it outlives
// every option made from it, and it points at catalog placements by id.
//
// Four different components used to fetch these independently, which meant each
// held its own snapshot and they drifted apart: place a department in the
// Tree canvas, and the rooms panel beside it was still working from data
// fetched before the placement existed ("This department placement no longer
// exists"). One provider, one copy, one reload — the drift is now structurally
// impossible rather than patched per component.
//
// After any write to sp_section.tree, call reloadSections(); after any write to
// sp_questionnaire.definition, reloadQuestionnaires().

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'

// Column lists are always explicit. A shared default was how `type` ended up
// being requested from sp_group, which has no such column.
const TABLES = {
  departments: { table: 'sp_department', columns: 'id, name, type, is_duplicable, function_id', order: 'name' },
  groups: { table: 'sp_group', columns: 'id, name, is_duplicable, function_id', order: 'name' },
  rooms: { table: 'sp_room', columns: 'id, name, type, function_id', order: 'name' },
  objects: { table: 'sp_object', columns: 'id, name, type, area_sqft', order: 'name' },
  sections: { table: 'sp_section', columns: 'id, name, tree, function_id, building_id', order: 'name' },
  functions: { table: 'sp_function', columns: 'id, name, bg_colour, text_colour', order: 'name' },
  // Ordered by sort_order, not name: buildings have a conventional order that
  // is not alphabetical (Hospital before Laboratory).
  buildings: { table: 'sp_building', columns: 'id, name, function_id, sort_order', order: 'sort_order' },
  // One row per building. `version` is fetched because every write is
  // conditional on it — see data/questionnaire.js.
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
}

const CatalogContext = createContext({
  ...EMPTY,
  error: null,
  loaded: false,
  reloadSections: async () => {},
  reloadQuestionnaires: async () => {},
  reloadAll: async () => {},
})

export function CatalogProvider({ children }) {
  const [data, setData] = useState(EMPTY)
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  // Reloads are not instant and not ordered. Two of them in flight — a tree
  // edit's refresh overtaking an earlier one — could land oldest last and leave
  // memory holding a catalog that is behind the database. The next edit would
  // then be computed from it and silently undo something.
  //
  // One counter across both loaders: a response is ignored unless it belongs to
  // the most recent request.
  const requestRef = useRef(0)

  const reloadAll = useCallback(async () => {
    const mine = ++requestRef.current
    try {
      const keys = Object.keys(TABLES)
      const results = await Promise.all(keys.map(fetchTable))
      if (mine !== requestRef.current) return
      setData(Object.fromEntries(keys.map((k, i) => [k, results[i]])))
      setError(null)
    } catch (err) {
      if (mine === requestRef.current) setError(err.message)
    } finally {
      if (mine === requestRef.current) setLoaded(true)
    }
  }, [])

  // The tree changes constantly while the definition tables essentially
  // never do, so tree edits refetch only sp_section.
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

  // Same argument as reloadSections, one table along: authoring a questionnaire
  // is a run of small edits and none of them touches anything else.
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
      value={{ ...data, error, loaded, reloadSections, reloadQuestionnaires, reloadAll }}
    >
      {children}
    </CatalogContext.Provider>
  )
}

export function useCatalog() {
  return useContext(CatalogContext)
}
