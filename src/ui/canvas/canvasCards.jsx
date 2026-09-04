// Card chrome shared by BOTH canvases.
//
// The Tree tab and the Project canvas draw the same section box, group box and
// department card, differing only in what goes inside — drag handles and remove
// buttons there, ghosts and areas here. Everything visual lives here so the two
// cannot drift apart again.
//
// Colours always arrive as a resolved palette from data/functions.js; this file
// never reads bg_colour itself.

import { BUILDING_LABEL_HEIGHT, LABEL_HEIGHT, PADDING } from './canvasLayout.js'

// Finer the deeper you go, so nesting reads from the strokes alone. It ran the
// other way once, which made a department look like it contained its group.
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
  // A ghost section's single + goes on the left, where it reads as "add this"
  // against the name it would add.
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
        // Both classes go on the HEADER, not the container. :hover matches every
        // ancestor, so tinting the box would light up a section, its group and
        // its card together whenever the pointer was over any one of them; and a
        // section holds cards with × buttons of their own, which marking the box
        // would reveal all at once.
        className={`spp-hover-tint spp-hover-reveal${headerClassName ? ` ${headerClassName}` : ''}`}
        style={{
          height: LABEL_HEIGHT,
          // Same inset as the cards below, so the two left edges line up.
          padding: `0 ${PADDING}px`,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize,
          fontWeight,
          // A solid body already carries the colour; painting the header again
          // only draws a seam across it.
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

// A building. Deliberately NOT a card: a large name over a rule, with its
// sections beneath it. A section or a group is a box because it is a place you
// drop things into, and the box says where the edge of the drop is. A building
// is never a drop target — its sections carry a column, not a placement — so a
// box would draw an edge that means nothing. It is the heading you scroll
// between.
export function CanvasBandHeading({
  colours,
  name,
  isGhost = false,
  isSelected = false,
  ghostText = '#999',
  // On the NAME, not the band: a band is the full canvas width and almost all
  // empty space, so making it clickable would swallow every click meant for the
  // space around a card. Both canvases pass it — the Tree tab to edit a
  // building's factors, the Project tab to report what is in it.
  onSelect,
  right,
  children,
}) {
  // Selection does NOT recolour this. It turned the rule and name blue once,
  // which threw away the one thing the heading says — a building is drawn in its
  // function's colour, and the selected one was the only heading not telling you
  // what it is. A pale wash of its OWN colour plus a heavier rule reads as "this
  // one" without spending the hue to say it.
  const ink = isGhost ? ghostText : colours.border

  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', pointerEvents: 'auto' }}>
      <div
        style={{
          height: BUILDING_LABEL_HEIGHT,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          // The rule runs the full width of the band: with no border, it is what
          // says how far this building reaches.
          borderBottom: `${isSelected ? 3 : 2}px solid ${ink}`,
          color: ink,
        }}
      >
        <span
          title={name}
          onClick={
            onSelect
              ? (e) => {
                  e.stopPropagation()
                  onSelect()
                }
              : undefined
          }
          // React Flow claims pointer events on the canvas; without these a
          // click on the title pans instead of selecting.
          className={onSelect ? 'nodrag nopan' : undefined}
          onPointerDownCapture={onSelect ? (e) => e.stopPropagation() : undefined}
          style={{
            cursor: onSelect ? 'pointer' : undefined,
            // Shrink-to-fit, not flex: 1 — the wash has to hug the name rather
            // than run the band's width, which would read as a second rule.
            flex: '0 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            opacity: isGhost ? 0.65 : 1,
            // Padding and the negative margin cancelling it are constant, so the
            // name sits at the same x selected or not; only the fill appears.
            padding: '2px 10px',
            marginLeft: -10,
            borderRadius: 4,
            background: isSelected && !isGhost ? colours.inverted.background : undefined,
          }}
        >
          {name}
        </span>
        {/* Holds `right` against the far edge now that the name no longer
            stretches to fill the band. */}
        <span style={{ flex: 1, minWidth: 0 }} />
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
  // A ghost sits on its group's fill, so the caller passes the one colour known
  // to read against it — the group's text colour. These greys are a fallback;
  // hard-coding them made a ghost invisible on a dark group.
  ghostBorder = '#bbb',
  ghostText = '#888',
  isHighlighted = false,
  pulse = false,
  cursor = 'pointer',
  // `nodrag` blocks a drag from starting here, which the Project canvas wants —
  // its cards are click-only. The Tree passes isDraggable, since dragging a card
  // into another group is how the catalog is built. `nopan` stays either way, so
  // a press never drags the canvas out from under the card.
  isDraggable = false,
  onClick,
  title,
  corner,
  children,
}) {
  return (
    <div
      // Safe on the whole card, unlike a container — nothing nested inside a
      // department card carries a × or a tint of its own to be triggered with it.
      className={`spp-hover-tint spp-hover-reveal ${isDraggable ? '' : 'nodrag '}nopan${pulse ? ' tree-drop-pulse' : ''}`}
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
        // Selection stays blue: the fill carries function meaning, so it cannot
        // also signal which card you are editing.
        boxShadow: isGhost
          ? 'none'
          : isHighlighted
            ? '0 0 0 2px #1a73e8, 0 1px 3px rgba(0,0,0,0.15)'
            : '0 1px 3px rgba(0,0,0,0.15)',
        // High enough that a ghost's ink keeps its colour: the dashed edge and
        // flat fill are what mark it as not-yet-added, not fading.
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
