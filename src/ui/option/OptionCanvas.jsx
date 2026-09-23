// The open option's canvas, wired from a workspace.
//
// One call site for both apps. `DepartmentGraph` takes fourteen props, twelve of
// which come straight off `useOptionWorkspace`, and two shells spelling that out
// separately is two lists to keep in step — the failure mode being a canvas that
// quietly computes different areas from the panel beside it, which is exactly
// what `buildingFactors` was doing before this existed.
//
// It also holds the analysis view, behind `diagram` — see below.

import { useRef, useState } from 'react'
import FullscreenControls, { FullscreenRoot } from '../primitives/FullscreenControls.jsx'
import { GUTTER } from '../canvas/CanvasFrame.jsx'
import DepartmentGraph from './DepartmentGraph.jsx'
import OptionAnalysis from '../diagram/OptionAnalysis.jsx'

// `diagram` is the editor's, not the Companion's. A prop rather than a context
// because there is exactly one caller either way, and rather than `useReadOnly()`
// because this is not a permission: the Companion is bound to a document and
// checks a model against the program, so a second way of looking at that program is
// simply not what that app is for.
export default function OptionCanvas({ workspace, onSelectDepartment, diagram = false }) {
  const { builderState: option, selection, setSelection, selectedDeptInstanceId, selectedPhase, guard } = workspace

  // Which view is showing. Local, and deliberately NOT in the URL: analysis is
  // a way of looking at the option you already have open, not a place — and a
  // shareable link that landed on it would be reporting the viewer's last
  // glance rather than anything about the option.
  const [showAnalysis, setShowAnalysis] = useState(false)
  // The WHOLE view goes full screen, not just the canvas pane, so View Analysis
  // and the analysis view (with its AHU toggle) come along. The Companion keeps
  // the pane's own button — it has no analysis to bring.
  const rootRef = useRef(null)

  const body = (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, background: '#fff' }}>
      {showAnalysis && diagram ? (
        <OptionAnalysis departments={option.departments} buildingFactors={option.buildingFactors} />
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
          dmgIds={option.dmgIds}
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
          onClick={() => setShowAnalysis((v) => !v)}
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
          {showAnalysis ? 'View Space Program' : 'View Treemap'}
        </button>
      )}
      {/* Collapse / Expand mean nothing on the treemap, so only on the canvas. */}
      {/* On the canvas the root includes the frame's bottom gutter; the
          analysis view has none. */}
      {diagram && (
        <FullscreenControls target={rootRef} expandable={!showAnalysis} bottom={showAnalysis ? 12 : GUTTER + 12} />
      )}
    </div>
  )

  return diagram ? <FullscreenRoot>{body}</FullscreenRoot> : body
}
