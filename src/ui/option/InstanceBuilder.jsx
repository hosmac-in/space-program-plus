// The option editor: holds the currently-open option in memory, renders the
// selected department's rooms and objects, and saves to sp_option.
// The wire format and every id-to-name resolution live in data/optionData.js.
// The department detail pane is DepartmentBlock.jsx.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../primitives/Toast.jsx'
import { UNDO_DEPTH } from '../undo.js'
import { supabase } from '../../data/supabase.js'
import { useCatalog } from '../../data/catalog.jsx'
import {
  catalogObjectCount,
  catalogRoomAreaSqft,
  catalogRoomsForNode,
  resolveNodePlacement,
} from '../../data/tree.js'
import { withBuildingFactor } from '../../data/factors.js'
import {
  buildInstanceData,
  DEPARTMENT_FACTORS,
  DEFAULT_PHASE_COUNT,
  DEFAULT_ROOM_COUNT,
  findCirculationDef,
  loadInstanceData,
  SCHEMA_VERSION,
} from '../../data/optionData.js'
import DepartmentBlock from './DepartmentBlock.jsx'
import OptionOutline from './OptionOutline.jsx'
import OptionStats from './OptionStats.jsx'
import { PanelNote } from '../panel/panelParts.jsx'
import { SUBTLE_RULE } from '../panel/panelLayout.js'
import { Z } from '../primitives/zIndex.js'
import SaveDataButton from './SaveDataButton.jsx'

// A new or unloaded option: no departments, and no sections or buildings
// either — every building and section is offered on the canvas, none is in the
// option until added. One phase, which is what an unstaged option has.
const EMPTY_OPTION = {
  departments: [],
  sectionIds: [],
  buildingIds: [],
  // Per-building factor overrides, keyed by building id — see data/factors.js.
  buildingFactors: {},
  phaseCount: DEFAULT_PHASE_COUNT,
}

// Structural edits — a building, section or department added or removed, or the
// option's phase count changed — write themselves; rooms, objects and counts
// wait for Save Data. See mutateOption.
const PERSIST = { persist: true }

