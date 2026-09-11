// EVERYTHING BOTH APPS NEED TO SHOW ONE OPTION
//
// The canvas and the side panel have to agree on what is selected, and the panel
// holds edits in memory until Save Data — so anything that would take the edited
// department off the panel has to ask first. That is this hook: the selection,
// the phase, the state InstanceBuilder exposes upward, and the guard.
//
// It lives here rather than in a shell because there are two shells — the editor
// and the Rhino Companion — and a second copy of this would drift into showing
// something different about the same option. Lifted verbatim out of App.jsx;
// the tree-tab line that used to sit inside `selectDepartment` is the caller's
// business now (see `onSelect`).
//
// It does NOT own the option itself. That state — the load, the undo history,
// the version-checked write — lives in InstanceBuilder and reaches here through
// `onExposeActions`. See CLAUDE.md, Saving.

import { useState } from 'react'

// The shape before InstanceBuilder has mounted and reported. Everything a
// consumer might call is present as a no-op, so a canvas rendered in the same
// pass as the panel cannot call into nothing.
const NOT_LOADED = {
  departments: [],
  sectionIds: [],
  buildingIds: [],
  departmentDefs: [],
  optionName: '',
  addDepartments: () => {},
  removeDepartment: () => {},
  addSection: () => {},
  removeSection: () => {},
  phaseCount: 1,
  setOptionSettings: () => {},
  undo: () => {},
  redo: () => {},
  canUndo: false,
  canRedo: false,
  dirty: false,
  saving: false,
  saveError: null,
  save: () => {},
}

// `onSelect` is called before a department is selected, for whatever else the
// shell has to clear — the editor drops the Tree tab's selected building there,
// which is the one line of this that was ever tab-specific.
export function useOptionWorkspace({ onSelect } = {}) {
  // What side is showing, set by what was last clicked on the canvas: a
  // department, a group box, a section box, or nothing at all. Null means the
  // canvas's own empty space, and side falls back to the option's totals.
  const [selection, setSelection] = useState(null)
  // Which department definition is selected...
  const [highlightedDepartmentId, setHighlightedDepartmentId] = useState(null)
  // ...and, when the selection came from a specific placement on a canvas, that
  // placement's tree node id. The rooms panel needs the placement, not the
  // definition, since rooms hang off the placement.
  const [selectedDeptInstanceId, setSelectedDeptInstanceId] = useState(null)
  // ...and which of the option's phases. A placement holds one entry per phase
  // it is staged in, each with its own rooms, so the node id alone no longer
  // names one department to edit.
  const [selectedPhase, setSelectedPhase] = useState(1)

  // Exposed by InstanceBuilder so the canvas can add and remove departments
  // without this hook owning the option's state.
  const [builderState, setBuilderState] = useState(NOT_LOADED)

  // ANY change that takes the edited department off the side panel asks first.
  //
  // Room and object edits live only in memory until Save Data is pressed, and
  // the panel shows one department at a time — so clicking another department,
  // clicking the canvas, selecting a group or section, and switching option or
  // project all replace what you were editing. Every one of them goes through
  // here, and none proceeds until you have said save or discard.
  //
  // Switching TAB deliberately does not. The option panel is hidden rather than
  // unmounted off the Project tab, so a tab change loses nothing and a prompt
  // over it would be asking about a loss that isn't happening.
  //
  // Structural edits write themselves, so `dirty` only ever means rooms,
  // objects and counts.
  //
  // The pending action is held as `{ run }` rather than bare, because a bare
  // function passed to setState is taken as an updater and called immediately.
  const [pending, setPending] = useState(null)

  function guard(run) {
    if (builderState.dirty) setPending({ run })
    else run()
  }

  function selectDepartment(defId, treeNodeId, phase = 1) {
    const select = () => {
      onSelect?.()
      setHighlightedDepartmentId(defId)
      setSelectedDeptInstanceId(treeNodeId ?? null)
      setSelectedPhase(phase)
      setSelection({ kind: 'department', id: treeNodeId ?? defId })
    }
    // Clicking the department already open changes nothing, so it needn't ask.
    //
    // The PHASE is part of that: two strips of one card are two departments to
    // edit, with their own rooms, so moving between them must ask about unsaved
    // ones exactly as moving between two cards does.
    const same =
      selection?.kind === 'department' &&
      phase === selectedPhase &&
      (treeNodeId ? treeNodeId === selectedDeptInstanceId : defId === highlightedDepartmentId)
    if (same) select()
    else guard(select)
  }

  return {
    selection,
    setSelection,
    highlightedDepartmentId,
    selectedDeptInstanceId,
    setSelectedDeptInstanceId,
    selectedPhase,
    builderState,
    setBuilderState,
    pending,
    setPending,
    guard,
    selectDepartment,
  }
}
