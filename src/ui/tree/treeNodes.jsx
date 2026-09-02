// Presentation for the Tree canvas: the three card types React Flow
// renders, the carousel rows above and below it, and the stylesheet they share.
// No data access, no tree logic.

import RemoveButton from '../primitives/RemoveButton.jsx'
import { functionColours } from '../../data/functions.js'
import { CanvasBandHeading, CanvasCard, CanvasContainer } from '../canvas/canvasCards.jsx'
import { NODE_HEIGHT, NODE_WIDTH, PADDING } from './treeLayout.js'
import { BandRow } from '../primitives/Band.jsx'

export const CANVAS_STYLE = `
  /* Settling into a new slot after a drop: slow, with a little overshoot. */
  .react-flow__node:not(.dragging) {
    transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
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
// drag handles and remove buttons, that one has ghosts and area totals.
//
// RemoveButton is the only way to send a card back to the carousel — dragging
// a card to empty canvas deliberately does nothing.
function HDepartmentCard({ data }) {
  return (
    <CanvasCard
      colours={data.colours}
      width={NODE_WIDTH}
      height={NODE_HEIGHT}
      padding={`0 26px 0 ${PADDING}px`}
      isHighlighted={data.isHighlighted}
      pulse={data.pulse}
      cursor={data.canEdit ? 'grab' : 'pointer'}
      isDraggable={data.canEdit}
      onClick={() => data.onSelect()}
      corner={
        data.onRemove ? (
          <RemoveButton onRemove={data.onRemove} title="Remove from group" corner stopPointerDown />
        ) : null
      }
    >
      <span style={{ display: 'flex', alignItems: 'center', height: '100%', minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.name}</span>
      </span>
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
      headerRight={
        data.onRemove ? (
          <RemoveButton onRemove={data.onRemove} title="Remove from section" size={16} stopPointerDown />
        ) : null
      }
    >
      {data.isEmpty && data.canEdit && (
        <div style={{ padding: `0 ${PADDING}px`, fontSize: 11, opacity: 0.7, color: data.colours.color }}>
          Drop departments here
        </div>
      )}
    </CanvasContainer>
  )
}

// Sections are fixtures: never dragged, never removed from the canvas.
function HSectionBoxCard({ data }) {
  return (
    <CanvasContainer
      colours={data.colours}
      name={data.name}
      radius={10}
      borderWidth={1.5}
      fontSize={13}
      fontWeight={700}
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
    <CanvasBandHeading colours={data.colours} name={data.name}>
      {data.isEmpty && (
        <div style={{ paddingTop: PADDING, fontSize: 12, color: '#8a8a8a' }}>
          No sections in this building yet — add one in the Supabase table editor.
        </div>
      )}
    </CanvasBandHeading>
  )
}

export const nodeTypes = {
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
    <BandRow title={title} last={last}>
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
