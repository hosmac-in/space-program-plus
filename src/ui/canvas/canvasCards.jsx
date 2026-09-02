// Card chrome shared by BOTH canvases.
//
// The Tree tab and the option Canvas tab draw the same three things — a
// section box, a group box, and a department card — and differ only in what
// goes inside them: Tree has drag handles and remove buttons, the option
// canvas has ghosts, areas and "+ All". Everything visual (fill, border,
// radius, header inset, drop-target and selection states) lives here so the
// two tabs cannot drift apart again.
//
// Colours always arrive as a resolved palette from data/functions.js — this
// file never reads bg_colour itself.

import { BUILDING_LABEL_HEIGHT, LABEL_HEIGHT, PADDING } from './canvasLayout.js'

// A ghost's dashes get finer the deeper you go — section, then group, then
// department — so the nesting reads from the strokes alone, the same way the
// solid borders already do. It ran the other way round: the innermost card had
// the heaviest dash, which made a department look like it contained its group.
const GHOST_DASH = { section: 2, group: 1.5, card: 1 }

// A container: section or group. Both are a solid header strip over a body,
// and differ only in how strongly the body is filled.
//
//   solid   body takes the full function colour (groups)
//   tint    body takes a wash of it, so nested boxes stay readable (sections)
export function CanvasContainer({
  colours,
  name,
  title,
  fill = 'tint',
  tintAlpha = 0.12,
  radius = 8,
  fontSize = 12,
  fontWeight = 600,
  borderWidth = 1,
  isDropTarget = false,
  // The option canvas greys out anything not yet added to the option.
  isGhost = false,
  ghostBorder = '#aaa',
  ghostBg = 'rgba(140, 140, 140, 0.03)',
  ghostText = '#999',
  pulse = false,
  headerClassName,
  // Before the name and after it. A ghost section's single + lives on the
  // left, where it reads as "add this" against the name it would add.
  headerLeft,
  headerRight,
  children,
}) {
  const body = isGhost
    ? ghostBg
    : isDropTarget
      ? fill === 'solid'
        ? colours.emphasis
        : colours.tint(tintAlpha * 2.8)
      : fill === 'solid'
        ? colours.background
        : colours.tint(tintAlpha)

  return (
    <div
      className={pulse ? 'tree-drop-pulse' : undefined}
      style={{
        '--pulse-ring': colours.ring,
        width: '100%',
        height: '100%',
        border: isDropTarget
          ? `2px dashed ${colours.border}`
          : isGhost
            ? `${GHOST_DASH[fill === 'solid' ? 'group' : 'section']}px dashed ${ghostBorder}`
            : `${borderWidth}px solid ${colours.border}`,
        borderRadius: radius,
        background: body,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
      }}
    >
      <div
        className={headerClassName}
        style={{
          height: LABEL_HEIGHT,
          // Same inset as the cards below, so the header text and the left edge
          // of its contents line up.
          padding: `0 ${PADDING}px`,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize,
          fontWeight,
          // A solid body already carries the colour; painting the header again
          // would just draw a seam across it.
          background: isGhost || fill === 'solid' ? 'transparent' : colours.background,
          color: isGhost ? ghostText : fill === 'solid' ? colours.color : colours.color,
          borderRadius: fill === 'solid' ? undefined : `${radius - 1}px ${radius - 1}px 0 0`,
          cursor: headerClassName ? 'grab' : undefined,
          pointerEvents: 'auto',
        }}
      >
        {headerLeft}
        <span
          title={title ?? name}
          style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {name}
        </span>
        {headerRight}
      </div>
      {children}
    </div>
  )
}

// A building. Deliberately NOT a card: no box, no fill, no border — a large
// name over a rule, with its sections sitting beneath it.
//
// A building isn't a container in the way a section or a group is. Those are
// places you drop things into, and their box is what tells you where the edge
// of the drop is. A building is never a drop target — a section's building is a
// column in sp_section, not a placement — so a box around it would draw an edge
// that means nothing and add a fourth nested border to look past.
//
// It reads as a title because that is what it is: the buildings are stacked
// down the canvas, and this is the heading you scroll between.
export function CanvasBandHeading({
  colours,
  name,
  isGhost = false,
  isSelected = false,
  ghostText = '#999',
  right,
  children,
}) {
  // Selection is the rule and the name going blue. There is no box to put a
  // ring around, and blue is what selection means everywhere else on the canvas.
  const ink = isSelected ? '#1a73e8' : isGhost ? ghostText : colours.border

  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', pointerEvents: 'auto' }}>
      <div
        style={{
          height: BUILDING_LABEL_HEIGHT,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          // The rule runs the full width of the band, under the name — the
          // thing that says how far this building reaches, now that no border
          // does.
          borderBottom: `${isSelected ? 3 : 2}px solid ${ink}`,
          color: ink,
        }}
      >
        <span
          title={name}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            opacity: isGhost ? 0.65 : 1,
          }}
        >
          {name}
        </span>
        {right}
      </div>
      {children}
    </div>
  )
}

// A department card. Filled with the inverted palette — a pale wash of its own
// hue — so it stays legible sitting on a group filled with that same colour.
export function CanvasCard({
  colours,
  width,
  height,
  padding = PADDING,
  isGhost = false,
  // A ghost is drawn on top of its group's fill, so the caller passes the one
  // colour known to read against that fill — the group's text colour. The greys
  // are only a fallback: they were once hard-coded here, which made a ghost
  // invisible on a dark group and loud on a pale one.
  ghostBorder = '#bbb',
  ghostText = '#888',
  isHighlighted = false,
  pulse = false,
  cursor = 'pointer',
  // React Flow's `nodrag` blocks a drag from ever starting on this element.
  // The option canvas wants that — its cards are click-only. The Tree
  // does not: dragging a department card into another group is how the catalog
  // is built, so that tab passes isDraggable. `nopan` stays either way, so a
  // press on a card never drags the canvas out from under it.
  isDraggable = false,
  onClick,
  title,
  corner,
  children,
}) {
  return (
    <div
      className={`${isDraggable ? '' : 'nodrag '}nopan${pulse ? ' tree-drop-pulse' : ''}`}
      onClick={onClick}
      title={title}
      style={{
        '--pulse-ring': colours.ring,
        width,
        height,
        border: isGhost ? `${GHOST_DASH.card}px dashed ${ghostBorder}` : `1px solid ${colours.inverted.border}`,
        borderRadius: 8,
        padding,
        background: isGhost ? 'rgba(0,0,0,0.02)' : colours.inverted.background,
        color: isGhost ? ghostText : colours.inverted.color,
        // Selection stays blue everywhere: the fill now carries function
        // meaning, so it can't also signal which card you're editing.
        boxShadow: isGhost
          ? 'none'
          : isHighlighted
            ? '0 0 0 2px #1a73e8, 0 1px 3px rgba(0,0,0,0.15)'
            : '0 1px 3px rgba(0,0,0,0.15)',
        // High enough that the ghost's ink keeps its colour; the dashed edge and
        // flat fill are what mark it as not-yet-added, not fading it out.
        opacity: isGhost ? 0.9 : 1,
        fontSize: 12,
        fontWeight: 600,
        position: 'relative',
        boxSizing: 'border-box',
        cursor,
        pointerEvents: 'auto',
      }}
    >
      {corner}
      {children}
    </div>
  )
}
