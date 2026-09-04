// Every edit the Tree canvas can make to the catalog tree, plus undo/redo
// and the toast queue that narrates them.
//
// Each handler: mutate the tree (data/tree.js) -> write the section row ->
// reload sections -> toast -> record an undo/redo pair.
//
// STALENESS: these handlers are memoized with NO dependencies so their identity
// stays stable — undo/redo closures hold them for the life of the stack. A plain
// closure over `sections` would freeze on first-render state and write edits
// against an empty tree, so they read catalogRef instead, re-pointed every
// render.

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
import { withFactor } from '../../data/factors.js'
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

  // EVERY ACTION IN THIS FILE RUNS ALONE — the whole action, not just its write,
  // because each one reads the catalog, computes a new tree from it and writes
  // that back. Two started together would read the same copy and the second
  // would write a tree computed before the first existed. Dragging a department
  // and immediately removing another was enough to lose the drag.
  //
  // Serialising the action is what makes the READ safe: by the time the next
  // runs, the previous has written and reloaded.
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

  // Writes one section and refreshes everyone's copy of the catalog. False (and
  // a message) if the database refused it, which for a non-admin is what the RLS
  // policy is for. The version travels from the same catalogRef copy the tree
  // was computed from.
  //
  // A CONFLICT is not an error: someone else wrote this section, so nothing was
  // written and this copy is stale. Reload and say so — retrying would re-apply
  // an edit computed against a tree that no longer exists, which is the
  // destruction the check exists to prevent.
  const write = useCallback(async (sectionId, tree) => {
    const section = catalogRef.current.sections.find((s) => s.id === sectionId)
    const { error: message, conflict } = await writeSectionTree(sectionId, tree, section?.version)

    if (conflict) {
      await catalogRef.current.reloadSections()
      pushToast(`${section?.name ?? 'That section'} was changed by someone else — reloaded, please try again.`)
      return false
    }
    if (message) {
      setError(message)
      return false
    }
    await catalogRef.current.reloadSections()
    return true
  }, [])

  const nameOfGroup = (defId) => catalogRef.current.groups.find((g) => g.id === defId)?.name
  const nameOfDept = (defId) => catalogRef.current.departments.find((d) => d.id === defId)?.name

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
  // These edit one specific department placement, three and four levels down,
  // and record onto the same stack as the canvas edits above — the rooms panel
  // and the canvas are one history.

  // The department's whole room list, replaced in one write. Every + and × in
  // the rooms panel calls this with the list it wants, so each click is one
  // write and one undo step; there is no draft and no Save button on this tab.
  //
  // The undo pair holds the list before and after — snapshots rather than
  // inverse edits, because a room list is small and belongs to one department.
  const setDeptRooms = useCallback(serialise(async (deptInstanceId, rooms, opts = {}) => {
    const { record = true, message } = opts
    const { sections } = catalogRef.current
    const ctx = findDeptContext(sections, deptInstanceId)
    if (!ctx) return false

    // Normalised on the way to the database: the two ids and a usable count on
    // every object, and nothing hung on the node in memory.
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

  // The catalog's DEFAULT for one of a department's factors — the value an
  // option inherits. A scalar, so the undo pair is the previous and next value.
  // Clearing removes the key rather than writing 1, which is how "the catalog
  // states nothing" stays different from "the catalog states 1".
  const setDeptFactor = useCallback(serialise(async (deptInstanceId, factor, value, opts = {}) => {
    const { record = true, message } = opts
    const { sections } = catalogRef.current
    const ctx = findDeptContext(sections, deptInstanceId)
    if (!ctx) return false

    const previous = ctx.deptNode[factor.treeKey] ?? null
    const section = sections.find((s) => s.id === ctx.sectionId)
    const { tree, found } = updateDeptNode(section.tree || EMPTY_TREE, deptInstanceId, (dept) =>
      withFactor(dept, factor, value, { tree: true })
    )
    if (!found || !(await write(ctx.sectionId, tree))) return false

    if (message) pushToast(message)
    if (record) {
      pushCommand(
        () => setDeptFactor(deptInstanceId, factor, previous, { record: false }),
        () => setDeptFactor(deptInstanceId, factor, value, { record: false })
      )
    }
    return true
  }), [])

  // --- Undo / redo ----------------------------------------------------------
  //
  // Structural commands are closure pairs, so an undo re-runs the inverse edit
  // against the tree as it now is rather than stamping a stale copy over it.
  // Room lists are the exception, as above.

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
    setDeptFactor,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    error: error ?? catalog.error,
  }
}

// The canvas and the rooms panel are two columns but one editing session with
// one undo stack, so the editor is held above both rather than inside either.
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
