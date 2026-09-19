// Presentation for the Tree canvas: the three card types React Flow
// renders, the carousel rows above and below it, and the stylesheet they share.
// No data access, no tree logic.

import { functionColours } from '../../data/functions.js'
import { CanvasBandHeading, CanvasCard, CanvasContainer, DepartmentCardFace } from '../canvas/canvasCards.jsx'
import { NODE_HEIGHT, NODE_WIDTH, PADDING } from './treeLayout.js'
import { DEPTH } from '../canvas/canvasLayout.js'
import { guideNodeTypes } from '../canvas/CanvasGuides.jsx'
import { BandRow } from '../primitives/Band.jsx'
import { removeHint } from '../primitives/RemoveButton.jsx'

// How long a group's collapse runs. Exported because TreeCanvas has to hold the
// class below for exactly as long as the rule it switches on.
export const COLLAPSE_MS = 420

export const CANVAS_STYLE = `
  /* Settling into a new slot after a drop: slow, with a little overshoot. */
  .react-flow__node:not(.dragging) {
    transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  /* COLLAPSING A GROUP IS NOT A DROP. The spring above is a card being released
     from the pointer, which is why it is allowed to sail past its slot; here
     every box below the group moves at once while the group itself changes
     height, and an overshoot on all of it at once reads as a jerk rather than as
     one thing opening. Ease-out, the same curve the option canvas uses — and the
     HEIGHT with it, so the box shrinks instead of snapping and the rest sliding
     to catch up. React Flow sets the height on the node wrapper, so this is the
     element that can animate it. */
  .tree-collapsing .react-flow__node:not(.dragging) {
    transition:
      transform ${COLLAPSE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1),
      height ${COLLAPSE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @media (prefers-reduced-motion: reduce) {
    .tree-collapsing .react-flow__node:not(.dragging) { transition: none; }
  }
  /* Riding along inside a group that's being dragged. A child is a DOM sibling
     of its parent, so its transform is re-set on every drag frame — the spring
     above would make it trail ~300ms behind and, because that easing
     overshoots, swing outside the group box. Short and ease-out keeps the
     faintest sense of follow without the card ever visibly lagging. */
  .react-flow__node.tree-follow {
    transition: transform 0ms ease-out !important;
  }
  /* Elevation while dragging is set on the node itself (see TreeCanvas),
     not here: React Flow renders children as DOM siblings, so a blanket
     z-index on the dragged node would lift a group above its own
     departments. */
  .react-flow__node > div {
    transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease, background-color 150ms ease;
  }
  .react-flow__node.dragging > div {
    box-shadow: 0 10px 24px rgba(0,0,0,0.3);
    cursor: grabbing !important;
  }
  /* Only a department scales up while dragged. A group box would grow away
     from the department cards riding along inside it. */
  .react-flow__node-tDepartment.dragging > div {
    transform: scale(1.05);
  }
  @keyframes treeDropPulse {
    0% { box-shadow: 0 0 0 0 var(--pulse-ring, rgba(26,115,232,0.55)); }
    100% { box-shadow: 0 0 0 16px transparent; }
  }
  .tree-drop-pulse { animation: treeDropPulse 450ms ease-out; }
  /* A search landing on one room row, inside an already-pulsing card — a
     background wash rather than a ring, since a text row has no box to ring. */
  @keyframes treeRoomPulse {
    0% { background-color: rgba(26,115,232,0.35); }
    100% { background-color: transparent; }
  }
  .tree-room-pulse { animation: treeRoomPulse 900ms ease-out; border-radius: 3px; }
  .tree-carousel-item {
    transition: transform 100ms ease, box-shadow 150ms ease, border-color 150ms ease;
  }
  .tree-carousel-item:hover {
    border-color: #99b8ea !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.18);
  }
  .tree-carousel-item:active { transform: scale(0.96); }
`

// Chrome for all three shapes comes from ui/canvas/canvasCards.jsx, shared with
// the option Canvas tab. Only the interactive parts are local: this tab has
// drag handles and removal, that one has ghosts and area totals.
//
// A RIGHT-CLICK ON THE ENDPOINT is the only way to send a card back to the
// carousel — dragging a card to empty canvas deliberately does nothing.
function HDepartmentCard({ data }) {
  return (
    <CanvasCard
      colours={data.colours}
      width={NODE_WIDTH}
      // The layout grew this card by its room list — it must draw at exactly
      // that height or the cards below it in the group stop lining up.
      height={data.height ?? NODE_HEIGHT}
      isHighlighted={data.isHighlighted}
      pulse={data.pulse}
      cursor={data.canEdit ? 'grab' : 'pointer'}
      isDraggable={data.canEdit}
      onClick={() => data.onSelect()}
    >
      {/* THE SAME FACE THE OPTION CANVAS DRAWS. No area: a catalog department
          has none of its own until an option sizes its rooms, and its rooms
          carry no count — see DepartmentCardFace. Removal is a right-click on
          the endpoint; there is no × on a card any more. */}
      <DepartmentCardFace
        name={data.name}
        rooms={data.rooms}
        expanded={data.roomsExpanded}
        onToggleRooms={data.onToggleRooms}
        onRemove={data.onRemove}
        removeTitle={removeHint('from this group')}
        highlightRoomKey={data.highlightRoomKey}
      />
    </CanvasCard>
  )
}

