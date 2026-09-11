// Card chrome shared by BOTH canvases.
//
// The Tree tab and the Project canvas draw the same section box, group box and
// department card, differing only in what goes inside — drag handles and remove
// buttons there, ghosts and areas here. Everything visual lives here so the two
// cannot drift apart again.
//
// Colours always arrive as a resolved palette from data/functions.js; this file
// never reads bg_colour itself.

import {
  BUILDING_LABEL_HEIGHT,
  CARD_CONTROL,
  CARD_CONTROL_INSET,
  CORE_GAP,
  FIGURE_INSET_NESTED,
  HEADER_GAP,
  DEPT_CARET,
  DEPT_CARET_COL,
  DEPT_CONTROL_INSET,
  DEPT_HEAD_INSET,
  DEPT_NAME_ROW,
  LABEL_HEIGHT,
  PADDING,
  ROOM_LINE_HEIGHT,
} from './canvasLayout.js'
import { formatArea } from '../map/area.js'

// WHAT A DEPARTMENT IS MADE OF, not just how big it is. The figure on a card
// answers the second question and nothing on either canvas answered the first —
// a department had to be opened one at a time to read a building.
//
// COLLAPSED BY DEFAULT, behind the caret beside the name. A band of cards all
// showing their rooms is the detail view, not the resting one — the thing being
// read across a building is which departments it holds and how big they are.
//
// INDENTED BY THE CARET'S COLUMN, so a room name starts exactly under the
// department's name and the rule runs down through the caret itself.
//
// Smaller and quieter than the name above it. This is the card's detail, and at
// the same weight a column of them out-shouts the headings a building band is
// scanned by.
//
// A `count` is written only when there is MORE THAN ONE. "Reception ×1" is
// "Reception" spelled longer, and a column of ×1s buries the counts worth
// seeing. The Tree tab passes none at all — a catalog room has no count, since
// how many of a room a facility holds is the size of a program rather than a
// fact about the room (see data/tree.js).
// A RULE DOWN THE LIST WITH A TICK TO EACH ROOM, drawn in the indent rather than
// beside the text — so the indent says "these belong to the card above" instead
// of being empty space the eye has to infer the relationship across. It is the
// same crosshair idea the core section is pinned to the building band with.
//
// The rule stops at the LAST room's tick rather than running to the bottom of
// the list: a line continuing past the last item reads as "and more", which is
// the one thing this list must never say.
// Down the caret's centre, so the rule reads as coming out of the control that
// opened the list.
const RULE_LEFT = DEPT_CARET / 2
const TICK_GAP = 3
const RULE_DOT = 4
export function CardRoomList({ rooms }) {
  if (!rooms?.length) return null
  return (
    <div
      style={{
        marginTop: 4,
        paddingLeft: DEPT_CARET_COL,
        fontWeight: 400,
        opacity: 0.8,
        minWidth: 0,
        position: 'relative',
      }}
    >
      {/* The rule and every tick in ONE layer, positioned by index off the fixed
          line height — not one tick per row. A row is `overflow: hidden` so its
          name can ellipsise, and anything drawn in the indent from inside it is
          clipped away by exactly that. */}
      <span
        style={{
          position: 'absolute',
          left: RULE_LEFT,
          // Up into the gap above the first line, so the rule reads as coming
          // down from the name rather than starting on its own.
          top: -4,
          // The centre of the last line, where its tick is.
          bottom: ROOM_LINE_HEIGHT / 2,
          borderLeft: '1px solid currentColor',
        }}
      />
      {/* A dot where the rule begins. The rule otherwise starts on a cut edge in
          the middle of the gap, which reads as a line continuing up from
          somewhere off the card rather than as one that starts here. Centred on
          the rule's own top point, so it caps it rather than sitting beside it. */}
      <span
        style={{
          position: 'absolute',
          left: RULE_LEFT + 0.5 - RULE_DOT / 2,
          top: -4 - RULE_DOT / 2,
          width: RULE_DOT,
          height: RULE_DOT,
          borderRadius: '50%',
          background: 'currentColor',
        }}
      />
      {rooms.map((room, i) => (
        <span
          key={`tick-${room.key}`}
          style={{
            position: 'absolute',
            left: RULE_LEFT,
            width: DEPT_CARET_COL - RULE_LEFT - TICK_GAP,
            top: i * ROOM_LINE_HEIGHT + ROOM_LINE_HEIGHT / 2,
            borderTop: '1px solid currentColor',
          }}
        />
      ))}
      {rooms.map((room) => (
        <div
          key={room.key}
          title={room.count > 1 ? `${room.count} × ${room.name}` : room.name}
          style={{
            fontSize: 10,
            // Italic, like every other figure this app states rather than lets
            // you edit: these are the card's contents, not its heading.
            fontStyle: 'italic',
            // The layouts sized this card on exactly this line height, which is
            // also what puts each tick against its own row.
            lineHeight: `${ROOM_LINE_HEIGHT}px`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {room.name}
          {room.count > 1 && <span style={{ opacity: 0.7 }}> ×{room.count}</span>}
        </div>
      ))}
    </div>
  )
}

// EVERYTHING INSIDE A DEPARTMENT CARD, on BOTH canvases: the name, the area
// figure beside it, and the rooms under them. Sized by departmentCardHeight.
//
// This was written twice, once per tab, and the copies had already drifted — the
// room list reached one of them and not the other. What is genuinely per-tab is
// what a card DOES, not what it says: the Tree tab's drag and remove, this tab's
// ghosts, phases and add. Those stay in their own files, around this.
//
// THE AREA SITS TOP-RIGHT, ON THE NAME'S ROW, not on a line of its own. Under
// the name it pushed the room list down by a whole line and left the card
// reading as three separate things; beside it, the name and its size are one
// statement and the list starts directly under them. `DEPT_CONTROL_INSET` is
// what keeps it clear of the × in the corner, which does not move.
//
// With no list open the name simply centres in the card, which is how both tabs
// drew it before there was one.
//
// `expanded` and `onToggleRooms` come from ABOVE THE LAYOUT, not from state in
// here: the card's height is what the layout stacks the group by, so a card that
// opened itself would grow over its neighbours. See DepartmentGraph/TreeCanvas.
export function DepartmentCardFace({ name, areaSqft, rooms, expanded = false, onToggleRooms }) {
  const hasRooms = rooms?.length > 0
  const listed = hasRooms && expanded
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minWidth: 0,
        justifyContent: listed ? 'flex-start' : 'center',
        // The card itself carries no vertical padding — see departmentCardHeight,
        // which is this inset, the name row, the list, and this inset again.
        paddingTop: listed ? DEPT_HEAD_INSET : 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: HEADER_GAP,
          minWidth: 0,
          height: listed ? DEPT_NAME_ROW : undefined,
          paddingRight: DEPT_CONTROL_INSET,
        }}
      >
        {/* The column is always here, even with no caret in it — see
            DEPT_CARET. `nodrag`/`nopan` and the stopped pointerdown are what
            keep the click from panning the canvas or starting a card drag;
            stopPropagation keeps it from selecting the department, which is
            what clicking the card itself means. */}
        <span
          className={hasRooms ? 'nodrag nopan' : undefined}
          onPointerDown={hasRooms ? (e) => e.stopPropagation() : undefined}
          onClick={
            hasRooms
              ? (e) => {
                  e.stopPropagation()
                  onToggleRooms?.()
                }
              : undefined
          }
          title={hasRooms ? (expanded ? 'Hide rooms' : `Show ${rooms.length} rooms`) : undefined}
          style={{
            flexShrink: 0,
            width: DEPT_CARET,
            // Against the name's baseline row rather than the text baseline —
            // a glyph aligned to a baseline sits visibly low.
            alignSelf: 'center',
            textAlign: 'center',
            fontSize: 9,
            lineHeight: 1,
            opacity: hasRooms ? 0.7 : 0,
            cursor: hasRooms ? 'pointer' : 'default',
            userSelect: 'none',
            transition: 'transform 150ms ease',
            transform: expanded ? 'rotate(90deg)' : 'none',
          }}
        >
          ▶
        </span>
        <span
          title={name}
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            fontSize: 13,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
        {/* The Tree tab passes none: a catalog department has no area of its
            own until an option sizes its rooms. */}
        {areaSqft != null && (
          <span style={{ flexShrink: 0, opacity: 0.75, whiteSpace: 'nowrap' }}>{formatArea(areaSqft)} sqft</span>
        )}
      </div>
      {listed && <CardRoomList rooms={rooms} />}
    </div>
  )
}

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
  // The header's ONE control — a × on a section, nothing on a group. It gets a
  // column of its own so that `headerRight` (the area figure) ends at the same
  // x on every card at this level whether or not that particular card can be
  // removed: a ghost section has no × and a real one does, and packing the
  // button into headerRight put their figures in two different places.
  headerControl = null,
  // Whether to hold that column open at all. A LEVEL decides it, never a card —
  // sections reserve it, groups do not.
  //
  // A group reclaiming the space is what lines its figure up with the section's
  // one level out: a group box is inset by PADDING, and PADDING is the width of
  // the control column, so the two cancel and the figures land in one column
  // down the nesting.
  reserveControl = true,
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
          // Left: the same inset as the cards below, so the two left edges line
          // up.
          //
          // Right: with a control column, what that control needs to sit equally
          // off all three of its edges. Without one, the whole of what the
          // column and its gap would have cost, LESS the PADDING this card is
          // already inset by inside its parent — which is what puts its figure
          // in the same column as its parent's. See FIGURE_INSET.
          paddingLeft: PADDING,
          paddingRight: reserveControl ? CARD_CONTROL_INSET : FIGURE_INSET_NESTED,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: HEADER_GAP,
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
        {reserveControl && (
          <span
            style={{
              width: CARD_CONTROL,
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {headerControl}
          </span>
        )}
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
  // How far the core-section gutter reaches to the LEFT of this band (0 when no
  // building has a core). The rule is extended back across it and a vertical
  // rule dropped at the band's left edge, so the gutter reads as part of this
  // building rather than as something floating beside it — the two together are
  // the cross the core sits under. See ui/tree/treeLayout.js.
  gutter = 0,
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
    <div
      style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', pointerEvents: 'auto' }}
    >
      {gutter > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            // Centred in the gap, not on the band's edge: the rule divides the
            // core from the row, and against the first section's edge it read as
            // that section's border rather than as the building's own line.
            // The half-width keeps the STROKE centred, not its left edge.
            left: -CORE_GAP / 2 - (isSelected ? 1.5 : 1),
            top: 0,
            bottom: 0,
            borderLeft: `${isSelected ? 3 : 2}px solid ${ink}`,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          height: BUILDING_LABEL_HEIGHT,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          // The rule runs the full width of the band: with no border, it is what
          // says how far this building reaches. It starts back at the gutter's
          // left edge, so the core sits under this building's rule too.
          marginLeft: -gutter,
          width: `calc(100% + ${gutter}px)`,
          borderBottom: `${isSelected ? 3 : 2}px solid ${ink}`,
          color: ink,
        }}
      >
        {/* Holds the name at the band's own left edge while the rule above
            reaches further back. */}
        {gutter > 0 && <span style={{ flex: `0 0 ${gutter - 12}px` }} />}
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
      // spp-card-grow: a card that changes height — a ghost being added, which
      // goes from one line to the full card — eases into it instead of jumping.
      className={`spp-card-grow spp-hover-tint spp-hover-reveal ${isDraggable ? '' : 'nodrag '}nopan${pulse ? ' tree-drop-pulse' : ''}`}
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
