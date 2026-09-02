// The Project tab: the catalog tree drawn as a map, with the departments
// already in this option solid and the rest ghosted. Clicking a ghost adds it;
// clicking a solid one selects it for editing in the right-hand pane.
//
// Only the buildings this option contains are drawn, and this canvas cannot
// change that set: buildings are chosen when the option is created, and edited
// afterwards in a dialog off the option chip in the band above (OptionList).
//
// Within them, sections are added one at a time and filled by hand. A section
// not in the option shows a single + in front of its name and nothing else:
// everything drawn inside it is a preview, inert, because a department cannot
// be in the option unless its section is. Press that + and the section is in;
// its departments then get their own + each and are added individually. So an
// option can hold an empty section — one you haven't filled yet, one you've
// emptied again, or one the catalog gives no groups at all — and a section only
// leaves the option when you remove it with the × in its header.
//
// Groups are never added or removed directly; a group appears exactly when a
// department inside it does.

import { useMemo, useRef, useState } from 'react'
import ReactFlow, { Background } from 'reactflow'
import 'reactflow/dist/style.css'
import { useCatalog } from '../../data/catalog.jsx'
import { summarize } from '../../data/optionData.js'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import Modal from '../primitives/Modal.jsx'
import { PanelNote } from '../panel/panelParts.jsx'
import AddButton from '../primitives/AddButton.jsx'
import RemoveButton from '../primitives/RemoveButton.jsx'
import { CanvasBandHeading, CanvasCard, CanvasContainer } from '../canvas/canvasCards.jsx'
import { buildLayout, NODE_HEIGHT, NODE_WIDTH } from './departmentGraphLayout.js'
import { formatArea } from '../map/area.js'

// Stable identity so React Flow doesn't see a new edge array every render.
// Containment is drawn by nesting boxes and by stacking buildings down the
// canvas, so this canvas has no edges — see the note in departmentGraphLayout.
const NO_EDGES = []

// An unstaged phase strip's dashed edge, at part alpha. color-mix rather than a
// hard-coded rgba: the ink it is given is whatever colour reads against the
// surface behind the strip (see phaseGhostInkFor), and that is not a value this
// can pick apart.
const GHOST_STROKE = (ink) => `color-mix(in srgb, ${ink} 40%, transparent)`

// One phase of one department: in the option or not, independently of its
// neighbours on the same card.
//
// The card is a FIXED size however many phases there are, so the strips divide
// its width and get narrower as the count grows — the area figure is dropped
// past four, where there is no longer room for a number as well as a label.
//
// Both buttons appear only on hover, for that same reason: at six phases a strip
// is barely wider than a button, and a permanent one would leave room for
// nothing else. The whole strip is the click target either way, so nothing is
// unreachable while they are hidden. The × sits in the corner, out of the way of
// the figures it would otherwise cover; the + stays centred, because on an
// empty strip it is the whole point of it.
//
// Nothing here is filled. A strip is drawn in stroke alone — solid once it is in
// the option, dashed and faint while it is not — because the card underneath
// already carries the department's colour, and painting the strips on top of it
// turned one card into a row of competing blocks.
function PhaseStrip({ data, entry, addable }) {
  const [hover, setHover] = useState(false)
  const ghost = !entry.isReal
  const roomy = data.phaseCount <= 4
  const selected = entry.isReal && data.isHighlighted && data.selectedPhase === entry.phase
  const inert = ghost && !addable

  const act = ghost
    ? addable
      ? () => data.onAdd(data.defId, data.treeNodeId, entry.phase)
      : undefined
    : () => data.onClick(data.defId, data.treeNodeId, entry.phase)

  return (
    <div
      onClick={act ? (e) => { e.stopPropagation(); act() } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={
        ghost
          ? addable
            ? `Add ${data.name} to phase ${entry.phase}`
            : undefined
          : `${data.name} — phase ${entry.phase}`
      }
      style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        borderRadius: 4,
        // Stroke only, in the ink of whatever is painted behind this strip —
        // solid for a phase that is in the option, dashed for one that isn't,
        // which is the same ghost idiom every other box on this canvas follows.
        //
        // The dashed one is drawn at part alpha rather than at full strength: a
        // card divided into six of these is a lot of line, and at full weight
        // the empty phases read louder than the staged ones. Mixed into the ink
        // rather than set as the element's opacity, so only the line fades and
        // the label on it stays legible.
        border: ghost
          ? `1px dashed ${GHOST_STROKE(data.phaseGhostInk ?? data.ghostInk ?? '#bbb')}`
          : `1px solid ${data.colours.inverted.border}`,
        background: 'transparent',
        color: 'inherit',
        boxShadow: selected ? '0 0 0 2px #1a73e8' : undefined,
        cursor: inert ? 'default' : 'pointer',
        position: 'relative',
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.1 }}>
        {roomy ? `P${entry.phase}` : entry.phase}
      </span>

      {entry.isReal && roomy && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 400,
            opacity: 0.85,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {formatArea(entry.areaSqft)}
        </span>
      )}

      {/* Both absolutely positioned, so appearing on hover never shifts the
          label underneath them. */}
      {hover && ghost && addable && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AddButton
            onClick={() => data.onAdd(data.defId, data.treeNodeId, entry.phase)}
            title={`Add ${data.name} to phase ${entry.phase}`}
            size={14}
            stopPointerDown
          />
        </div>
      )}

      {hover && entry.isReal && (
        <div style={{ position: 'absolute', top: 1, right: 1 }}>
          <RemoveButton
            onRemove={() =>
              data.onRequestRemove(
                entry.instanceId,
                data.name,
                entry.roomCount,
                entry.objectCount,
                entry.phase
              )
            }
            title={`Remove ${data.name} from phase ${entry.phase}`}
            size={14}
            stopPointerDown
          />
        </div>
      )}
    </div>
  )
}