function HGroupBoxCard({ data }) {
  return (
    <CanvasContainer
      colours={data.colours}
      name={`⠿ ${data.name}`}
      title={data.name}
      fill="solid"
      isDropTarget={data.isDropTarget}
      pulse={data.pulse}
      // Only the header strip drags the group — see dragHandle in the layout.
      headerClassName={data.canEdit ? 'group-drag-handle' : undefined}
      // A group's cards can run to a screenful; a section is read by which
      // groups it holds. Collapsing is available to everyone, editor or not —
      // it changes nothing stored.
      collapsible
      isCollapsed={data.isCollapsed}
      onToggleCollapse={data.onToggleCollapse}
      depth={DEPTH.group}
      onRemove={data.onRemove}
      removeTitle={removeHint('from this section')}
    >
      {data.isEmpty && data.canEdit && (
        <div style={{ padding: `0 ${PADDING}px`, fontSize: 11, opacity: 0.7, color: data.colours.color }}>
          Drop departments here
        </div>
      )}
    </CanvasContainer>
  )
}

// A section is never removed from the canvas — it is a row in sp_section, added
// and deleted in the table editor. It IS draggable, but only sideways within its
// own building, which is what writes sp_section.sort_order. The core section
// stays a fixture: it has no place in the row to be moved to.
function HSectionBoxCard({ data }) {
  return (
    <CanvasContainer
      colours={data.colours}
      name={data.isDraggable ? `⠿ ${data.name}` : data.name}
      title={data.name}
      headerClassName={data.isDraggable ? 'section-drag-handle' : undefined}
      radius={10}
      borderWidth={1.5}
      fontSize={13}
      fontWeight={700}
      depth={DEPTH.section}
      isDropTarget={data.isDropTarget}
      pulse={data.pulse}
    >
      {data.isEmpty && (
        <div style={{ padding: `${PADDING}px`, fontSize: 12, color: '#8a8a8a' }}>
          {data.canEdit ? 'Drop groups here' : 'Empty'}
        </div>
      )}
    </CanvasContainer>
  )
}

// A building is a band across the canvas holding its sections: a title over a
// rule, with no box. Nothing is ever dragged into or out of one — a section's
// building is a column in sp_section, not a placement — so there is no drop
// edge to draw. See CanvasBandHeading.
function HBuildingBoxCard({ data }) {
  return (
    <CanvasBandHeading
      colours={data.colours}
      name={data.name}
      isSelected={data.isSelected}
      gutter={data.gutter}
      // The band is the full width of the canvas and mostly empty space, so
      // only the heading itself takes the click — see CanvasBandHeading, which
      // wires onSelect to the title rather than to the band.
      onSelect={data.onSelect}
    >
      {data.isEmpty && (
        <div style={{ paddingTop: PADDING, fontSize: 12, color: '#8a8a8a' }}>
          No sections in this building yet — add one in the Supabase table editor.
        </div>
      )}
    </CanvasBandHeading>
  )
}

export const nodeTypes = {
  // The tree itself, as one drawing over the boxes — see CanvasGuides.jsx.
  ...guideNodeTypes,
  tDepartment: HDepartmentCard,
  tGroupBox: HGroupBoxCard,
  tSectionBox: HSectionBoxCard,
  tBuildingBox: HBuildingBoxCard,
}

// Carousel items use native HTML5 drag-and-drop, not React Flow's — they start
// outside the canvas, so there is no React Flow node to drag.
//
// Coloured the same way the canvas colours them — solid for a group, inverted
// for a department — so an item looks the same before and after it's placed.
//
// Every item looks and behaves identically however many times it has been
// placed. There is deliberately no "already used" treatment of any kind — see
// the carousel comment in TreeCanvas.jsx for why that matters.
function CarouselItem({ label, kind, id, colours, onItemDragStart, onItemDragEnd }) {
  const tone = kind === 'department' ? colours.inverted : colours
  return (
    <div
      className="tree-carousel-item"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/json', JSON.stringify({ kind, id }))
        onItemDragStart?.(kind, id)
      }}
      onDragEnd={() => onItemDragEnd?.()}
      style={{
        flexShrink: 0,
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        border: `1px solid ${tone.border}`,
        borderRadius: 8,
        background: tone.background,
        color: tone.color,
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        cursor: 'grab',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </div>
  )
}

export function CarouselRow({ title, items, kind, functions, last = false, onItemDragStart, onItemDragEnd }) {
  return (
    <BandRow title={title} last={last} scroller>
      {items.length === 0 ? (
        <span style={{ fontSize: 12, color: '#bbb' }}>Nothing available</span>
      ) : (
        items.map((item) => (
          <CarouselItem
            key={item.id}
            label={item.name}
            kind={kind}
            id={item.id}
            colours={functionColours(functions, item.function_id)}
            onItemDragStart={onItemDragStart}
            onItemDragEnd={onItemDragEnd}
          />
        ))
      )}
    </BandRow>
  )
}
