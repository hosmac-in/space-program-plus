// The option editor: holds the currently-open option in memory, renders the
// selected department's rooms and objects, and saves to sp_option.
// The wire format and every id-to-name resolution live in data/optionData.js.
// The department detail pane is DepartmentBlock.jsx.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../primitives/Toast.jsx'
import { UNDO_DEPTH } from '../undo.js'
import { supabase } from '../../data/supabase.js'
import { useCatalog } from '../../data/catalog.jsx'
import { catalogRoomsForNode, resolveNodePlacement } from '../../data/tree.js'
import { buildInstanceData, loadInstanceData, SCHEMA_VERSION } from '../../data/optionData.js'
import DepartmentBlock from './DepartmentBlock.jsx'
import OptionOutline from './OptionOutline.jsx'
import OptionStats from './OptionStats.jsx'
import { PanelNote } from '../panel/panelParts.jsx'
import SaveDataButton from './SaveDataButton.jsx'

// A new or unloaded option: no departments, and no sections either — every
// section is offered on the canvas, none is in the option until added.
const EMPTY_OPTION = { departments: [], sectionIds: [] }

// Structural edits — a section or a department added or removed — write
// themselves; rooms, objects and counts wait for Save Data. See mutateOption.
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
  onExposeActions,
}) {
  const {
    departments: departmentDefs,
    rooms: roomDefs,
    objects: objectDefs,
    groups: groupDefs,
    sections,
    functions,
    loaded: catalogLoaded,
    error: catalogError,
  } = useCatalog()

  // One atomic history value rather than three cooperating pieces of state.
  //
  // This used to be separate `departments`/`past`/`future` states, with the
  // past pushed from INSIDE the setDepartments updater. React may call an
  // updater more than once (StrictMode always does in development), so every
  // edit pushed two identical entries and the first undo appeared to do
  // nothing — most visibly when editing rooms and objects, which is where the
  // edits are. Keeping all three in one object makes each edit exactly one
  // transition and the updater pure.
  //
  // `present` holds the whole option — its departments AND which sections it
  // includes — so adding or removing a section is one undo step like any other
  // edit. Sections can't be derived from the departments any more: an option
  // may hold a section with nothing in it.
  const [history, setHistory] = useState({ past: [], present: EMPTY_OPTION, future: [] })
  const { departments, sectionIds } = history.present
  const [optionName, setOptionName] = useState('')
  const [loadError, setLoadError] = useState(null)
  const onToast = useToast()
  // Which option is actually in memory. Until this matches loadOptionId, what
  // is in memory is an EMPTY option, and writing it would erase the real row —
  // so nothing may be saved until they agree.
  const [loadedOptionId, setLoadedOptionId] = useState(null)
  // The current option and name, kept in refs as well as state: a mutation
  // needs the value it just produced, before the re-render.
  const shownDeptRef = useRef(null)
  // Which run of edits the last mutation belonged to — see `coalesce`.
  const lastCoalesceRef = useRef(null)
  const historyRef = useRef(history)
  const presentRef = useRef(history.present)
  const optionNameRef = useRef(optionName)
  const loadedIdRef = useRef(null)
  const loadOptionIdRef = useRef(loadOptionId)
  loadOptionIdRef.current = loadOptionId
  const lastSavedNameRef = useRef('')
  // The focused department, and its rooms as they were when it came into focus
  // or was last saved. State, not a ref: the Save Data button is derived from
  // it, so a render has to see it change.
  const [focus, setFocus] = useState({ id: null, rooms: '[]' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  // The row version this option was loaded at. Null means no option is loaded,
  // and therefore that nothing may be written — see writeOption.
  const versionRef = useRef(null)

  historyRef.current = history
  presentRef.current = history.present
  optionNameRef.current = optionName

  // What Save Data tracks: the rooms and objects of the ONE department on the
  // panel, watched in memory against how they looked when it came into focus.
  //
  // Not against the database, and not across the whole option. You cannot leave
  // a department with unsaved edits — the guard in App asks first — so "changed
  // since I opened this department" is the whole question, and answering it
  // locally keeps the button still while structural writes come and go.
  function roomsOf(dept) {
    return JSON.stringify(dept?.rooms ?? [])
  }

  // Every edit to the option — department, section, room, object or count —
  // goes through here, which is what puts all of them on the undo stack.
  //
  // `persist` says whether the edit writes itself. Structural edits do: adding
  // a section or a department is a deliberate act with a button behind it, and
  // it is done when you let go. Room and object edits do not: they are the
  // fiddly ones, and they wait for Save Data.
  //
  // A write sends the WHOLE row, so a structural edit necessarily carries any
  // unsaved room edits with it. That is why they are saved too, and why the
  // Save Data button goes grey afterwards — deliberate, not a leak: there is no
  // partial write of a jsonb column.
  //
  // The next value is computed here rather than inside the setState updater:
  // the updater must stay pure (React can call it twice), and persisting needs
  // the value now, not on the next render. `presentRef` is advanced at the same
  // time so two actions in one tick still compose.
  // `coalesce` folds a run of edits into one undo step. A count reports every
  // keystroke — so the Save Data button answers while you type — and "120"
  // would otherwise be three steps. Consecutive edits carrying the same key
  // replace the present instead of pushing a new past entry; anything else,
  // including the same field returned to later, starts a fresh step.
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

  // Undo and redo ALWAYS write.
  //
  // The state you land on is the state that should be stored — rooms and
  // objects included. Anything else leaves the database holding a version of
  // the option that nobody chose: not the edit (you just undid it) and not the
  // state on screen. So a step writes, and on success re-takes the focused
  // department's baseline, which is what leaves Save Data grey afterwards.
  //
  // A refused write (a version conflict, or the network) does not re-take it,
  // so the button lights up and the state on screen is offered for saving —
  // which is exactly what it is: unsaved.
  const step = useCallback((pick) => {
    const h = historyRef.current
    const next = pick(h)
    if (!next) return

    presentRef.current = next.present
    setHistory(next)

    const focusedId = shownDeptRef.current?.instanceId ?? null
    const landedOn = next.present.departments.find((d) => d.instanceId === focusedId) ?? null
    persistOption(next.present, optionNameRef.current).then((ok) => {
      if (ok) setFocus({ id: landedOn?.instanceId ?? null, rooms: roomsOf(landedOn) })
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

  // THE ONLY WRITE TO sp_option.
  //
  // Called by a structural edit (which writes itself) and by the Save Data
  // button, each handing it the exact state to write. Never by a timer: this
  // write overwrites the whole row, and every automatic trigger the autosave
  // had turned out to be a way of writing the wrong state over the right one.
  //
  // Two guards survive from that: it refuses any option that isn't the one in
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
        data: buildInstanceData(present.departments, present.sectionIds),
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

  // Writes run one at a time.
  //
  // Every write is conditional on the version it was loaded at, and each
  // successful one bumps that version. Two writes started together therefore
  // carry the SAME version, and the second is refused as a conflict — which is
  // what rapid undo/redo did: a step per click, all in flight at once, and the
  // second onwards failing with "changed somewhere else".
  //
  // Chaining them fixes it at the source: each waits for the previous to land,
  // then reads `versionRef` fresh. They stay in order, and the last click wins
  // because it writes last.
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

  // What the Save Data button calls: write the whole option — a row is written
  // whole — and, on success, take the focused department's rooms as the new
  // baseline, so the button goes quiet again.
  const saveData = useCallback(async () => {
    const dept = shownDeptRef.current
    const sent = roomsOf(dept)
    const ok = await persistOption(presentRef.current, optionNameRef.current)
    if (ok && dept) setFocus({ id: dept.instanceId, rooms: sent })
    return ok
  }, [persistOption])

  // Prefer the exact placement that's selected; fall back to matching by
  // definition for selections that arrived without node context.
  //
  // Gated on the selection KIND, not merely on there being a highlighted
  // department. Clicking empty canvas clears the selection but deliberately
  // leaves the highlight alone — the auto-focus effect above reads it, and
  // clearing it would make that effect immediately re-select the first
  // department, which is the opposite of what the click asked for. So the
  // department face has to be asked for by name, or it shows through.
  const shownDept =
    selection?.kind === 'department'
      ? departments.find((d) => d.treeNodeId && d.treeNodeId === selectedDeptInstanceId) ??
        departments.find((d) => d.defId === highlightedDepartmentId)
      : null

  shownDeptRef.current = shownDept

  // Coming into focus takes a fresh baseline: from here, "changed" means
  // changed since you opened this department.
  useEffect(() => {
    const id = shownDept?.instanceId ?? null
    setFocus((f) => (f.id === id ? f : { id, rooms: roomsOf(shownDept) }))
  }, [shownDept?.instanceId])

  // False while the two disagree about which department is in focus — that's
  // the render on which focus is being re-taken, and nothing is unsaved yet.
  const dirty = !!shownDept && focus.id === shownDept.instanceId && roomsOf(shownDept) !== focus.rooms

  // Waits for the catalog, and depends on NOTHING else that can change while
  // you work.
  //
  // It used to list the definition tables (and, briefly, `sections`) as
  // dependencies, because it needs them to resolve names and areas. That made
  // any catalog reload re-run the load — which calls resetOption, throwing away
  // every edit made since the option was opened, autosaved or not. `loaded`
  // flips false→true exactly once, so this now runs once per option, with the
  // definitions already in hand.
  useEffect(() => {
    if (!loadOptionId || !catalogLoaded) return undefined
    // Switch options quickly and the first response can arrive after the
    // second. Without this the panel would show the option you left while the
    // rest of the app says otherwise.
    let cancelled = false
    setLoadError(null)
    // Nothing in memory belongs to this option yet, so nothing may be written
    // to it until the row comes back.
    setLoadedOptionId(null)
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
        // An option saved before sections were stored has none listed; the
        // sections its departments sit in are what it displayed, so those are
        // what it opens with.
        const present = {
          departments: loaded.departments,
          sectionIds: loaded.sectionIds ?? sectionIdsOf(loaded.departments),
        }
        resetOption(present)
        setOptionName(row.option_name ?? '')
        lastSavedNameRef.current = row.option_name ?? ''
        setLoadedOptionId(loadOptionId)
        versionRef.current = row.version
        loadedIdRef.current = loadOptionId
        optionNameRef.current = row.option_name ?? ''
      })

    return () => {
      cancelled = true
    }
  }, [loadOptionId, catalogLoaded])

  // Entries arrive already anchored to one tree node — the card that was
  // clicked IS a specific placement, so there is nothing to disambiguate. The
  // same department definition twice is fine as long as the placements differ;
  // the same placement twice is not.
  function addDepartments(entries) {
    mutateOption((o) => {
      const prev = o.departments
      const existing = new Set(prev.map((d) => d.treeNodeId).filter(Boolean))
      const fresh = entries.filter(({ treeNodeId }) => treeNodeId && !existing.has(treeNodeId))
      // A department can't be in the option without its section being in it —
      // adding one from a section you haven't added yet brings the section too.
      const addedSections = fresh
        .map(({ treeNodeId }) => resolveNodePlacement(sections, treeNodeId, groupDefs)?.sectionId)
        .filter((id) => id && !o.sectionIds.includes(id))
      const departments = [
        ...prev,
        ...fresh.map(({ def, treeNodeId }) => {
          const placement = resolveNodePlacement(sections, treeNodeId, groupDefs)
          return {
            instanceId: crypto.randomUUID(),
            defId: def.id,
            name: def.name,
            type: def.type,
            treeNodeId,
            fallbackSectionName: placement?.sectionName ?? null,
            fallbackGroupName: placement?.groupName ?? null,
            rooms: [],
          }
        }),
      ]
      return { departments, sectionIds: [...new Set([...o.sectionIds, ...addedSections])] }
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

  // A section is added on its own and filled afterwards — including a section
  // the catalog leaves empty, which is why this doesn't touch departments.
  function addSection(sectionId) {
    mutateOption(
      (o) => (o.sectionIds.includes(sectionId) ? o : { ...o, sectionIds: [...o.sectionIds, sectionId] }),
      PERSIST
    )
  }

  // Removing a section takes everything in it with it — the departments under
  // it have nowhere left to be shown. The canvas confirms first when there is
  // anything to lose.
  function removeSection(sectionId) {
    mutateOption(
      (o) => ({
        sectionIds: o.sectionIds.filter((id) => id !== sectionId),
        departments: o.departments.filter(
          (d) => resolveNodePlacement(sections, d.treeNodeId, groupDefs)?.sectionId !== sectionId
        ),
      }),
      PERSIST
    )
  }

  function addRoom(deptInstanceId, def) {
    mutateDepartments((prev) =>
      prev.map((d) => {
        if (d.instanceId !== deptInstanceId) return d
        if (d.rooms.some((r) => r.defId === def.id)) return d

        // Anchor the room to the catalog room node it came from, so its object
        // list stays isolated from other rooms sharing the definition. The room
        // picker lists definitions, not per-instance cards, so in the rare
        // ambiguous case take the first and say so rather than blocking.
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
              objects: [],
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

  // Lets the Project tab add and remove departments and sections without App
  // having to own this component's state.
  useEffect(() => {
    onExposeActions?.({
      departments,
      sectionIds,
      departmentDefs,
      optionName,
      addDepartments,
      removeDepartment,
      addSection,
      removeSection,
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
    departmentDefs,
    optionName,
    history.past.length,
    history.future.length,
    dirty,
    saving,
    saveError,
    shownDept,
  ])

  // Lets the Project tab add and remove departments and sections without App
  // having to own this component's state.
  useEffect(() => {
    onExposeActions?.({
      departments,
      sectionIds,
      departmentDefs,
      optionName,
      addDepartments,
      removeDepartment,
      addSection,
      removeSection,
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
    departmentDefs,
    optionName,
    history.past.length,
    history.future.length,
    dirty,
    saving,
    saveError,
    shownDept,
  ])

  const isContainer = selection?.kind === 'group' || selection?.kind === 'section'

  const error = catalogError || loadError

  return (
    // No top margin: the panel starts at the top edge of side rather than
    // below a gap.
    <div>
      {/* One row: the option's name, and — when a department is open — Save
          Data at the right, on the same line and directly above the card's
          top-right corner. Save Data belongs to the department only; everything
          else on this option is changed by an action that writes for itself. */}
      {(isContainer || shownDept) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, marginBottom: 12 }}>
          <h2 style={{ margin: 0, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{optionName}</h2>
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
          functions={functions}
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
          departmentFunctionId={departmentDefs.find((d) => d.id === shownDept.defId)?.function_id}
          onAddRoom={(def) => addRoom(shownDept.instanceId, def)}
          onRoomChange={(roomInstanceId, updater, opts) =>
            updateRoom(shownDept.instanceId, roomInstanceId, updater, opts)
          }
          onSelectDepartment={onSelectDepartment}
        />
      ) : (
        <>
          <OptionStats name={optionName} departments={departments} sectionCount={sectionIds.length} />
          {departments.length === 0 && (
            <PanelNote pad>Add a section on the canvas, then the departments that go in it.</PanelNote>
          )}
        </>
      )}

    </div>
  )
}
