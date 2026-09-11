// The open option's canvas, wired from a workspace.
//
// One call site for both apps. `DepartmentGraph` takes fourteen props, twelve of
// which come straight off `useOptionWorkspace`, and two shells spelling that out
// separately is two lists to keep in step — the failure mode being a canvas that
// quietly computes different areas from the panel beside it, which is exactly
// what `buildingFactors` was doing before this existed.

import DepartmentGraph from './DepartmentGraph.jsx'

export default function OptionCanvas({ workspace, onSelectDepartment }) {
  const { builderState: option, selection, setSelection, selectedDeptInstanceId, selectedPhase, guard } = workspace

  return (
    <DepartmentGraph
      optionName={option.optionName}
      departments={option.departments}
      departmentDefs={option.departmentDefs}
      onAddDepartments={option.addDepartments}
      onRemoveDepartment={option.removeDepartment}
      sectionIds={option.sectionIds}
      onAddSection={option.addSection}
      onRemoveSection={option.removeSection}
      buildingIds={option.buildingIds}
      // WAS MISSING. App passed it to MapPanel, which never destructured it and
      // never forwarded it — so the cards grossed their areas with `undefined`
      // overrides while the HUD and OptionStats used the real ones. Two figures
      // for one department, on screen together.
      buildingFactors={option.buildingFactors}
      phaseCount={option.phaseCount}
      selection={selection}
      onSelectContainer={(next) => guard(() => setSelection(next))}
      onSelectDepartment={onSelectDepartment}
      selectedDeptInstanceId={selectedDeptInstanceId}
      selectedPhase={selectedPhase}
    />
  )
}