export default function InstanceBuilder({
  onSaved,
  loadOptionId,
  // What the canvas last selected: a department, a group, a section, or null.
  // It decides which of this panel's four faces is shown.
  selection,
  onSelectDepartment,
  highlightedDepartmentId,
  selectedDeptInstanceId,
  // Which phase strip of that placement was clicked. Together with the node id
  // it names exactly one entry — see shownDept.
  selectedPhase,
  onExposeActions,
}) {
  const {
    departments: departmentDefs,
    rooms: roomDefs,
    objects: objectDefs,
    groups: groupDefs,
    sections,
    functions,
    schedules,
    buildings: buildingDefs,
    loaded: catalogLoaded,
    error: catalogError,
  } = useCatalog()

  // ONE atomic history value, not three cooperating states. It was
  // departments/past/future, with the past pushed from INSIDE the setDepartments
  // updater — and React may call an updater twice (StrictMode always does), so
  // every edit pushed two identical entries and the first undo did nothing.
  //
  // `present` holds the whole option, sections and buildings included, so adding
  // or removing either is one undo step. Neither can be derived from the
  // departments: an option may hold an empty section, and a building with no
  // sections.
  const [history, setHistory] = useState({ past: [], present: EMPTY_OPTION, future: [] })
  const { departments, sectionIds, buildingIds, buildingFactors, phaseCount } = history.present
  const [optionName, setOptionName] = useState('')
  const [loadError, setLoadError] = useState(null)
  const onToast = useToast()
  // The current option and name, kept in refs as well as state: a mutation
  // needs the value it just produced, before the re-render.
  const shownDeptRef = useRef(null)
  // Which run of edits the last mutation belonged to — see `coalesce`.
  const lastCoalesceRef = useRef(null)
  const historyRef = useRef(history)
  const presentRef = useRef(history.present)
  const optionNameRef = useRef(optionName)
  // Which option is actually in memory. Until it matches loadOptionId, memory
  // holds an EMPTY option and writing it would erase the real row — so nothing
  // may be saved until they agree. A ref: nothing renders from it, and a write
  // reads it at call time.
  const loadedIdRef = useRef(null)
  const loadOptionIdRef = useRef(loadOptionId)
  loadOptionIdRef.current = loadOptionId
  const lastSavedNameRef = useRef('')
  // The focused department, and its editable state as of coming into focus or
  // last being saved. State, not a ref: Save Data is derived from it.
  const [focus, setFocus] = useState({ id: null, draft: 'null' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  // The row version this option was loaded at. Null means no option is loaded,
  // and therefore that nothing may be written — see writeOption.
  const versionRef = useRef(null)

  historyRef.current = history
  presentRef.current = history.present
  optionNameRef.current = optionName

  // What Save Data tracks: everything editable on the ONE department on the
  // panel, against how it looked when it came into focus. Not against the
  // database and not across the option — you cannot leave a department with
  // unsaved edits, so "changed since I opened this" is the whole question, and
  // answering it locally keeps the button still while structural writes land.
  //
  //   >>> ANY new in-memory field on a department must be added here, or its
  //   >>> edits leave Save Data grey and are lost on navigate.
  function draftOf(dept) {
    return JSON.stringify({
      rooms: dept?.rooms ?? [],
      // Every factor override, normalised to null when absent so "inherits"
      // compares equal to itself however it got there.
      factors: DEPARTMENT_FACTORS.map((f) => dept?.[f.key] ?? null),
    })
  }

  // Every edit to the option goes through here, which is what puts all of them
  // on the undo stack.
  //
  // `persist` says whether the edit writes itself. Structural edits do — adding
  // a section or a department is a deliberate act, done when you let go. Room
  // and object edits are the fiddly ones and wait for Save Data. A write sends
  // the WHOLE row, so a structural edit carries any pending room edits with it
  // and Save Data goes grey: deliberate, since jsonb has no partial write.
  //
  // `coalesce` folds a run of edits into one undo step. A count reports every
  // keystroke, so "120" would otherwise be three steps; consecutive edits with
  // the same key replace the present instead of pushing a past entry.
  //
  // The next value is computed HERE, not inside the setState updater: the
  // updater must stay pure, and persisting needs the value now rather than next
  // render. `presentRef` advances with it so two actions in one tick compose.
  function mutateOption(updater, { persist = false, coalesce = null } = {}) {
    const next = updater(presentRef.current)
    presentRef.current = next
    const merge = coalesce != null && coalesce === lastCoalesceRef.current
    lastCoalesceRef.current = coalesce

    setHistory((h) => ({
      past: merge ? h.past : [...h.past.slice(-(UNDO_DEPTH - 1)), h.present],
      present: next,
      future: [],
    }))
    if (persist) persistOption(next, optionNameRef.current)
  }

  function mutateDepartments(updater, opts) {
    mutateOption((o) => ({ ...o, departments: updater(o.departments) }), opts)
  }

  // Loading an option starts a fresh history — you can't undo past the point
  // where the option was opened.
  function resetOption(next) {
    presentRef.current = next
    setHistory({ past: [], present: next, future: [] })
  }

  // Undo and redo ALWAYS write: the state you land on is the state that should
  // be stored, or the database holds a version nobody chose — not the edit you
  // just undid, and not what is on screen. On success the focused department's
  // baseline is re-taken, which leaves Save Data grey.
  //
  // A refused write does not re-take it, so the button lights up and offers the
  // state on screen for saving — which is exactly what it is: unsaved.
  const step = useCallback((pick) => {
    const h = historyRef.current
    const next = pick(h)
    if (!next) return

    presentRef.current = next.present
    setHistory(next)

    const focusedId = shownDeptRef.current?.instanceId ?? null
    const landedOn = next.present.departments.find((d) => d.instanceId === focusedId) ?? null
    persistOption(next.present, optionNameRef.current).then((ok) => {
      if (ok) setFocus({ id: landedOn?.instanceId ?? null, draft: draftOf(landedOn) })
    })
  }, [])

  const handleUndo = useCallback(() => {
    step((h) =>
      h.past.length === 0
        ? null
        : {
            past: h.past.slice(0, -1),
            present: h.past[h.past.length - 1],
            future: [...h.future, h.present],
          }
    )
  }, [step])

  const handleRedo = useCallback(() => {
    step((h) =>
      h.future.length === 0
        ? null
        : {
            past: [...h.past, h.present],
            present: h.future[h.future.length - 1],
            future: h.future.slice(0, -1),
          }
    )
  }, [step])

  // THE ONLY WRITE TO sp_option, called by a structural edit or by Save Data,
  // each handing it the exact state to write. NEVER by a timer: this overwrites
  // the whole row, and every automatic trigger the old autosave had turned out
  // to be a way of writing the wrong state over the right one.
  //
  // Two guards survive from that: it refuses any option that is not the one in
  // memory, and the update is conditional on the version it was loaded at.
  const writeOnce = useCallback(async (present, name) => {
    const loadedId = loadedIdRef.current
    if (!loadedId || loadedId !== loadOptionIdRef.current) return false
    const at = versionRef.current
    if (at == null) return false

    setSaving(true)
    setSaveError(null)

    const { data: updated, error } = await supabase
      .from('sp_option')
      .update({
        option_name: name,
        schema_version: SCHEMA_VERSION,
        data: buildInstanceData(
          present.departments,
          present.sectionIds,
          present.buildingIds,
          present.phaseCount,
          present.buildingFactors
        ),
        version: at + 1,
      })
      .eq('id', loadedId)
      .eq('version', at)
      .select('id, version')

    setSaving(false)

    if (error) {
      setSaveError(error.message)
      return false
    }
    // Zero rows matched: this option was written somewhere else since we opened
    // it. Refuse rather than overwrite, and say so.
    if (!updated || updated.length === 0) {
      setSaveError('this option was changed somewhere else — reload before saving again')
      return false
    }

    versionRef.current = updated[0].version
    if (name !== lastSavedNameRef.current) {
      lastSavedNameRef.current = name
      onSaved?.()
    }
    return true
  }, [])

  // Writes run one at a time. Each is conditional on a version that each
  // success bumps, so two started together carry the SAME version and the second
  // is refused — which is what rapid undo/redo did. Chaining them means each
  // waits for the previous to land and then reads `versionRef` fresh.
  const chainRef = useRef(Promise.resolve(true))

  const persistOption = useCallback((present, name) => {
    const next = chainRef.current.then(
      () => writeOnce(present, name),
      () => writeOnce(present, name)
    )
    // The chain itself must never reject, or every later write is skipped.
    chainRef.current = next.catch(() => false)
    return next
  }, [writeOnce])

  // What Save Data calls: write the whole option and, on success, take the
  // focused department as the new baseline so the button goes quiet.
  const saveData = useCallback(async () => {
    const dept = shownDeptRef.current
    const sent = draftOf(dept)
    const ok = await persistOption(presentRef.current, optionNameRef.current)
    if (ok && dept) setFocus({ id: dept.instanceId, draft: sent })
    return ok
  }, [persistOption])

  // Matched on the placement AND the phase, since one placement holds an entry
  // per phase and they are different departments to edit. The fallbacks widen a
  // step at a time — this placement in this phase, this placement at all, then
  // the definition — so a selection that arrived without a phase still lands
  // somewhere rather than emptying the panel.
  //
  // Gated on the selection KIND, not on there merely being a highlight, which
  // outlives the selection: the department face has to be asked for by name or
  // it shows through on the container and totals faces.
  const shownDept =
    selection?.kind === 'department'
      ? departments.find(
          (d) => d.treeNodeId && d.treeNodeId === selectedDeptInstanceId && d.phase === selectedPhase
        ) ??
        departments.find((d) => d.treeNodeId && d.treeNodeId === selectedDeptInstanceId) ??
        departments.find((d) => d.defId === highlightedDepartmentId)
      : null

  shownDeptRef.current = shownDept

  // Coming into focus takes a fresh baseline: from here, "changed" means
  // changed since you opened this department.
  useEffect(() => {
    const id = shownDept?.instanceId ?? null
    setFocus((f) => (f.id === id ? f : { id, draft: draftOf(shownDept) }))
  }, [shownDept?.instanceId])

  // False while the two disagree about which department is in focus — that's
  // the render on which focus is being re-taken, and nothing is unsaved yet.
  const dirty = !!shownDept && focus.id === shownDept.instanceId && draftOf(shownDept) !== focus.draft

  // Waits for the catalog and depends on NOTHING else that can change while you
  // work. Listing the definition tables here — it needs them to resolve names —
  // made any catalog reload re-run the load, which calls resetOption and throws
  // away every edit since the option was opened. `loaded` flips false→true once,
  // so this runs once per option with the definitions already in hand.
  useEffect(() => {
    if (!loadOptionId || !catalogLoaded) return undefined
    // Switch options quickly and the first response can arrive after the second.
    let cancelled = false
    setLoadError(null)
    // Nothing in memory belongs to this option yet, so nothing may be written
    // to it until the row comes back.
    loadedIdRef.current = null
    setSaveError(null)
    versionRef.current = null

    supabase
      .from('sp_option')
      .select('option_name, data, version')
      .eq('id', loadOptionId)
      .single()
      .then(({ data: row, error }) => {
        if (cancelled) return
        if (error) {
          setLoadError(
            error.message.includes('version')
              ? `${error.message} — run sql/option_version.sql in the Supabase SQL editor.`
              : error.message
          )
          return
        }
        const loaded = loadInstanceData(row.data, departmentDefs, roomDefs, objectDefs)
        const dropped = (row.data?.departments ?? []).length - loaded.departments.length
        if (dropped > 0) {
          onToast?.(
            `${dropped} department${dropped === 1 ? '' : 's'} couldn't be loaded: they aren't anchored to a place in the tree. Re-add them from the map.`,
            'error'
          )
        }
        // An option saved before sections were stored opens with the ones its
        // departments sit in, which is what it displayed. Buildings derive from
        // the SECTIONS, not the departments, so an option holding an empty
        // section still shows the building it sits in.
        const openSectionIds = loaded.sectionIds ?? sectionIdsOf(loaded.departments)
        const present = {
          departments: loaded.departments,
          sectionIds: openSectionIds,
          buildingIds: loaded.buildingIds ?? buildingIdsOf(openSectionIds),
          buildingFactors: loaded.buildingFactors ?? {},
          phaseCount: loaded.phaseCount,
        }
        resetOption(present)
        setOptionName(row.option_name ?? '')
        lastSavedNameRef.current = row.option_name ?? ''
        versionRef.current = row.version
        loadedIdRef.current = loadOptionId
        optionNameRef.current = row.option_name ?? ''
      })

    return () => {
      cancelled = true
    }
  }, [loadOptionId, catalogLoaded])

  // A phase entry starts as a COPY of the closest lower phase of the same
  // placement, as a base to edit. Nothing is shared: every room and object gets
  // a fresh instanceId, or the two phases would edit each other through the ids
  // they had in common. With nothing to copy it starts empty.
  function seedSourceFor(depts, treeNodeId, phase) {
    return depts.filter((d) => d.treeNodeId === treeNodeId && d.phase < phase).sort((a, b) => b.phase - a.phase)[0]
  }

  function seedRoomsFrom(depts, treeNodeId, phase) {
    const source = seedSourceFor(depts, treeNodeId, phase)
    if (!source) return []
    return source.rooms.map((r) => ({
      ...r,
      instanceId: crypto.randomUUID(),
      objects: r.objects.map((o) => ({ ...o, instanceId: crypto.randomUUID() })),
    }))
  }

  // Entries arrive anchored to one tree node AND one phase, so there is nothing
  // to disambiguate. The same definition twice is fine if the placements differ,
  // and the same placement twice if the phases do; the same placement in the
  // same phase is not.
  function addDepartments(entries) {
    mutateOption((o) => {
      const prev = o.departments
      const keyOf = (treeNodeId, phase) => `${treeNodeId}|${phase}`
      const existing = new Set(prev.filter((d) => d.treeNodeId).map((d) => keyOf(d.treeNodeId, d.phase)))
      const fresh = entries.filter(({ treeNodeId, phase }) => {
        if (!treeNodeId) return false
        const key = keyOf(treeNodeId, phase ?? DEFAULT_PHASE_COUNT)
        if (existing.has(key)) return false
        // Added to the set as we go: one click cannot ask for the same strip
        // twice, but nothing stops a caller passing a list that does.
        existing.add(key)
        return true
      })
      const placements = fresh.map(({ treeNodeId }) =>
        resolveNodePlacement(sections, treeNodeId, groupDefs, buildingDefs)
      )
      // Adding a department brings the whole chain above it. A guard rather than
      // a path — the canvas only offers a + where the section is already in —
      // but the invariant is what the rest of the file assumes: a department
      // under an absent section would simply not be drawn.
      const addedSections = placements.map((p) => p?.sectionId).filter(Boolean)
      const addedBuildings = placements.map((p) => p?.buildingId).filter(Boolean)
      const departments = [
        ...prev,
        ...fresh.map(({ def, treeNodeId, phase }, i) => {
          const placement = placements[i]
          return {
            instanceId: crypto.randomUUID(),
            defId: def.id,
            name: def.name,
            type: def.type,
            treeNodeId,
            phase: phase ?? DEFAULT_PHASE_COUNT,
            fallbackSectionName: placement?.sectionName ?? null,
            fallbackGroupName: placement?.groupName ?? null,
            // Seeded from `prev`, not from the array being built: two strips
            // added in one call are siblings, not sources for each other.
            rooms: seedRoomsFrom(prev, treeNodeId, phase ?? DEFAULT_PHASE_COUNT),
            // The factor OVERRIDES, from the same source the rooms are: a phase
            // seeded from an earlier one starts where that one stood. Null,
            // never 1 — an entry that inherits must keep inheriting, and seeding
            // a 1 would pin every new phase away from what the catalog says.
            ...DEPARTMENT_FACTORS.reduce((out, f) => {
              const from = seedSourceFor(prev, treeNodeId, phase ?? DEFAULT_PHASE_COUNT)?.[f.key]
              return { ...out, [f.key]: Number.isFinite(from) && from > 0 ? from : null }
            }, {}),
          }
        }),
      ]
      return {
        ...o,
        departments,
        sectionIds: [...new Set([...o.sectionIds, ...addedSections])],
        buildingIds: [...new Set([...o.buildingIds, ...addedBuildings])],
      }
    }, PERSIST)
  }

  function removeDepartment(instanceId) {
    mutateDepartments((prev) => prev.filter((d) => d.instanceId !== instanceId), PERSIST)
  }

  // Which sections the given departments sit in, resolved live from the tree.
  function sectionIdsOf(depts) {
    const ids = []
    depts.forEach((d) => {
      const id = resolveNodePlacement(sections, d.treeNodeId, groupDefs)?.sectionId
      if (id && !ids.includes(id)) ids.push(id)
    })
    return ids
  }

  // Which buildings the given sections belong to. Straight off the section rows
  // — a section belongs to exactly one building, so there is nothing to resolve.
  function buildingIdsOf(sectionIdList) {
    const ids = []
    sectionIdList.forEach((sectionId) => {
      const id = sections.find((s) => s.id === sectionId)?.building_id
      if (id && !ids.includes(id)) ids.push(id)
    })
    return ids
  }

  // A section is added on its own and filled afterwards — including a section
  // the catalog leaves empty, which is why this doesn't touch departments. Its
  // building comes with it for the same reason a department brings its section.
  function addSection(sectionId) {
    mutateOption((o) => {
      if (o.sectionIds.includes(sectionId)) return o
      const buildingId = sections.find((s) => s.id === sectionId)?.building_id
      return {
        ...o,
        sectionIds: [...o.sectionIds, sectionId],
        buildingIds:
          buildingId && !o.buildingIds.includes(buildingId) ? [...o.buildingIds, buildingId] : o.buildingIds,
      }
    }, PERSIST)
  }

  // Removing a section takes everything in it with it — the departments under
  // it have nowhere left to be shown. The canvas confirms first when there is
  // anything to lose.
  //
  // The building stays. An option holding a building with no sections yet is
  // the empty shell you fill in as you go, exactly as an empty section is one
  // level down, so emptying a building must not make it disappear from under
  // you. Removing it is its own deliberate act.
  function removeSection(sectionId) {
    mutateOption(
      (o) => ({
        ...o,
        sectionIds: o.sectionIds.filter((id) => id !== sectionId),
        departments: o.departments.filter(
          (d) => resolveNodePlacement(sections, d.treeNodeId, groupDefs)?.sectionId !== sectionId
        ),
      }),
      PERSIST
    )
  }

  // What this option is made of, at the two levels that aren't chosen on the
  // canvas: which buildings it contains, and how many phases it is built in.
  //
  // Both are set together in one dialog with one Save, so this applies them as
  // ONE mutation: one undo step, one write, no half-applied state in between —
  // and one action for App's guard, which holds only one.
  //
  // Both cascade downwards, since nothing below a level that has gone has
  // anywhere left to be shown: a dropped building takes its sections and their
  // departments, a dropped phase takes every entry staged in it. The dialog
  // confirms first.
  function setOptionSettings({ buildingIds: nextBuildingIds, phaseCount: nextPhaseCount }) {
    const kept = new Set(nextBuildingIds)
    const doomedSectionIds = new Set(sections.filter((s) => !kept.has(s.building_id)).map((s) => s.id))
    mutateOption(
      (o) => ({
        phaseCount: nextPhaseCount,
        buildingIds: [...nextBuildingIds],
        sectionIds: o.sectionIds.filter((id) => !doomedSectionIds.has(id)),
        departments: o.departments.filter((d) => {
          if (d.phase > nextPhaseCount) return false
          const at = resolveNodePlacement(sections, d.treeNodeId, groupDefs)
          return !at || !doomedSectionIds.has(at.sectionId)
        }),
      }),
      PERSIST
    )
  }

  // The catalog room's objects, with their counts, as an option's own. Copied
  // rather than referenced: fresh instanceIds, and from here the list belongs to
  // this option — adding an object to the catalog afterwards does not appear in
  // an option that already has this room.
  //
  // A def that has since been deleted is dropped rather than carried as a
  // nameless row. Circulation is never seeded: it is derived from the others,
  // and one placed explicitly would be counted against itself.
  function seedObjectsFrom(catalogRoom) {
    const circulationDef = findCirculationDef(objectDefs)
    return (catalogRoom?.objects ?? []).flatMap((node) => {
      const def = objectDefs.find((o) => o.id === node.object_def_id)
      if (!def || def.id === circulationDef?.id) return []
      return [
        {
          instanceId: crypto.randomUUID(),
          defId: def.id,
          name: def.name,
          type: def.type,
          areaSqft: def.area_sqft ?? null,
          count: catalogObjectCount(node),
        },
      ]
    })
  }

  function addRoom(deptInstanceId, def) {
    mutateDepartments((prev) =>
      prev.map((d) => {
        if (d.instanceId !== deptInstanceId) return d
        if (d.rooms.some((r) => r.defId === def.id)) return d

        // Anchor the room to the catalog node it came from, so its object list
        // stays isolated from other rooms sharing the definition. The picker
        // lists definitions, so an ambiguous case takes the first and says so
        // rather than blocking.
        const matches = (catalogRoomsForNode(sections, d.treeNodeId) ?? []).filter((r) => r.room_def_id === def.id)
        if (matches.length > 1) {
          onToast?.(`${def.name} appears more than once in this department's catalog — using the first one.`)
        }

        return {
          ...d,
          rooms: [
            ...d.rooms,
            {
              instanceId: crypto.randomUUID(),
              defId: def.id,
              name: def.name,
              type: def.type,
              treeRoomNodeId: matches[0]?.instance_id ?? null,
              // NOT seeded: how many of a room there are is the size of this
              // program, and the catalog states none. See tree.js.
              count: DEFAULT_ROOM_COUNT,
              // Seeded from the catalog placement, and 0 when it states none.
              // COPIED, not inherited: from here the figure belongs to this
              // option, and editing the catalog never moves it. See tree.js.
              areaSqft: catalogRoomAreaSqft(matches[0]),
              // This option's own note, separate from the catalog's. Empty, not
              // seeded: the catalog's note is shown beside it, not copied.
              notes: '',
              objects: seedObjectsFrom(matches[0]),
            },
          ],
        }
      })
    )
  }

  // A null updater removes the room.
  function updateRoom(deptInstanceId, roomInstanceId, updater, opts) {
    mutateDepartments((prev) =>
      prev.map((d) => {
        if (d.instanceId !== deptInstanceId) return d
        if (updater === null) return { ...d, rooms: d.rooms.filter((r) => r.instanceId !== roomInstanceId) }
        return { ...d, rooms: d.rooms.map((r) => (r.instanceId === roomInstanceId ? updater(r) : r)) }
      }),
      opts
    )
  }

  // A building's factor override belongs to the OPTION, not a department, so
  // Save Data — which watches only the focused department — would never notice
  // it. It persists on commit instead: mutateOption while typing so the totals
  // answer, and a second call with PERSIST when the field is left.
  function setBuildingFactor(buildingId, factor, value, { persist = false } = {}) {
    mutateOption(
      (o) => ({
        ...o,
        buildingFactors: {
          ...o.buildingFactors,
          [buildingId]: withBuildingFactor(o.buildingFactors?.[buildingId], factor, value),
        },
      }),
      { persist, coalesce: persist ? null : `${factor.key}:${buildingId}` }
    )
  }

  // The department entry itself rather than one of its rooms. No `persist`: a
  // figure like a count, not a structural act, so it waits for Save Data.
  function updateDepartment(deptInstanceId, updater, opts) {
    mutateDepartments((prev) => prev.map((d) => (d.instanceId === deptInstanceId ? updater(d) : d)), opts)
  }

  // Lets the Project tab add and remove buildings, sections and departments
  // without App having to own this component's state.
  useEffect(() => {
    onExposeActions?.({
      departments,
      sectionIds,
      buildingIds,
      buildingFactors,
      phaseCount,
      departmentDefs,
      optionName,
      addDepartments,
      removeDepartment,
      addSection,
      removeSection,
      setOptionSettings,
      undo: handleUndo,
      redo: handleRedo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      dirty,
      saving,
      saveError,
      save: saveData,
      // Which department the unsaved edits belong to, for the prompt that
      // appears when something would take it off the panel.
      editingName: shownDept?.name ?? null,
    })
  }, [
    departments,
    sectionIds,
    buildingIds,
    buildingFactors,
    phaseCount,
    departmentDefs,
    optionName,
    history.past.length,
    history.future.length,
    dirty,
    saving,
    saveError,
    shownDept,
  ])

  const isContainer =
    selection?.kind === 'group' || selection?.kind === 'section' || selection?.kind === 'building'

  // Resolved live from the tree, with the option's frozen name as the fallback
  // for a placement the catalog no longer has.
  const shownSectionName = shownDept
    ? resolveNodePlacement(sections, shownDept.treeNodeId, groupDefs, buildingDefs)?.sectionName ??
      shownDept.fallbackSectionName
    : null

  const error = catalogError || loadError

  return (
    // No top margin: the panel starts at the top edge of side.
    <div>
      {/* Where you are, and — when a department is open — Save Data at the right
          of the same line, directly above the card's top-right corner. Save Data
          belongs to the department only; everything else writes for itself.

          The line names the SECTION, not the option: the option is already named
          on the canvas and in the chip you opened it from, while the section is
          what moves as you click around. Deliberately smaller than the
          department name beneath it — this is where you are, that is what you
          are editing. Falls back to the option's name on the container faces,
          which have no one section. */}
      {(isContainer || shownDept) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minWidth: 0,
            // STICKY, so Save Data is reachable from anywhere in a long
            // department. It used to scroll away with the heading, and a
            // department of twenty rooms put the only way to save what you were
            // typing off the top of the panel.
            position: 'sticky',
            top: 0,
            zIndex: Z.header,
            // The negative margin pulls this out of the 16px inset App's
            // wrapper puts on the panel, and the padding puts it back inside —
            // so the background covers the full width and rooms scroll UNDER
            // it rather than beside it. Same trick as the energy band.
            margin: '-16px -16px 12px',
            padding: '16px 16px 8px',
            // Matches `side`, so what passes underneath is hidden rather than
            // showing through a transparent strip.
            background: '#fafafa',
            borderBottom: `1px solid ${SUBTLE_RULE}`,
          }}
        >
          <h2
            style={{
              margin: 0,
              flex: 1,
              minWidth: 0,
              overflowWrap: 'anywhere',
              fontSize: 13,
              fontWeight: 600,
              color: '#777',
            }}
          >
            {shownSectionName ?? optionName}
          </h2>
          {shownDept && (
            <SaveDataButton dirty={dirty} saving={saving} error={saveError} onSave={saveData} />
          )}
        </div>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* Four faces, chosen by what the canvas last selected. Only the
          department one edits anything — a group or a section is an outline you
          read, and editing is one click away on the department itself. */}
      {isContainer ? (
        <OptionOutline
          selection={selection}
          departments={departments}
          sections={sections}
          groupDefs={groupDefs}
          buildingDefs={buildingDefs}
          sectionIds={sectionIds}
          functions={functions}
          // For the function colour each department and room is drawn in.
          departmentDefs={departmentDefs}
          roomDefs={roomDefs}
          buildingFactors={buildingFactors}
          onBuildingFactorChange={setBuildingFactor}
          phaseCount={phaseCount}
        />
      ) : shownDept ? (
        <DepartmentBlock
          key={shownDept.instanceId}
          dept={shownDept}
          roomDefs={roomDefs}
          sections={sections}
          groupDefs={groupDefs}
          objectDefs={objectDefs}
          functions={functions}
          schedules={schedules}
          buildingFactors={buildingFactors}
          departmentFunctionId={departmentDefs.find((d) => d.id === shownDept.defId)?.function_id}
          buildingDefs={buildingDefs}
          // Read-only: the phase is which strip you clicked, not a field on the
          // department.
          phaseCount={phaseCount}
          onAddRoom={(def) => addRoom(shownDept.instanceId, def)}
          onRoomChange={(roomInstanceId, updater, opts) =>
            updateRoom(shownDept.instanceId, roomInstanceId, updater, opts)
          }
          onDeptChange={(deptInstanceId, updater, opts) => updateDepartment(deptInstanceId, updater, opts)}
          onSelectDepartment={onSelectDepartment}
        />
      ) : (
        <>
          <OptionStats
            name={optionName}
            departments={departments}
            buildingFactors={buildingFactors}
            sectionCount={sectionIds.length}
            buildingCount={buildingIds.length}
            phaseCount={phaseCount}
          />
          {departments.length === 0 && (
            <PanelNote pad>Add a building on the canvas, then the sections and departments inside it.</PanelNote>
          )}
        </>
      )}

    </div>
  )
}
