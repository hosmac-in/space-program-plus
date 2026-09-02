// Every edit the Tree canvas can make to the catalog tree, plus undo/redo
// and the toast queue that narrates them.
//
// Each handler: mutate the tree (data/tree.js) -> write the section row ->
// reload sections -> toast -> record an undo/redo pair.
//
// STALENESS
//
// These handlers are memoized with no dependencies so their identity is stable
// across renders (undo/redo closures hold onto them for the life of the stack).
// A plain closure over `sections` would therefore freeze on first-render state
// and write edits against an empty tree. Instead they read catalogRef, which is
// re-pointed at the latest catalog data every render. One ref, read at call
// time, rather than mirroring each handler separately.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useCatalog } from '../../data/catalog.jsx'
import { useToast } from '../primitives/Toast.jsx'
import {
  cleanObjectNode,
  EMPTY_TREE,
  findDeptContext,
  findGroupNode,
  findSectionIdForGroup,
  insertDeptNode,
  insertGroupNode,
  newDeptNode,
  newGroupNode,
  removeDeptNode,
  removeGroupNode,
  updateDeptNode,
  writeSectionTree,
} from '../../data/tree.js'
import { describeMove } from './treeLayout.js'
import { UNDO_DEPTH } from '../undo.js'

const RECORD = { record: true }

