// The open option's side panel, wired from a workspace. The counterpart of
// OptionCanvas, and one call site for both apps for the same reason.
//
// `InstanceBuilder` owns the option — the load, the undo history, the
// version-checked write — and hands its actions back up through
// `onExposeActions`. That is where the workspace's `builderState` comes from,
// so this component is the join between the two.

import InstanceBuilder from './InstanceBuilder.jsx'

export default function OptionPanel({ workspace, optionId, onSelectDepartment, onSaved }) {
  return (
    <InstanceBuilder
      loadOptionId={optionId}
      selection={workspace.selection}
      onSaved={onSaved}
      onSelectDepartment={onSelectDepartment}
      highlightedDepartmentId={workspace.highlightedDepartmentId}
      selectedDeptInstanceId={workspace.selectedDeptInstanceId}
      selectedPhase={workspace.selectedPhase}
      onExposeActions={workspace.setBuilderState}
    />
  )
}