function DepartmentNodeCard({ data }) {
  const ghost = !data.isReal
  // A department can only be added once its SECTION is in the option, so inside
  // a ghost section every card is inert: no +, no click, no pointer. The
  // section's own + in its header is the only way in, and the cards below it
  // are a preview of what that would bring — see the note on headerLeft.
  const addable = ghost && data.canAdd

  // A phased option divides the card into a strip per phase, each added,
  // opened and removed on its own. An unphased one — which is every option
  // until someone says otherwise — draws the card exactly as it always did:
  // one name, one area, one + or one ×.
  if (data.phaseCount > 1) return <PhasedDepartmentCard data={data} />

  return (
    <CanvasCard
      colours={data.colours}
      width={NODE_WIDTH}
      height={NODE_HEIGHT}
      isGhost={ghost}
      ghostBorder={data.ghostInk}
      ghostText={data.ghostInk}
      isHighlighted={data.isHighlighted}
      cursor={ghost && !addable ? 'default' : 'pointer'}
      onClick={
        ghost
          ? addable
            ? () => data.onAdd(data.defId, data.treeNodeId, 1)
            : undefined
          : () => data.onClick(data.defId, data.treeNodeId, 1)
      }
      title={addable ? 'Click to add to this option' : undefined}
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

      {/* Centred in the space under the name, not tucked in a corner: on an
          addable ghost the + is the whole point of the card, and a solid card
          has its area figure there instead. */}
      {addable && (
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
            onClick={() => data.onAdd(data.defId, data.treeNodeId, 1)}
            title={`Add ${data.name} to this option`}
            size={22}
            stopPointerDown
          />
        </div>
      )}
    </CanvasCard>
  )
}

