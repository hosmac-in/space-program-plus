// The Project tab: the catalog tree drawn as a map, with the departments
// already in this option solid and the rest ghosted. Clicking a ghost adds it;
// clicking a solid one selects it for editing in the right-hand pane.
//
// Sections are added one at a time and filled by hand: **Add section** above a
// section puts the section itself in the option, and its departments are then
// added individually. So an option can hold a section that is empty — one you
// haven't filled yet, one you've emptied again, or one the catalog gives no
// groups at all — and a section only leaves the option when you remove it with
// the × in its header. Groups are never added or removed directly; a group
// appears exactly when a department inside it does.

import { useMemo, useState } from 'react'
import ReactFlow, { Background } from 'reactflow'
import 'reactflow/dist/style.css'
import { useCatalog } from '../../data/catalog.jsx'
import { summarize } from '../../data/optionData.js'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import AddButton from '../primitives/AddButton.jsx'
import RemoveButton from '../primitives/RemoveButton.jsx'
import { CanvasCard, CanvasContainer } from '../canvas/canvasCards.jsx'
import { buildLayout, NODE_HEIGHT, NODE_WIDTH } from './departmentGraphLayout.js'
import { formatArea } from '../map/area.js'

function DepartmentNodeCard({ data }) {
  const ghost = !data.isReal

  return (
    <CanvasCard
      colours={data.colours}
      width={NODE_WIDTH}
      height={NODE_HEIGHT}
      isGhost={ghost}
      ghostBorder={data.ghostInk}
      ghostText={data.ghostInk}
      isHighlighted={data.isHighlighted}
      onClick={() => (ghost ? data.onAdd : data.onClick)(data.defId, data.treeNodeId)}
      title={ghost ? 'Click to add to this option' : undefined}
      corner={
        ghost ? null : (
          <RemoveButton
            onRemove={() => data.onRequestRemove(data.instanceId, data.name, data.roomCount, data.objectCount)}
            title="Remove department"
            corner
            stopPointerDown
          />
        )
      }
    >
      <div
        title={data.name}
        style={{
          fontWeight: 600,
          marginBottom: 6,
          fontSize: 13,
          paddingRight: ghost ? 0 : 20,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {data.name}
      </div>
      {!ghost && <div style={{ opacity: 0.75, lineHeight: 1.6 }}>{formatArea(data.areaSqft)} sqft</div>}

      {/* Centred in the space under the name, not tucked in a corner: on a
          ghost the + is the whole point of the card, and a solid card has its
          area figure there instead. */}
      {ghost && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 34,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AddButton
            onClick={() => data.onAdd(data.defId, data.treeNodeId)}
            title={`Add ${data.name} to this option`}
            size={22}
            stopPointerDown
          />
        </div>
      )}
    </CanvasCard>
  )
}

function RootNodeCard({ data }) {
  return (
    <div
      style={{
        width: NODE_WIDTH,
        border: '1px solid #1a73e8',
        borderRadius: 8,
        padding: 12,
        background: '#1a73e8',
        color: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'center',
      }}
    >
      {data.name}
    </div>
  )
}

// A section is added to the option as a section, and filled afterwards. The
// control sits above the box, not in its 30px header: it acts on the whole
// section, and up here it has room to say what it does.
//
// It disappears the moment the section is in — a × in the header takes over.
function AddSectionControl({ onAdd, name }) {
  return (
    <div
      className="nodrag nopan"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '100%',
        transform: 'translateX(-50%)',
        marginBottom: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        pointerEvents: 'auto',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: '#777', whiteSpace: 'nowrap' }}>Add section</span>
      <AddButton onClick={onAdd} title={`Add ${name} to this option`} size={26} stopPointerDown />
    </div>
  )
}

function ContainerNode({ data, fill, radius, borderWidth, fontSize, fontWeight }) {
  return (
    // Relative, so the add control can hang above the box without being clipped.
    //
    // Clicking the box selects it, which is what side reads to decide whether
    // to show a group's or a section's contents. The buttons inside stop their
    // own clicks, so pressing × doesn't also select what it just removed.
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        boxShadow: data.isSelected ? '0 0 0 3px rgba(26,115,232,0.55)' : undefined,
        borderRadius: radius,
      }}
      onClick={(e) => {
        e.stopPropagation()
        data.onSelect?.()
      }}
    >
      {data.onAdd && <AddSectionControl onAdd={data.onAdd} name={data.name} />}

      <CanvasContainer
        colours={data.colours}
        name={data.name}
        fill={fill}
        radius={radius}
        borderWidth={borderWidth}
        fontSize={fontSize}
        fontWeight={fontWeight}
        isGhost={data.isGhost}
        // Undefined on a ghost with nothing painted above it, which leaves
        // CanvasContainer's own grey — see ghostInkFor in the layout.
        ghostBorder={data.ghostInk}
        ghostText={data.ghostInk}
        headerRight={
          <>
            <span style={{ flexShrink: 0, fontWeight: 400, fontSize: 11, whiteSpace: 'nowrap', opacity: 0.75 }}>
              {formatArea(data.totalAreaSqft)} sqft
            </span>
            {data.onRemove && (
              <RemoveButton onRemove={data.onRemove} title={`Remove ${data.name} from this option`} size={16} stopPointerDown />
            )}
          </>
        }
      />
    </div>
  )
}

