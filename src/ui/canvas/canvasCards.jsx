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
  CARET_RING,
  controlInset,
  CORE_GAP,
  DEPTH,
  HEADER_GAP,
  DEPT_CARET,
  DEPT_HEAD_INSET,
  DEPT_NAME_ROW,
  ROOM_GROUP_STEP,
  ROOM_INDENT,
  ROOM_LINE_HEIGHT,
  ROOM_LIST_TOP,
  ROW_HEIGHT,
  ROW_INSET,
  SECTION_BORDER,
  SECTION_SHADOW,
} from './canvasLayout.js'
import { formatArea } from '../map/area.js'
import { useAreaUnit } from '../AreaUnitContext.jsx'
import DisclosureCaret from '../primitives/DisclosureCaret.jsx'
import { withRemoveHint } from '../primitives/RemoveButton.jsx'

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
// THE AREA FIGURE, ONE TYPE AT EVERY LEVEL. A section's, a group's and a card's
// are read DOWN one column — that is what the datum in canvasLayout.js is for —
// and three sizes down a column reads as three kinds of number rather than one
// measurement at three scales. They were 11 bold, 12 at three-quarter ink and
// 10 regular.
//
// Not dimmed: it is the answer the row is reporting, read against the rows above
// and below it, and at 75% it was the quietest thing on a card whose name is
// already bold.
//
// The building band is deliberately NOT this. It is a heading over a rule rather
// than a row in the column, and its figure is set against 30px type.
const FIGURE_SIZE = 11
export function CanvasFigure({ areaSqft }) {
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()
  if (areaSqft == null) return null
  return (
    <span style={{ flexShrink: 0, fontSize: FIGURE_SIZE, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {formatArea(toDisplay(areaSqft))} {AREA_UNIT}
    </span>
  )
}

// A ROW, AT EVERY LEVEL AND ON BOTH CANVASES: a section header, a group header,
// a department card's head. Three columns — see the row grid in canvasLayout.js:
//
//     [endpoint] [name ................] [figure]
//
// THE FIGURE IS THE LAST THING ON THE ROW. There was a control column after it
// once, holding a × — every row paid for that column whether or not it had one,
// and the areas were read against a right edge that was mostly empty. Removal is
// a right-click on the endpoint now, so the column went and the figures moved
// out to the datum. `controlInset(depth)` is still the only thing that may set
// the right padding: it is what keeps a card's figure on the same line as the
// section two levels above it.
//
// THE ROW DRAWS NO PART OF THE TREE. It did once — a stub through its own left
// edge, a dot, a drop piece — each in its own box's ink, and four inks meeting at
// four walls never read as one line however exactly they met. The tree is one
// drawing over the whole canvas now (CanvasGuides.jsx).
//
// WHAT THE ROW OWES IT IS THE ENDPOINT COLUMN: the place every branch lands, and
// the only thing in the row that answers a pointer there. It holds the toggle,
// or a ghost's +, and it carries the right-click that removes the thing — which
// is why it is reserved at every level whether or not this row has any of them.
export function CanvasRow({
  depth,
  // What stands at the end of this row's branch: a blank DisclosureCaret (the
  // tree draws the ring), an AddButton on a ghost, or nothing at all.
  caret = null,
  // RIGHT-CLICK ON THE ENDPOINT REMOVES, and always through a prompt — nothing
  // on either canvas is removed by a single gesture. It is on the COLUMN rather
  // than on what stands in it, so it works the same where the tree ends in a
  // caret, in a dot, or in nothing at all.
  //
  // A dwell-to-arm version of this was tried — rest on the endpoint and it
  // became a × to click — and it put a destructive control under the pointer
  // every time you paused anywhere near one.
  onRemove,
  removeTitle,
  name,
  // THE NAME'S TYPE, never the row's. A row carries the size its box sets, and
  // the figure beside the name is read at THAT size — put the name's 13px on the
  // row instead and every area figure goes up a size and gains the name's weight
  // with it. The container levels set their size on the row deliberately,
  // because there the name IS the row's type.
  nameStyle,
  title,
  figure = null,
  height = ROW_HEIGHT,
  className,
  style,
}) {
  return (
    <div
      className={className}
      style={{
        height,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: HEADER_GAP,
        minWidth: 0,
        paddingLeft: ROW_INSET,
        paddingRight: controlInset(depth),
        ...style,
      }}
    >
      {/* THE ENDPOINT. `preventDefault` is what keeps the browser's own menu off
          the right-click; `stopPropagation` keeps it from reaching the card,
          which would select what you were removing. */}
      <span
        onContextMenu={
          onRemove
            ? (e) => {
                e.preventDefault()
                e.stopPropagation()
                onRemove()
              }
            : undefined
        }
        title={onRemove ? removeTitle : undefined}
        className={onRemove ? 'nodrag nopan' : undefined}
        style={{
          flexShrink: 0,
          width: DEPT_CARET,
          alignSelf: 'stretch',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {caret}
      </span>
      <span
        title={title ?? name}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          ...nameStyle,
        }}
      >
        {name}
      </span>
      {figure}
    </div>
  )
}
export function CardRoomList({ rooms, highlightKey = null }) {
  if (!rooms?.length) return null
  return (
    <div
      style={{
        marginTop: ROOM_LIST_TOP,
        // One INDENT past the card's caret, the same step a child box takes —
        // see ROOM_INDENT, which branchToRoom is measured against.
        paddingLeft: ROOM_INDENT,
        fontWeight: 400,
        minWidth: 0,
        position: 'relative',
      }}
    >
      {/* The branch to each room is drawn by the canvas's guide layer, not here
          — one tree, one drawing. All this list owes it is the indent it leaves
          and the line height it keeps, which is what branchToRoom measures. */}
      {/* A row is a room, or a ROOM GROUP's heading with its rooms stepped in
          under it — see data/tree.js. Two deep at most, because a room group is.
          The step is the one branchToRoom takes at depth 1, so the dots the
          guide layer draws land on these rows and not beside them. */}
      {rooms.map((room) => (
        <div
          key={room.key}
          title={room.count > 1 ? `${room.count} × ${room.name}` : room.name}
          // A search landing on this exact row — see TreeCanvas's CanvasSearch.
          // Transient, cleared a moment after it's set; nothing else ever reads
          // room.key against anything, so this is the row's only use of it.
          className={room.key === highlightKey ? 'tree-room-pulse' : undefined}
          style={{
            paddingLeft: room.depth ? ROOM_GROUP_STEP : 0,
            // A group heading is the same size as the rooms under it and only
            // steadier: this list is 10px italic throughout, and a heading a
            // size up in a card this small reads as a second card.
            fontWeight: room.group ? 600 : 400,
            fontSize: 10,
            // On the TEXT, not the wrapper: on the wrapper it compounded with
            // the guide's own alpha and the tree came out quieter here than at
            // every other level.
            opacity: 0.8,
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
// THE AREA SITS ON THE NAME'S ROW, in the same column as every other figure on
// the canvas — a card is a CanvasRow like a section header is, two levels in.
// Under the name it pushed the room list down a whole line and left the card
// reading as three separate things.
//
// `add` is a ghost's +, which stands at the END OF ITS OWN BRANCH in the
// endpoint column — the thing the tree points at is the thing you press. It
// floated in the card's corner once, as the × did, and both are gone from there:
// a floating control is what forced the area figure to stop short of the datum
// by a number nothing else knew about. Removal is `onRemove`, a right-click on
// that same endpoint.
//
// `expanded` and `onToggleRooms` come from ABOVE THE LAYOUT, not from state in
// here: the card's height is what the layout stacks the group by, so a card that
// opened itself would grow over its neighbours. See DepartmentGraph/TreeCanvas.
export function DepartmentCardFace({
  name,
  areaSqft,
  rooms,
  expanded = false,
  onToggleRooms,
  add = null,
  onRemove,
  removeTitle,
  // A room or room group a search just landed on — see TreeCanvas's
  // CanvasSearch and CardRoomList's own note. Null everywhere else.
  highlightRoomKey = null,
}) {
  const hasRooms = rooms?.length > 0
  const listed = hasRooms && expanded
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <CanvasRow
        depth={DEPTH.card}
        // Open, the head is the name row with the list under it; shut, it is the
        // whole card. Both come to ROW_HEIGHT — see departmentCardHeight.
        height={listed ? DEPT_HEAD_INSET * 2 + DEPT_NAME_ROW : '100%'}
        // The NAME is 13; the row keeps the card's own 12, which is the size the
        // area figure beside it has always been read at.
        nameStyle={{ fontSize: 13, fontWeight: 600 }}
        // WHAT STANDS AT THE END OF THE BRANCH: a ghost's +, else the toggle
        // where there are rooms to show, else nothing — and the tree draws a dot
        // in the empty column, which is what a leaf ends in.
        caret={
          add ??
          (hasRooms ? (
            <DisclosureCaret
              blank
              expanded={expanded}
              onToggle={() => onToggleRooms?.()}
              // The caret's own title AND the gesture on the column it sits in:
              // a child's title wins on hover, so without this the right-click
              // goes unannounced on every row that can open. See withRemoveHint.
              title={withRemoveHint(expanded ? 'Hide rooms' : `Show ${rooms.length} rooms`, onRemove && removeTitle)}
              size={CARET_RING}
            />
          ) : null)
        }
        onRemove={onRemove}
        removeTitle={removeTitle}
        name={name}
        // The Tree tab passes none: a catalog department has no area of its own
        // until an option sizes its rooms.
        figure={<CanvasFigure areaSqft={areaSqft} />}
      />
      {listed && (
        <div style={{ paddingLeft: ROW_INSET, paddingRight: controlInset(DEPTH.card), minWidth: 0 }}>
          <CardRoomList rooms={rooms} highlightKey={highlightRoomKey} />
        </div>
      )}
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
  // THE BOX'S OWN DISCLOSURE, in front of everything else in the header — a
  // group's cards can run to a screenful, and the thing being read across a
  // section is which groups it holds and how big they are.
  //
  // A LEVEL decides it, never a box: sections do not collapse, groups do. The
  // caret's COLUMN is reserved either way — it is part of the row grid — so a
  // level without one simply leaves it empty rather than shifting its name.
  collapsible = false,
  isCollapsed = false,
  onToggleCollapse,
  // A ghost section's single +, which stands at the end of its own branch in the
  // endpoint column — the thing the tree points at is the thing you press.
  add = null,
  headerRight,
  // Right-click on that endpoint. There is no × anywhere on these rows now: the
  // column it needed was paid for by every row that had none, and the area
  // figures were read against a right edge that was mostly empty.
  onRemove,
  removeTitle,
  // WHICH LEVEL THIS IS — the one thing that decides the row's right padding,
  // and so where its area figure ends. See the row grid in canvasLayout.js.
  depth = DEPTH.section,
  children,
}) {
  // OPAQUE, never a tint: a transparent fill lets the canvas's dotted background
  // through and the box reads as a screen laid over it rather than as a surface.
  // `wash` takes how far toward white, which is 1 - the alpha it replaces.
  const body = isGhost
    ? ghostBg
    : isDropTarget
      ? fill === 'solid'
        ? colours.emphasis
        : colours.wash(1 - tintAlpha * 2.8)
      : fill === 'solid'
        ? colours.background
        : colours.wash(1 - tintAlpha)

  // ONLY A SECTION IS OUTLINED, and only while SECTION_BORDER says so — the one
  // switch, in canvasLayout.js with the rest of the geometry. Three concentric
  // strokes around every card said what the nesting and the tree already say, so
  // the group and the card lost theirs. A stroke otherwise appears only where it
  // MEANS something: the dashes on a ghost and on a drop target.
  const isSection = depth === DEPTH.section
  const outlined = SECTION_BORDER && isSection
  const edge = isDropTarget
    ? 2
    : isGhost
      ? GHOST_DASH[fill === 'solid' ? 'group' : 'section']
      : outlined
        ? borderWidth
        : 0

  return (
    <div
      className={pulse ? 'tree-drop-pulse' : undefined}
      style={{
        '--pulse-ring': colours.ring,
        width: '100%',
        height: '100%',
        border: isDropTarget
          ? `${edge}px dashed ${colours.border}`
          : isGhost
            ? `${edge}px dashed ${ghostBorder}`
            : outlined
              ? `${edge}px solid ${colours.border}`
              : 'none',
        borderRadius: radius,
        background: body,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        // A SECTION ALONE IS LIFTED, and barely — it is the outermost box, and a
        // hairline of shadow says it sits on the canvas where the groups and
        // cards inside it sit on IT. Everything nested stays flat: a shadow at
        // every level is three shadows under every card.
        //
        // Independent of SECTION_BORDER, deliberately: an edge and a lift are two
        // ways of saying the same thing, and the switch is there to try either,
        // both or neither. Hanging this off it meant turning the border off took
        // the shadow with it.
        //
        // NOT ON A GHOST. A ghost is an outline of something that is not there
        // yet — a lift says it is sitting on the canvas, which is the one thing
        // it is not doing.
        boxShadow: isSection && !isGhost ? SECTION_SHADOW : undefined,
      }}
    >
      <CanvasRow
        // Both classes go on the HEADER, not the container. :hover matches every
        // ancestor, so tinting the box would light up a section, its group and
        // its card together whenever the pointer was over any one of them; and a
        // section holds cards with × buttons of their own, which marking the box
        // would reveal all at once.
        className={`spp-hover-tint spp-hover-reveal${headerClassName ? ` ${headerClassName}` : ''}`}
        depth={depth}
        // WHAT STANDS AT THE END OF THIS BOX'S BRANCH: a ghost's +, else the
        // toggle where there is something to open. The TREE draws the ring and
        // the arrow — this is the click and nothing more (`blank`) — and where
        // there is neither, the branch is capped with a dot. See CanvasGuides.
        caret={
          add ??
          (collapsible && onToggleCollapse ? (
            <DisclosureCaret
              blank
              expanded={!isCollapsed}
              onToggle={onToggleCollapse}
              title={withRemoveHint(
                isCollapsed ? `Show what is in ${name}` : `Collapse ${name}`,
                onRemove && removeTitle
              )}
              size={CARET_RING}
            />
          ) : null)
        }
        onRemove={onRemove}
        removeTitle={removeTitle}
        name={name}
        title={title ?? name}
        figure={headerRight}
        style={{
          fontSize,
          fontWeight,
          // A solid body already carries the colour; painting the header again
          // only draws a seam across it.
          background: isGhost || fill === 'solid' ? 'transparent' : colours.background,
          color: isGhost ? ghostText : colours.color,
          // Collapsed, the header IS the box, so it rounds on all four corners
          // rather than sitting on a body that is no longer there.
          borderRadius:
            fill === 'solid' && !isCollapsed
              ? undefined
              : isCollapsed
                ? radius - 1
                : `${radius - 1}px ${radius - 1}px 0 0`,
          cursor: headerClassName ? 'grab' : undefined,
          pointerEvents: 'auto',
          position: 'relative',
        }}
      />
      {/* The layout gave a collapsed box exactly its header's height, so
          anything below it would hang out past the border. */}
      {!isCollapsed && children}
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
  // NONE by default: a card's insets belong to its row, which is what puts its
  // figure on the canvas datum — see CanvasRow. A caller that pads the card as
  // well moves that figure off it.
  padding = 0,
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
        // No border and no shadow at rest — see the note on `edge` in
        // CanvasContainer. The fill says where the card is; the tree says what
        // it belongs to. A ghost keeps its dashes, which mean something.
        border: isGhost ? `${GHOST_DASH.card}px dashed ${ghostBorder}` : 'none',
        borderRadius: 8,
        padding,
        background: isGhost ? 'rgba(0,0,0,0.02)' : colours.inverted.background,
        color: isGhost ? ghostText : colours.inverted.color,
        // Selection stays blue, and is now the ONLY thing a card wears: the fill
        // carries function meaning, so it cannot also signal which card is open.
        boxShadow: !isGhost && isHighlighted ? '0 0 0 2px #1a73e8' : 'none',
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
      {children}
    </div>
  )
}
