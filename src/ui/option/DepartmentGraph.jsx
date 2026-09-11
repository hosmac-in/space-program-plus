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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, ReactFlowProvider } from 'reactflow'
import CanvasFrame, { useCanvasInput } from '../canvas/CanvasFrame.jsx'
import 'reactflow/dist/style.css'
import { useCatalog } from '../../data/catalog.jsx'
import { summarize } from '../../data/optionData.js'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import AddButton from '../primitives/AddButton.jsx'
import RemoveButton from '../primitives/RemoveButton.jsx'
import { useReadOnly } from '../../readOnly.jsx'
import { CanvasBandHeading, CanvasCard, CanvasContainer, DepartmentCardFace } from '../canvas/canvasCards.jsx'
import { CARD_CONTROL, PADDING } from '../canvas/canvasLayout.js'
import { applyMotion, buildLayout, NODE_HEIGHT, NODE_WIDTH } from './departmentGraphLayout.js'
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

// An add or a remove plays out in three beats, and the point of all of it is
// that the move can be FOLLOWED:
//
//   1. the card changes height where it stands   GROW_MS, .spp-card-grow
//   2. nothing at all                            PAUSE_MS
//   3. it travels to its new place, the cards it passes stepping aside one by
//      one as it reaches them                    applyMotion
//
// GROW_MS must match .spp-card-grow's duration in index.css. The pause is what
// separates the two movements: without it the card is still settling into its
// new height as it sets off, and the eye reads one muddled event.
const GROW_MS = 450
const PAUSE_MS = 250
const REORDER_DELAY_MS = GROW_MS + PAUSE_MS

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

  // A ghost strip adds from its + alone — see the note on the card below. The
  // strips are small and adjacent, so a whole-strip hit target was the easiest
  // of all of these to trip by accident.
  const act = ghost ? undefined : () => data.onClick(data.defId, data.treeNodeId, entry.phase)

  return (
    <div
      onClick={act ? (e) => { e.stopPropagation(); act() } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={
        ghost
          ? addable
            ? `Add ${data.name} to phase ${entry.phase} with the +`
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
        cursor: ghost ? 'default' : 'pointer',
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

      {hover && entry.isReal && data.onRequestRemove && (
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
  const addable = ghost && data.canAdd && !!data.onAdd

  // A phased option divides the card into a strip per phase, each added,
  // opened and removed on its own. An unphased one — which is every option
  // until someone says otherwise — draws the card exactly as it always did:
  // one name, one area, one + or one ×.
  if (data.phaseCount > 1) return <PhasedDepartmentCard data={data} />

  return (
    <CanvasCard
      colours={data.colours}
      width={NODE_WIDTH}
      // A ghost's slot is shorter — see GHOST_NODE_HEIGHT. The layout decides
      // it; the card must not have its own opinion.
      height={data.height ?? NODE_HEIGHT}
      // Sides only, ghost or not. The vertical insets belong to the face, so
      // departmentCardHeight is the whole of a card's height; a ghost's one line
      // simply centres in its shorter slot.
      padding={`0 ${PADDING}px`}
      isGhost={ghost}
      ghostBorder={data.ghostInk}
      ghostText={data.ghostInk}
      isHighlighted={data.isHighlighted}
      // THE + ADDS, THE CARD DOES NOT. A ghost is a preview of what is
      // available, and the whole card being a hit target made adding one the
      // easiest thing to do by accident on a canvas you also pan and select in.
      cursor={ghost ? 'default' : 'pointer'}
      onClick={ghost ? undefined : () => data.onClick(data.defId, data.treeNodeId, 1)}
      title={addable ? `Add ${data.name} with the +` : undefined}
      // The + takes the corner the × has on a real card: one control, one place,
      // and the card no longer has to be tall enough to hold it under the name.
      corner={
        addable ? (
          // AddButton has no corner mode of its own — RemoveButton pins itself,
          // this is pinned to the same 4px inset so the two land in one place.
          <span style={{ position: 'absolute', top: 4, right: 4, lineHeight: 0 }}>
            <AddButton
              onClick={() => data.onAdd(data.defId, data.treeNodeId, 1)}
              title={`Add ${data.name} to this option`}
              size={18}
              stopPointerDown
            />
          </span>
        ) : ghost || !data.onRequestRemove ? null : (
          <RemoveButton
            onRemove={() => data.onRequestRemove(data.instanceId, data.name, data.roomCount, data.objectCount)}
            title="Remove department"
            corner
            stopPointerDown
          />
        )
      }
    >
      {/* A GHOST IS ITS NAME AND NOTHING ELSE — no area and no rooms, because it
          is not in the option yet — and it is drawn in a slot one line tall, so
          it keeps its own centred line rather than the shared face. */}
      {ghost ? (
        <div
          title={data.name}
          style={{
            fontWeight: 600,
            fontSize: 13,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            // Clear of the + in the corner.
            paddingRight: 20,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.name}
        </div>
      ) : (
        <DepartmentCardFace
          name={data.name}
          areaSqft={data.areaSqft}
          rooms={data.rooms}
          expanded={data.roomsExpanded}
          onToggleRooms={data.onToggleRooms}
        />
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

function ContainerNode({ data, fill, radius, borderWidth, fontSize, fontWeight, reserveControl = true }) {
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
        reserveControl={reserveControl}
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
        // The figure, then the control column — never both in `headerRight`, or
        // a card with no × pushes its area out to where the next card's isn't.
        //
        // Bold, and no longer dimmed: it is the answer the card is reporting,
        // read down a stack of nested boxes against the ones above and below it,
        // and at 400 and 75% it was the quietest thing on a card whose name is
        // already bold.
        headerRight={
          <span style={{ flexShrink: 0, fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>
            {formatArea(data.totalAreaSqft)} sqft
          </span>
        }
        headerControl={
          data.onRemove ? (
            <RemoveButton
              onRemove={data.onRemove}
              title={`Remove ${data.name} from this option`}
              size={CARD_CONTROL}
              stopPointerDown
            />
          ) : null
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
//
// The NAME is the click target, not the band: a band is the full width of the
// canvas and almost entirely empty space, so making all of it selectable would
// swallow every click meant for the space around a card. CanvasBandHeading puts
// the handler on the name and paints the selected wash there.
function BuildingNode({ data }) {
  return (
    <CanvasBandHeading
      colours={data.colours}
      name={data.name}
      isSelected={data.isSelected}
      onSelect={data.onSelect}
      gutter={data.gutter}
      right={
        <span style={{ fontWeight: 400, fontSize: 13, whiteSpace: 'nowrap', opacity: 0.75, flexShrink: 0 }}>
          {formatArea(data.totalAreaSqft)} sqft
        </span>
      }
    />
  )
}

// Sections and groups are the same component; only the chrome grows as the
// nesting gets shallower. Buildings are not — they have no box at all.
const nodeTypes = {
  department: DepartmentNodeCard,
  root: RootNodeCard,
  // A group is never removed from this canvas — that is the Tree tab's job — so
  // it reserves no control column, and its area figure takes that space instead.
  // The group box's own PADDING inset is the same width, so its figure lands in
  // the same column as the section's one level out.
  groupBox: (props) => <ContainerNode {...props} fill="solid" radius={8} borderWidth={1} reserveControl={false} />,
  sectionBox: (props) => <ContainerNode {...props} radius={10} borderWidth={1.5} fontSize={13} fontWeight={700} />,
  buildingBox: BuildingNode,
}

// A DEPARTMENT + ADDS IT, on the click. There was a confirm dialog here that
// every + went through; it asked nothing the click had not already said, and on
// a canvas whose whole gesture is "click the ghost you want" it was a second
// click for each one.
//
// It also held a place for the questions that will SIZE a department as it is
// added — how many of which room, from the same set the questionnaire authors
// (data/questionnaire.js). That is still where they belong, but they are a
// reader of a document that nothing reads yet, and a dialog kept empty against
// their arrival is a cost paid every day for a feature that has not shipped.
// Removing a department is still confirmed: that one destroys work.

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
  // This option's per-building factor overrides — every area on this canvas is
  // grossed by them. See data/factors.js.
  buildingFactors,
  phaseCount = 1,
  onSelectDepartment,
  // What side is showing: { kind: 'department' | 'group' | 'section' |
  // 'building', id }, or null for nothing — which is the state an option opens
  // in, before anything on the canvas has been clicked.
  selection,
  onSelectContainer,
  selectedDeptInstanceId,
  selectedPhase,
}) {
  const { groups, sections, functions, buildings } = useCatalog()
  // No + and no × anywhere on the canvas. The cards still select and still
  // report their areas — see src/readOnly.jsx.
  const readOnly = useReadOnly()
  const canvasInput = useCanvasInput()
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [confirmRemoveSection, setConfirmRemoveSection] = useState(null)

  // Sections too: a department's grossing factor may be stated on its catalog
  // node rather than on the option, and the areas on these cards have to be the
  // same ones the HUD reports — see data/factors.js.
  const summary = useMemo(
    () =>
      departments.length > 0
        ? summarize(departments, { sections, buildings, buildingFactors })
        : { perDepartment: [] },
    [departments, sections, buildings, buildingFactors]
  )

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

  // TWO STAGES, IN ORDER: the card changes height where it stands, THEN
  // everything slides into the new order. Done in one frame the two read as a
  // single flicker and the move — which is the part that says where the
  // department went — is over before it can be followed.
  //
  // So the arrangement currently on screen is held for REORDER_DELAY_MS while
  // the height eases (the same duration, in .spp-card-grow), and only then
  // dropped, which lets the ghost partition reassert itself and the cards slide.
  //
  // Derived DURING render, not in an effect: an effect runs after the new order
  // has already been painted, which is the one frame this exists to prevent.
  const lastOrderRef = useRef(null)
  const prevRef = useRef({ departments, sectionIds })
  const [frozenOrder, setFrozenOrder] = useState(null)
  // The arrangement the cards are travelling FROM, while beat 3 runs. Null the
  // rest of the time, when every card simply sits in its slot.
  const [travellingFrom, setTravellingFrom] = useState(null)

  if (prevRef.current.departments !== departments || prevRef.current.sectionIds !== sectionIds) {
    prevRef.current = { departments, sectionIds }
    if (lastOrderRef.current) setFrozenOrder(lastOrderRef.current)
  }

  // Beats 1 and 2: hold the arrangement, then release it into the travel.
  useEffect(() => {
    if (!frozenOrder) return
    const id = setTimeout(() => {
      setTravellingFrom(frozenOrder)
      setFrozenOrder(null)
    }, REORDER_DELAY_MS)
    return () => clearTimeout(id)
  }, [frozenOrder])

  // WHICH CARDS HAVE THEIR ROOMS OPEN, by tree node id. Collapsed is the resting
  // state — a band with every list open is the detail view, not the one you read
  // a building in. Here rather than in the card because the layout sizes the
  // stack by each card's height; see buildLayout.
  const [expandedRooms, setExpandedRooms] = useState(() => new Set())
  const toggleRooms = useCallback((treeNodeId) => {
    setExpandedRooms((cur) => {
      const next = new Set(cur)
      if (!next.delete(treeNodeId)) next.add(treeNodeId)
      return next
    })
  }, [])

  const { nodes: rawNodes, order } = useMemo(
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
        buildingFactors,
        functions,
        phaseCount,
        selectedDeptInstanceId,
        selectedPhase,
        selection,
        onSelectContainer,
        onClick: onSelectDepartment,
        // Adds it, there and then — no confirmation. See the note above
        // DepartmentGraph's node types.
        // An add carries the specific tree node the clicked card was drawn from
        // and the phase of the strip within it, so an option entry is always
        // anchored to one placement in one phase — no picker, and never guessed
        // from a definition id.
        onAdd: readOnly
          ? null
          : (defId, treeNodeId, phase) => {
              const def = departmentDefs.find((d) => d.id === defId)
              if (def) handlersRef.current.onAddDepartments([{ def, treeNodeId, phase }])
            },
        onAddSection: readOnly ? null : (sectionId) => handlersRef.current.onAddSection(sectionId),
        onRequestRemoveSection: readOnly ? null : (sectionId, name, departmentCount) => {
          // An empty section holds nothing to lose, so it just goes. One with
          // departments in it takes them with it, which needs saying first.
          if (departmentCount === 0) handlersRef.current.onRemoveSection(sectionId)
          else setConfirmRemoveSection({ sectionId, name, departmentCount })
        },
        onRequestRemove: readOnly ? null : (instanceId, name, roomCount, objectCount, phase) => {
          // Nothing to lose in an empty department, so skip the confirmation.
          if (roomCount === 0 && objectCount === 0) handlersRef.current.onRemoveDepartment(instanceId)
          else setConfirmRemove({ instanceId, name, roomCount, objectCount, phase })
        },
        expandedRooms,
        onToggleRooms: toggleRooms,
        frozenOrder,
      }),
    [
      expandedRooms,
      toggleRooms,
      frozenOrder,
      optionName,
      departmentDefs,
      departments,
      // The band totals are grossed by these; without it a factor change leaves
      // the canvas showing the previous figure until something else re-renders.
      buildingFactors,
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
      readOnly,
    ]
  )

  // Beat 3: each card carries its own delay and duration, so the traveller
  // passes the others one at a time.
  const { nodes, duration } = useMemo(
    () => applyMotion(rawNodes, order, travellingFrom),
    [rawNodes, order, travellingFrom]
  )

  // Cleared once it has played, so a later render doesn't re-apply stale delays
  // to cards that are no longer going anywhere.
  useEffect(() => {
    if (!travellingFrom || duration === 0) return
    const id = setTimeout(() => setTravellingFrom(null), duration)
    return () => clearTimeout(id)
  }, [travellingFrom, duration])

  // What the next layout holds while a card changes height. Written after the
  // render that used it, so it is always the arrangement now on screen.
  useEffect(() => {
    lastOrderRef.current = order
  }, [order])

  // Undo/redo for the open option lives in the app footer, not here — see
  // AppFooter.jsx.
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* An explicit provider: CanvasFrame's gutters sit OUTSIDE <ReactFlow>,
          so they cannot use the one it makes for its own children. */}
      {/* spp-option-canvas: cards SLIDE to their new slot rather than jumping —
          adding or removing a department re-partitions the ghosts, so half a
          group can move at once and an instant redraw reads as the canvas
          having changed rather than a card having moved. See index.css. */}
      <div className="spp-option-canvas" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ReactFlowProvider>
          <CanvasFrame>
            <ReactFlow
              nodes={nodes}
              edges={NO_EDGES}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
              {...canvasInput}
              // NO onPaneClick. Clicking past the boxes used to clear the
              // selection and swing side back to the option's totals, which
              // meant every miss — panning, or aiming at a card and catching
              // the gap — threw away what you were reading. Selection changes
              // only when you hit something: a card, a container header, or a
              // building's name.
            >
              <Background />
            </ReactFlow>
          </CanvasFrame>
        </ReactFlowProvider>
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