const nodeTypes = {
  department: DepartmentNodeCard,
  root: RootNodeCard,
  groupBox: (props) => <ContainerNode {...props} fill="solid" radius={8} borderWidth={1} />,
  sectionBox: (props) => <ContainerNode {...props} radius={10} borderWidth={1.5} fontSize={13} fontWeight={700} />,
}

// Only rendered with an option open — MapPanel shows the chooser instead when
// there isn't one — so there is no empty state to handle here.
export default function DepartmentGraph({
  optionName,
  departments,
  departmentDefs,
  onAddDepartments,
  onRemoveDepartment,
  sectionIds,
  onAddSection,
  onRemoveSection,
  onSelectDepartment,
  // What side is showing: { kind: 'department' | 'group' | 'section', id }, or
  // null for nothing — which is what a click on empty canvas produces.
  selection,
  onSelectContainer,
  onClearSelection,
  selectedDeptInstanceId,
}) {
  const { groups, sections, functions } = useCatalog()
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [confirmRemoveSection, setConfirmRemoveSection] = useState(null)

  const summary = useMemo(
    () => (departments.length > 0 ? summarize(departments) : { perDepartment: [] }),
    [departments]
  )

  // Both add paths carry the specific tree node the clicked card was drawn
  // from, so an option entry is always anchored to exactly one placement — no
  // picker, no guessing from a definition id.
  function toEntries(pairs) {
    return pairs
      .map(({ defId, treeNodeId }) => {
        const def = departmentDefs.find((d) => d.id === defId)
        return def ? { def, treeNodeId } : null
      })
      .filter(Boolean)
  }

  const { nodes, edges } = useMemo(
    () =>
      buildLayout({
        optionName,
        departmentDefs,
        departments,
        perDepartment: summary.perDepartment,
        groups,
        sections,
        sectionIds,
        functions,
        selectedDeptInstanceId,
        selection,
        onSelectContainer,
        onClick: onSelectDepartment,
        onAdd: (defId, treeNodeId) => onAddDepartments(toEntries([{ defId, treeNodeId }])),
        onAddSection,
        onRequestRemoveSection: (sectionId, name, departmentCount) => {
          // An empty section holds nothing to lose, so it just goes. One with
          // departments in it takes them with it, which needs saying first.
          if (departmentCount === 0) onRemoveSection(sectionId)
          else setConfirmRemoveSection({ sectionId, name, departmentCount })
        },
        onRequestRemove: (instanceId, name, roomCount, objectCount) => {
          // Nothing to lose in an empty department, so skip the confirmation.
          if (roomCount === 0 && objectCount === 0) onRemoveDepartment(instanceId)
          else setConfirmRemove({ instanceId, name, roomCount, objectCount })
        },
      }),
    [
      optionName,
      departmentDefs,
      departments,
      summary,
      groups,
      sections,
      sectionIds,
      functions,
      selectedDeptInstanceId,
      selection,
      onSelectContainer,
      onSelectDepartment,
      onAddSection,
    ]
  )

  // Undo/redo for the open option lives in the app footer, not here — see
  // AppFooter.jsx.
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          // Clicking past every box clears the selection, which is what returns
          // side to the option's own totals.
          onPaneClick={onClearSelection}
        >
          <Background />
        </ReactFlow>
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Remove department?"
          onConfirm={() => {
            onRemoveDepartment(confirmRemove.instanceId)
            setConfirmRemove(null)
          }}
          onCancel={() => setConfirmRemove(null)}
        >
          Remove "{confirmRemove.name}" and everything inside it ({confirmRemove.roomCount} room
          {confirmRemove.roomCount === 1 ? '' : 's'}, {confirmRemove.objectCount} object
          {confirmRemove.objectCount === 1 ? '' : 's'})? You can undo this after.
        </ConfirmModal>
      )}

      {confirmRemoveSection && (
        <ConfirmModal
          title="Remove section?"
          onConfirm={() => {
            onRemoveSection(confirmRemoveSection.sectionId)
            setConfirmRemoveSection(null)
          }}
          onCancel={() => setConfirmRemoveSection(null)}
        >
          "{confirmRemoveSection.name}" still has {confirmRemoveSection.departmentCount} department
          {confirmRemoveSection.departmentCount === 1 ? '' : 's'} in this option. Removing the section removes
          {confirmRemoveSection.departmentCount === 1 ? ' it' : ' them'} too, with their rooms and objects. You can
          undo this after.
        </ConfirmModal>
      )}
    </div>
  )
}