// The same card, divided into a strip per phase.
//
// The card keeps the fixed size every other card on this canvas has — the
// canvas geometry is shared with the Tree tab and must not move — so the strips
// divide the width it already has rather than the card growing to fit them.
// A tighter padding than the default buys the strips the height to be legible.
//
// The card itself is a ghost only when EVERY phase of it is, which is the same
// rule a group follows over its departments one level up. It carries no click
// and no × of its own: both belong to a phase now, and a card-wide one would
// have to guess which.
function PhasedDepartmentCard({ data }) {
  const ghost = !data.isReal
  const addable = data.canAdd

  return (
    <CanvasCard
      colours={data.colours}
      width={NODE_WIDTH}
      height={NODE_HEIGHT}
      padding={10}
      isGhost={ghost}
      ghostBorder={data.ghostInk}
      ghostText={data.ghostInk}
      // The selection ring belongs to the STRIP, not the card: what side is
      // showing is one phase of this department, and ringing the whole card as
      // well would say the card is what's open.
      isHighlighted={false}
      cursor="default"
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span
            title={data.name}
            style={{
              flex: 1,
              minWidth: 0,
              fontWeight: 600,
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {data.name}
          </span>
          {/* The total across every phase, which is what the figures above this
              card add up. Each strip carries its own share below. */}
          {!ghost && (
            <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75, whiteSpace: 'nowrap' }}>
              {formatArea(data.areaSqft)} sqft
            </span>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 2 }}>
          {data.phases.map((entry) => (
            <PhaseStrip key={entry.phase} data={data} entry={entry} addable={addable} />
          ))}
        </div>
      </div>
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

function ContainerNode({ data, fill, radius, borderWidth, fontSize, fontWeight }) {
  return (
    // Clicking the box selects it, which is what side reads to decide whether
    // to show a group's or a section's contents. The buttons inside stop their
    // own clicks, so pressing × doesn't also select what it just removed.
    <div
      style={{
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
        // A ghost section's ONE control, in front of the name it would add.
        //
        // The whole section used to be an invitation: a floating "Add section"
        // above the box AND a + on every ghost department inside it. That is
        // one section offering a dozen ways in, when there is only one way in —
        // the section has to be in the option before anything can go in it.
        // Everything inside a ghost section is inert until this is pressed.
        headerLeft={
          data.onAdd ? (
            <AddButton
              onClick={data.onAdd}
              title={`Add ${data.name} to this option`}
              size={16}
              stopPointerDown
            />
          ) : null
        }
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

// A building is a band, not a box — see CanvasBandHeading.
//
// It carries no add or remove control, unlike every other container here. Which
// buildings an option contains is settled when the option is created and
// changed in a dialog off the option chip (see OptionList); this canvas draws
// the ones it has and never offers to change the set. So the heading's only
// controls are the area figure and selecting it.
function BuildingNode({ data }) {
  return (
    <div
      style={{ width: '100%', height: '100%', cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation()
        data.onSelect?.()
      }}
    >
      <CanvasBandHeading
        colours={data.colours}
        name={data.name}
        isSelected={data.isSelected}
        right={
          <span style={{ fontWeight: 400, fontSize: 13, whiteSpace: 'nowrap', opacity: 0.75, flexShrink: 0 }}>
            {formatArea(data.totalAreaSqft)} sqft
          </span>
        }
      />
    </div>
  )
}

// Sections and groups are the same component; only the chrome grows as the
// nesting gets shallower. Buildings are not — they have no box at all.
const nodeTypes = {
  department: DepartmentNodeCard,
  root: RootNodeCard,
  groupBox: (props) => <ContainerNode {...props} fill="solid" radius={8} borderWidth={1} />,
  sectionBox: (props) => <ContainerNode {...props} radius={10} borderWidth={1.5} fontSize={13} fontWeight={700} />,
  buildingBox: BuildingNode,
}

// EVERY department + opens this. Nothing on this canvas adds a department on
// the click itself.
//
// Two reasons, and the second is the one that will matter:
//
//  1. A phased option puts a + on every phase of every ghost department — a
//     card of six, a group of several cards — and they are small and adjacent.
//     Adding on the click made a misfire cost a structural write and an undo.
//  2. Adding a department is where it will be SIZED rather than added empty.
//     The questionnaire (see data/questionnaire.js) is being authored to ask
//     exactly those figures — how many of which room — and the same questions,
//     narrowed to this one placement, belong here: they have to be answered
//     before the department exists, not after. This dialog is where they go;
//     the note below holds their place, and nothing else about the flow has to
//     change when they arrive.
//
// The section + is deliberately NOT gated this way: it adds a shell, has
// nothing to ask, and there is one of it per section rather than one per phase
// per department.
function AddDepartmentModal({ phase, phaseCount, name, copiedFrom, onConfirm, onCancel }) {
  return (
    <Modal title={`Add ${name}`} onClose={onCancel}>
      <p style={{ fontSize: 13, margin: '0 0 12px' }}>
        {phase != null && phaseCount > 1
          ? `Adds ${name} to phase ${phase} of this option.`
          : `Adds ${name} to this option.`}
      </p>

      {copiedFrom != null && (
        <p style={{ fontSize: 12, color: '#777', margin: '0 0 12px' }}>
          It starts as a copy of phase {copiedFrom} — its rooms and objects, to edit from there. Each phase is
          programmed on its own after that; editing one never changes another.
        </p>
      )}

      <PanelNote>
        The questions that size this department go here — how many of which room. Not asked yet, so it starts
        empty{copiedFrom != null ? ' unless it copied a phase' : ''}.
      </PanelNote>

      <button type="button" onClick={onConfirm} style={{ marginTop: 16 }}>
        Add department
      </button>
    </Modal>
  )
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
  buildingIds,
  phaseCount = 1,
  onSelectDepartment,
  // What side is showing: { kind: 'department' | 'group' | 'section' |
  // 'building', id }, or null for nothing — which is what a click on empty
  // canvas produces.
  selection,
  onSelectContainer,
  onClearSelection,
  selectedDeptInstanceId,
  selectedPhase,
}) {
  const { groups, sections, functions, buildings } = useCatalog()
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [confirmRemoveSection, setConfirmRemoveSection] = useState(null)
  // Which department the add dialog is open for — see AddDepartmentModal. Every
  // department + goes through it; none adds on the click itself.
  const [addTarget, setAddTarget] = useState(null)

  const summary = useMemo(
    () => (departments.length > 0 ? summarize(departments) : { perDepartment: [] }),
    [departments]
  )

  // Both add paths carry the specific tree node the clicked card was drawn
  // from, and the phase of the strip within it, so an option entry is always
  // anchored to exactly one placement in exactly one phase — no picker, no
  // guessing from a definition id.
  function toEntries(pairs) {
    return pairs
      .map(({ defId, treeNodeId, phase }) => {
        const def = departmentDefs.find((d) => d.id === defId)
        return def ? { def, treeNodeId, phase } : null
      })
      .filter(Boolean)
  }

  // The writing handlers come from App's builderState, whose identity changes
  // every render — so listing them as memo dependencies would rebuild every
  // node on every render, and leaving them out (which is what this did) meant
  // the layout's callbacks closed over whichever ones existed the last time it
  // ran. A ref re-pointed each render is the way out, the same one
  // useTreeEditor.jsx uses: the callbacks below read it at call time, so they
  // are always current without being a dependency at all.
  const handlersRef = useRef(null)
  handlersRef.current = {
    onAddDepartments,
    onRemoveDepartment,
    onAddSection,
    onRemoveSection,
  }

  const { nodes } = useMemo(
    () =>
      buildLayout({
        optionName,
        departmentDefs,
        departments,
        perDepartment: summary.perDepartment,
        groups,
        sections,
        sectionIds,
        buildings,
        buildingIds,
        functions,
        phaseCount,
        selectedDeptInstanceId,
        selectedPhase,
        selection,
        onSelectContainer,
        onClick: onSelectDepartment,
        // Opens the dialog rather than adding. Nothing on this canvas adds a
        // department on the click itself — see AddDepartmentModal.
        onAdd: (defId, treeNodeId, phase) => setAddTarget({ defId, treeNodeId, phase }),
        onAddSection: (sectionId) => handlersRef.current.onAddSection(sectionId),
        onRequestRemoveSection: (sectionId, name, departmentCount) => {
          // An empty section holds nothing to lose, so it just goes. One with
          // departments in it takes them with it, which needs saying first.
          if (departmentCount === 0) handlersRef.current.onRemoveSection(sectionId)
          else setConfirmRemoveSection({ sectionId, name, departmentCount })
        },
        onRequestRemove: (instanceId, name, roomCount, objectCount, phase) => {
          // Nothing to lose in an empty department, so skip the confirmation.
          if (roomCount === 0 && objectCount === 0) handlersRef.current.onRemoveDepartment(instanceId)
          else setConfirmRemove({ instanceId, name, roomCount, objectCount, phase })
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
      buildings,
      buildingIds,
      phaseCount,
      functions,
      selectedDeptInstanceId,
      selectedPhase,
      selection,
      onSelectContainer,
      onSelectDepartment,
    ]
  )

  // Undo/redo for the open option lives in the app footer, not here — see
  // AppFooter.jsx.
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={NO_EDGES}
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

      {addTarget && (
        <AddDepartmentModal
          phase={addTarget.phase}
          phaseCount={phaseCount}
          name={departmentDefs.find((d) => d.id === addTarget.defId)?.name ?? 'department'}
          // What a new phase entry would copy: the highest phase of this same
          // placement below the one being added. Said before you commit, since
          // it decides whether you land on an empty department or a full one.
          copiedFrom={
            departments
              .filter((d) => d.treeNodeId === addTarget.treeNodeId && d.phase < addTarget.phase)
              .sort((a, b) => b.phase - a.phase)[0]?.phase ?? null
          }
          onCancel={() => setAddTarget(null)}
          onConfirm={() => {
            handlersRef.current.onAddDepartments(toEntries([addTarget]))
            setAddTarget(null)
          }}
        />
      )}

      {confirmRemove && (
        <ConfirmModal
          title="Remove department?"
          onConfirm={() => {
            onRemoveDepartment(confirmRemove.instanceId)
            setConfirmRemove(null)
          }}
          onCancel={() => setConfirmRemove(null)}
        >
          Remove "{confirmRemove.name}"
          {confirmRemove.phase != null && phaseCount > 1 ? ` from phase ${confirmRemove.phase}` : ''} and everything
          inside it ({confirmRemove.roomCount} room
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