export function useTreeEditor() {
  const catalog = useCatalog()
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [error, setError] = useState(null)

  const catalogRef = useRef(catalog)
  const undoStackRef = useRef(undoStack)
  const redoStackRef = useRef(redoStack)
  useEffect(() => {
    catalogRef.current = catalog
    undoStackRef.current = undoStack
    redoStackRef.current = redoStack
  })

  const pushToast = useToast()

  const pushCommand = useCallback((undoFn, redoFn) => {
    setRedoStack([])
    // Same depth as the option's history — see ui/undo.js.
    setUndoStack((s) => [...s.slice(-(UNDO_DEPTH - 1)), { undo: undoFn, redo: redoFn }])
  }, [])

  // EVERY ACTION IN THIS FILE RUNS ALONE, one after another.
  //
  // Not just the writes — the whole action, because each one READS the catalog
  // (`catalogRef.current`), computes a new tree from it, and writes that tree
  // back. Two actions started together would both read the same copy, and the
  // second would write a tree computed before the first existed, silently
  // undoing it. Dragging a department and then immediately removing another was
  // enough to lose the drag.
  //
  // Serialising the action rather than the write is what makes the read safe:
  // by the time the second runs, the first has written AND reloaded the
  // catalog, so it reads the tree as it now is.
  const queueRef = useRef(Promise.resolve())

  function serialise(fn) {
    return (...args) => {
      const run = () => fn(...args)
      const next = queueRef.current.then(run, run)
      // The queue itself must never reject, or every later action is skipped.
      queueRef.current = next.catch(() => {})
      return next
    }
  }

  // Writes one section and refreshes everyone's copy of the catalog. Returns
  // false (and surfaces the message) if the database refused the write, which
  // for a non-admin is exactly what the RLS policy is supposed to do.
  const write = useCallback(async (sectionId, tree) => {
    const message = await writeSectionTree(sectionId, tree)
    if (message) {
      setError(message)
      return false
    }
    await catalogRef.current.reloadSections()
    return true
  }, [])

  const nameOfGroup = (defId) => catalogRef.current.groups.find((g) => g.id === defId)?.name
  const nameOfDept = (defId) => catalogRef.current.departments.find((d) => d.id === defId)?.name
  const nameOfRoom = (defId) => catalogRef.current.rooms.find((r) => r.id === defId)?.name
  const nameOfObject = (defId) => catalogRef.current.objects.find((o) => o.id === defId)?.name

  // --- Groups ---------------------------------------------------------------

  const placeGroup = useCallback(serialise(async (sectionId, groupDefId, opts = RECORD) => {
    const { record = true, existingNode = null } = opts
    const { sections } = catalogRef.current
    const section = sections.find((s) => s.id === sectionId)
    if (!section) return

    // A duplicable group may live in several sections but not twice in the
    // same one — that's a redundant stack, not a second placement. Undo/redo
    // passes existingNode and bypasses this: it restores exact prior state.
    if (!existingNode && (section.tree?.groups || []).some((g) => g.group_def_id === groupDefId)) {
      pushToast(`${nameOfGroup(groupDefId) ?? 'Group'} is already in ${section.name}`)
      return
    }

    const node = existingNode ?? newGroupNode(groupDefId)
    if (!(await write(sectionId, insertGroupNode(section.tree || EMPTY_TREE, node)))) return

    pushToast(describeMove(nameOfGroup(groupDefId) ?? 'Group', null, section.name))
    if (record) {
      pushCommand(
        () => removeGroup(node.instance_id, { record: false }),
        () => placeGroup(sectionId, groupDefId, { record: false, existingNode: node })
      )
    }
  }), [])

  const removeGroup = useCallback(serialise(async (groupInstanceId, opts = RECORD) => {
    const { record = true } = opts
    const { sections } = catalogRef.current

    for (const section of sections) {
      const { tree, removed } = removeGroupNode(section.tree || EMPTY_TREE, groupInstanceId)
      if (!removed) continue
      if (!(await write(section.id, tree))) return

      pushToast(describeMove(nameOfGroup(removed.group_def_id) ?? 'Group', section.name, null))
      if (record) {
        pushCommand(
          // Restores the whole removed node, so the departments inside it come
          // back too — undo is not "re-add an empty group".
          () => placeGroup(section.id, removed.group_def_id, { record: false, existingNode: removed }),
          () => removeGroup(groupInstanceId, { record: false })
        )
      }
      return
    }
  }), [])

  // Returns false when the move was rejected, so the caller can snap the card
  // back to where it was.
  const moveGroup = useCallback(serialise(async (groupInstanceId, fromSectionId, toSectionId, opts = RECORD) => {
    const { record = true } = opts
    if (!fromSectionId || !toSectionId || fromSectionId === toSectionId) return false

    const { sections } = catalogRef.current
    const fromSection = sections.find((s) => s.id === fromSectionId)
    const toSection = sections.find((s) => s.id === toSectionId)
    if (!fromSection || !toSection) return false

    const moving = (fromSection.tree?.groups || []).find((g) => g.instance_id === groupInstanceId)
    if (!moving) return false

    if ((toSection.tree?.groups || []).some((g) => g.group_def_id === moving.group_def_id)) {
      pushToast(`${nameOfGroup(moving.group_def_id) ?? 'Group'} is already in ${toSection.name}`)
      return false
    }

    const { tree: strippedTree } = removeGroupNode(fromSection.tree || EMPTY_TREE, groupInstanceId)
    if (!(await write(fromSectionId, strippedTree))) return false
    if (!(await write(toSectionId, insertGroupNode(toSection.tree || EMPTY_TREE, moving)))) return false

    pushToast(describeMove(nameOfGroup(moving.group_def_id) ?? 'Group', fromSection.name, toSection.name))
    if (record) {
      pushCommand(
        () => moveGroup(groupInstanceId, toSectionId, fromSectionId, { record: false }),
        () => moveGroup(groupInstanceId, fromSectionId, toSectionId, { record: false })
      )
    }
    return true
  }), [])

  // --- Departments ----------------------------------------------------------

  const placeDept = useCallback(serialise(async (groupInstanceId, deptDefId, opts = RECORD) => {
    const { record = true, existingNode = null } = opts
    const { sections } = catalogRef.current

    const groupNode = findGroupNode(sections, groupInstanceId)
    const sectionId = findSectionIdForGroup(sections, groupInstanceId)
    const section = sections.find((s) => s.id === sectionId)
    if (!groupNode || !section) return

    const groupName = nameOfGroup(groupNode.group_def_id)
    // Same rule one level down.
    if (!existingNode && (groupNode.departments || []).some((d) => d.department_def_id === deptDefId)) {
      pushToast(`${nameOfDept(deptDefId) ?? 'Department'} is already in ${groupName ?? 'this group'}`)
      return
    }

    const node = existingNode ?? newDeptNode(deptDefId)
    if (!(await write(sectionId, insertDeptNode(section.tree || EMPTY_TREE, groupInstanceId, node)))) return

    pushToast(describeMove(nameOfDept(deptDefId) ?? 'Department', null, groupName ?? null))
    if (record) {
      pushCommand(
        () => removeDept(node.instance_id, { record: false }),
        () => placeDept(groupInstanceId, deptDefId, { record: false, existingNode: node })
      )
    }
  }), [])

  const removeDept = useCallback(serialise(async (deptInstanceId, opts = RECORD) => {
    const { record = true } = opts
    const { sections } = catalogRef.current

    for (const section of sections) {
      const { tree, removed, fromGroupInstanceId } = removeDeptNode(section.tree || EMPTY_TREE, deptInstanceId)
      if (!removed) continue

      const fromGroup = findGroupNode(sections, fromGroupInstanceId)
      if (!(await write(section.id, tree))) return

      pushToast(
        describeMove(
          nameOfDept(removed.department_def_id) ?? 'Department',
          fromGroup ? nameOfGroup(fromGroup.group_def_id) ?? null : null,
          null
        )
      )
      if (record) {
        // Restores the node with its rooms and objects intact.
        pushCommand(
          () => placeDept(fromGroupInstanceId, removed.department_def_id, { record: false, existingNode: removed }),
          () => removeDept(deptInstanceId, { record: false })
        )
      }
      return
    }
  }), [])

  const moveDept = useCallback(serialise(async (deptInstanceId, fromGroupInstanceId, toGroupInstanceId, opts = RECORD) => {
    const { record = true } = opts
    if (!fromGroupInstanceId || !toGroupInstanceId || fromGroupInstanceId === toGroupInstanceId) return false

    const { sections } = catalogRef.current
    const toGroupNode = findGroupNode(sections, toGroupInstanceId)
    const fromCtx = findDeptContext(sections, deptInstanceId)
    const toSectionId = findSectionIdForGroup(sections, toGroupInstanceId)
    if (!toGroupNode || !fromCtx || !toSectionId) return false

    const deptName = nameOfDept(fromCtx.deptNode.department_def_id) ?? 'Department'
    const toGroupName = nameOfGroup(toGroupNode.group_def_id)

    if ((toGroupNode.departments || []).some((d) => d.department_def_id === fromCtx.deptNode.department_def_id)) {
      pushToast(`${deptName} is already in ${toGroupName ?? 'this group'}`)
      return false
    }

    const fromSection = sections.find((s) => s.id === fromCtx.sectionId)
    const { tree: strippedTree, removed } = removeDeptNode(fromSection.tree || EMPTY_TREE, deptInstanceId)
    if (!removed) return false

    if (fromCtx.sectionId === toSectionId) {
      // Both ends live in the same JSON document — one write, not two, so the
      // move can never half-apply.
      if (!(await write(fromCtx.sectionId, insertDeptNode(strippedTree, toGroupInstanceId, removed)))) return false
    } else {
      const toSection = sections.find((s) => s.id === toSectionId)
      if (!(await write(fromCtx.sectionId, strippedTree))) return false
      if (!(await write(toSectionId, insertDeptNode(toSection.tree || EMPTY_TREE, toGroupInstanceId, removed))))
        return false
    }

    pushToast(describeMove(deptName, nameOfGroup(fromCtx.groupNode.group_def_id) ?? null, toGroupName ?? null))
    if (record) {
      pushCommand(
        () => moveDept(deptInstanceId, toGroupInstanceId, fromGroupInstanceId, { record: false }),
        () => moveDept(deptInstanceId, fromGroupInstanceId, toGroupInstanceId, { record: false })
      )
    }
    return true
  }), [])

  // --- Rooms and objects ----------------------------------------------------
  //
  // These edit three and four levels down inside a section's tree, on one
  // specific department placement. They record undo commands exactly like the
  // group and department edits above, so everything the Tree tab can do
  // shares one stack — the rooms panel and the canvas are one history.
  //
  // Removals restore the node at its original index, and a removed room comes
  // back with its objects intact, since the whole node is held in the closure.

  // The department's whole room list, replaced in one write.
  //
  // Every + and × in the rooms panel calls this with the list it wants, so each
  // click is one write and one undo step. There is no draft and no Save button
  // on this tab: the catalog is edited by acting on it, the way the canvas above
  // it already is.
  //
  // The undo pair holds the room list before and after — snapshots, not inverse
  // edits — because a room list is small and self-contained. Undo writes the
  // whole jsonb back.
  const setDeptRooms = useCallback(serialise(async (deptInstanceId, rooms, opts = {}) => {
    const { record = true, message } = opts
    const { sections } = catalogRef.current
    const ctx = findDeptContext(sections, deptInstanceId)
    if (!ctx) return false

    // Counts briefly lived in the tree and don't any more, so a room list on
    // its way to the database is normalised: ids only, per data/tree.js.
    const clean = rooms.map((r) => ({ ...r, objects: (r.objects || []).map(cleanObjectNode) }))
    const previous = ctx.deptNode.rooms || []
    const section = sections.find((s) => s.id === ctx.sectionId)
    const { tree, found } = updateDeptNode(section.tree || EMPTY_TREE, deptInstanceId, (dept) => ({
      ...dept,
      rooms: clean,
    }))
    if (!found || !(await write(ctx.sectionId, tree))) return false

    if (message) pushToast(message)
    if (record) {
      pushCommand(
        () => setDeptRooms(deptInstanceId, previous, { record: false }),
        () => setDeptRooms(deptInstanceId, clean, { record: false })
      )
    }
    return true
  }), [])

  // --- Undo / redo ----------------------------------------------------------
  //
  // Structural commands are closure pairs, so an undo re-runs the inverse edit
  // against whatever the tree looks like now instead of stamping a stale copy
  // over the top — that matters for moves, where the world may have shifted.
  // A room list is the exception: it is small and belongs to one department, so
  // its pair carries the list itself and undo writes the whole jsonb back.

  const undo = useCallback(() => {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const cmd = stack[stack.length - 1]
    setUndoStack((s) => s.slice(0, -1))
    setRedoStack((s) => [...s, cmd])
    cmd.undo()
  }, [])

  const redo = useCallback(() => {
    const stack = redoStackRef.current
    if (stack.length === 0) return
    const cmd = stack[stack.length - 1]
    setRedoStack((s) => s.slice(0, -1))
    setUndoStack((s) => [...s, cmd])
    cmd.redo()
  }, [])

  return {
    placeGroup,
    removeGroup,
    moveGroup,
    placeDept,
    removeDept,
    moveDept,
    setDeptRooms,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    error: error ?? catalog.error,
  }
}

// The Tree tab is split across two columns — the canvas on the left, the
// rooms panel on the right — but they are one editing session with one undo
// stack, so the editor is held above both rather than inside either.
const TreeEditorContext = createContext(null)

export function TreeEditorProvider({ children }) {
  const editor = useTreeEditor()
  return <TreeEditorContext.Provider value={editor}>{children}</TreeEditorContext.Provider>
}

export function useTreeEditorContext() {
  const editor = useContext(TreeEditorContext)
  if (!editor) throw new Error('useTreeEditorContext must be used inside a TreeEditorProvider')
  return editor
}
