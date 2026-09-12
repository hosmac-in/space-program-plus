// The open option's canvas, wired from a workspace.
//
// One call site for both apps. `DepartmentGraph` takes fourteen props, twelve of
// which come straight off `useOptionWorkspace`, and two shells spelling that out
// separately is two lists to keep in step — the failure mode being a canvas that
// quietly computes different areas from the panel beside it, which is exactly
// what `buildingFactors` was doing before this existed.
//
// It also holds the 3D diagram, behind `diagram` — see below.

import { lazy, Suspense, useState } from 'react'
import DepartmentGraph from './DepartmentGraph.jsx'

// LAZY, and that is load-bearing rather than a nicety: a plain import puts
// three.js (~150 kB gzipped) in the bundle both apps share, and the Companion
// passes `diagram={false}` — it would pay for a view it has no way to open.
const OptionDiagram = lazy(() => import('../diagram/OptionDiagram.jsx'))

// `diagram` is the editor's, not the Companion's. A prop rather than a context
// because there is exactly one caller either way, and rather than `useReadOnly()`
// because this is not a permission: the Companion is bound to a document and
// checks a model against the program, so a second way of drawing that program is
// simply not what that app is for.
export default function OptionCanvas({ workspace, onSelectDepartment, diagram = false }) {
  const { builderState: option, selection, setSelection, selectedDeptInstanceId, selectedPhase, guard } = workspace

  // Which view is showing. Local, and deliberately NOT in the URL: the diagram
  // is a way of looking at the option you already have open, not a place — and
  // a shareable link that landed on it would be reporting the viewer's last
  // glance rather than anything about the option. Reconsider when it can be
  // orbited to a particular angle, which IS worth sharing.
  const [showDiagram, setShowDiagram] = useState(false)

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {showDiagram && diagram ? (
        <Suspense fallback={<div style={{ padding: 12, fontSize: 13, color: '#999' }}>Loading the model…</div>}>
          <OptionDiagram
            departments={option.departments}
            sectionIds={option.sectionIds}
            buildingFactors={option.buildingFactors}
          />
        </Suspense>
      ) : (
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
      )}

      {/* Top-right, clear of the canvas's own scrollbar gutters, which are on the
          left and along the bottom (see ui/canvas/CanvasFrame.jsx). */}
      {diagram && (
        <button
          type="button"
          onClick={() => setShowDiagram((v) => !v)}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '5px 10px',
            fontSize: 12,
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: 6,
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            cursor: 'pointer',
          }}
        >
          {showDiagram ? 'View Plan' : 'View Diagram'}
        </button>
      )}
    </div>
  )
}
