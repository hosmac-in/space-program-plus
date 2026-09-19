// Chrome shared by BOTH side panels: the Tree tab's rooms panel and the Project
// tab's department block.
//
// Both draw a department, its rooms, and the objects in each room; only what
// they mean by those differs — the Tree edits the shared catalog, the Project
// edits one option. They were two copies and drifted, as the canvases once did,
// so everything visual lives here and each panel keeps only its own data
// mapping and writes.
//
// No data access, no writes, no knowledge of either data shape: callers resolve
// their nodes into these props.

import AddButton from '../primitives/AddButton.jsx'
import RemoveButton, { removeHint } from '../primitives/RemoveButton.jsx'
import { ADD_ENDPOINT } from '../canvas/canvasLayout.js'
import { formatArea } from '../map/area.js'
import { useAreaUnit } from '../AreaUnitContext.jsx'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  AREA_WIDTH,
  BLOCK_BORDER,
  BLOCK_GAP,
  BLOCK_PADDING,
  BLOCK_RADIUS,
  BLOCK_SHADOW,
  HEADER_PADDING_RIGHT,
  OBJECT_CONTROL,
  ROOM_HEAD,
  ROW_PAD,
  SUBTLE_GAP,
  SUBTLE_RULE,
} from './panelLayout.js'
import {
  Branch,
  BRANCH_BOX,
  BRANCH_CONTENT,
  BRANCH_ORIGIN_CONTENT,
  BranchRoot,
  BOX_CONTENT,
  insideBox,
  TreeLayer,
  useRootAnchor,
} from './PanelTree.jsx'

const ellipsis = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

// EVERY AREA IS DRAWN THE SAME WAY, and this is the only description of it: one
// size, italic, right-aligned, in a fixed column that ends where every other
// area's does. A room's total, an object's, the circulation line — they are read
// down a column against each other, and a figure a size larger or a few pixels
// short of the rest breaks that the moment anyone tries.
//
// Colour is the caller's: these sit on white bodies and on function-coloured
// headers, and only the caller knows which.
export const AREA_FIGURE = {
  width: AREA_WIDTH,
  flexShrink: 0,
  textAlign: 'right',
  fontSize: 12,
  fontStyle: 'italic',
  whiteSpace: 'nowrap',
}

// How far a room block's RIGHT-hand edge sits inside the panel's own content
// box: the block's border plus its horizontal padding. The heading pads by this
// so its area chain ends exactly where a room's area does. Derived rather than
// written as a number, so it follows if the block's padding ever moves.
const ROOM_INSET = HEADER_PADDING_RIGHT + BLOCK_BORDER

// HOW FAR A ROOM'S BODY STARTS INSIDE THE BLOCK — wider than BLOCK_PADDING, and
// on the left alone. The tree carries on inside the room, since the things
// standing in it are its children, so the line runs down this inset and
// everything written in the body has to start clear of it. See BOX_CONTENT.
// Exported for the one thing that bleeds out of that padding and has to know
// how far: a room's parameter band.
export const ROOM_BODY_LEFT = BOX_CONTENT + BLOCK_BORDER
const BODY_INSET = ROOM_BODY_LEFT
const BODY = insideBox(BODY_INSET)

// The department name — the top of the type ladder below, and the row the tree
// starts from.
const NAME_SIZE = 22
const NAME_LEADING = 1.2

// WHAT A SELECTED ROOM WEARS. The blue every selection in this app is drawn in,
// as a ring OUTSIDE the box — a room's header is painted in its own function
// colour, and a tint laid over an unknown hue is exactly the thing that cannot
// be relied on to show (see the note on red text in CLAUDE.md).
const SELECT_RING = 'rgba(26,115,232,0.85)'

// A ROOM GROUP'S NAME SITS BETWEEN a department's and a room's, because that is
// where the group itself sits: 16 against 22 above it and 14 below. It was 12 —
// smaller than the rooms it heads, which read as a caption on them rather than
// as the thing containing them.
const GROUP_NAME = 16
// And the row is as much taller as the type is, so the name is padded like every
// other header rather than squeezed into a room's height.
const GROUP_HEAD = ROOM_HEAD + (GROUP_NAME - 14) * 2
// The group card's own edge. A room block has none — the tree says what it
// belongs to and the shadow says where it ends — but a group CONTAINS things,
// and a box with rooms in it has to say where it closes.
const GROUP_BORDER = 1
// How far a group's body starts in from its own edge — the tree runs down this,
// exactly as it does inside a room. See BOX_CONTENT.
const GROUP_BODY_LEFT = BOX_CONTENT
// The quiet ink a ghost is drawn in — a card for something the option has not
// added yet. It sits on the department's pale wash, so a mid grey reads on it
// without borrowing a colour from the room it stands for.
const GHOST_INK = '#8a8a8a'
const GHOST_DASH = '1px dashed #bdbdbd'

// No wrapper is needed for a room's own rows — its parameter band, what the
// catalog says about it, its area. They are not children, so they register
// nothing, and the one line simply runs past them on its way to the objects.

// The box the whole panel sits in, painted with the department's own function
// colour — the same pale wash its card wears on either canvas, so the pane
// visibly belongs to the card you clicked. No outline: the wash already says
// where it ends, and an edge around the whole panel boxed the tree in.
//
// It is also where THE TREE is drawn, as one object over everything in it — see
// PanelTree.jsx. A panel with nothing to branch to draws nothing.
export function PanelShell({ colours, children }) {
  return (
    <div
      style={{
        borderRadius: 8,
        // NO SIDE PADDING. With the outline gone there is nothing to be inset
        // from: the column this sits in already pads by 16, so a second inset
        // was 32px of the panel's width spent saying the same thing twice — and
        // it came out of the room names, which is what the panel is read by. The
        // wash runs edge to edge and the tree starts in its own column.
        padding: '16px 0',
        marginBottom: 16,
        background: colours.inverted.background,
        color: colours.inverted.color,
        minWidth: 0,
      }}
    >
      <TreeLayer>
        <BranchRoot>{children}</BranchRoot>
      </TreeLayer>
    </div>
  )
}

// Where a department sits, as one line. An unresolvable step shows as a dash so
// the shape of the path stays legible. Variadic because the two panels know
// different amounts: the option panel can name the building, the Tree tab is
// already inside one.
export function formatPath(...names) {
  if (names.every((n) => !n)) return null
  return names.map((n) => n ?? '—').join(' → ')
}

// The department the panel is about: its name, and where it sits in the tree.
// The name is the LARGEST thing here by a clear margin — it is what you are
// editing and everything below is part of it. The ladder, largest first:
//
//   22  department name
//   16  room group name (bold) — between the two, like the group itself
//   14  room name (bold)
//   13  object row, the area chain, the department's stats, the path
//   12  a department's parameter rows; a collapsing band's title, which is
//       BOLD rather than restyled — one family, one case, throughout a panel
//       (see StripBand)
//   11  a room's parameter rows
// `under` sits below the name INSIDE the name's column, so it runs alongside the
// stacked figures in `right` rather than below the whole row — two columns of
// small print reading across from each other, one left-aligned and one right.
// `control` is an annotation slot (ui/option/annotations.jsx), last in the row.
// No column is held open for one: nothing else can appear there — a department
// is removed on the canvas, not from this panel — so in the editor the figures
// simply end on the panel's own right edge.
//
// >>> THE TREE STARTS HERE. The department is the root, so the name's row
// carries the origin dot and the line drops out of it into the rooms below —
// which is why the row is inset by the tree's own column. `root` is false for a
// heading with no tree under it (a building's).
export function PanelHeading({ name, path, note, right, under, control, root = false }) {
  // The tree measures itself from the NAME's own line — see useRootAnchor.
  const anchor = useRootAnchor()
  return (
    <div style={{ minWidth: 0 }}>
      {/* Above the name: context is read on the way in, and below the name it
          collided with the figures beside it. */}
      {/* Either may stand alone: the option panel now carries the path on its
          sticky heading and passes only a note, while the Tree tab passes only a
          path. Nesting the note inside the path swallowed it in the first
          case. */}
      {(path || note) && (
        <div
          style={{
            fontSize: 12,
            opacity: 0.75,
            marginBottom: 1,
            overflowWrap: 'anywhere',
            // With the name below it, not with the tree's column beside it.
            paddingLeft: root ? BRANCH_ORIGIN_CONTENT : 0,
          }}
        >
          {path}
          {note && <span style={{ marginLeft: path ? 6 : 0, color: '#c17' }}>{note}</span>}
        </div>
      )}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          minWidth: 0,
          // A room block's border plus its header's right-hand padding. With
          // this the heading's figures end exactly where a room's area does,
          // one level in.
          paddingRight: ROOM_INSET,
          paddingLeft: root ? BRANCH_ORIGIN_CONTENT : 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* The row the tree hangs from: its own middle is where the first
              branch leaves. Nothing states that height — it is measured. */}
          <div
            ref={root ? anchor : undefined}
            style={{ fontSize: NAME_SIZE, fontWeight: 700, lineHeight: NAME_LEADING, overflowWrap: 'anywhere' }}
          >
            {name}
          </div>
          {under}
        </div>
        {right}
        {control}
      </div>
    </div>
  )
}

// How many of something, or how much: one field for an object row, a room
// header, a room's area and a department's factors, because the typing rules
// below are the whole substance of it and copies would drift on the first fix.
//
// It reports EVERY KEYSTROKE, so the Save Data button and the totals answer
// while you type — it waited for blur once, and the button stayed grey over a
// number you had already changed. Typing "120" is three reports but ONE undo
// step, since the caller coalesces them. The draft stays local, so a half-typed
// or empty field never reaches the option.
//
// `min`/`step`/`decimals` are what let it also serve a MULTIPLIER (1.00 by
// default, typed as 1.25), and `steppers`/`width` an AREA — read off a drawing,
// never nudged, lining up in a column.
export function CountField({
  value,
  canEdit = true,
  onChange,
  // Called once when the field is LEFT — blur or Enter — with the settled
  // value, for the caller that WRITES and must not write once per character.
  onCommit,
  title,
  colour = '#555',
  min = 1,
  step = 1,
  // 0 keeps the original behaviour exactly: whole numbers, floored.
  decimals = 0,
  // What precedes the figure. A count reads "× 3"; a multiplier reads "×1.25"
  // and wants no space.
  prefix = '× ',
  // What follows it — "sqft" on an area. Part of the figure, so it takes the
  // same italic and size.
  suffix = null,
  // How big the figure is against the text it follows. See `figure` below.
  // Was 0.75em, which at a 14px room name left a 10px italic figure carrying an
  // editable number — subordinate to the point of being hard to read, and the
  // steppers beside it smaller still.
  size = '0.9em',
  // Off for a figure that is always typed rather than nudged. An area is a
  // measurement someone reads off a drawing — stepping it from 0 is not how it
  // is ever arrived at, and the buttons only take room from the column it has
  // to line up in.
  steppers = true,
  // Fixed width for the whole field, so a column of them aligns. Without it
  // each sizes to its own digits and sits against the text it follows.
  width = null,
}) {
  // FLOATS ARE ALLOWED EVERYWHERE. `decimals` still fixes the precision of a
  // field that wants trailing zeros always shown — a multiplier reads "1.00" —
  // but a field left at the default (0) used to floor to a whole number on
  // every keystroke; it now keeps up to 2 decimal places and simply doesn't pad
  // them, so "3" still reads as "3" and "3.5" is no longer thrown away.
  const displayDigits = decimals > 0 ? decimals : 2
  const minDigits = decimals > 0 ? decimals : 0

  // At rest a figure is shown at its full precision — "1.00", not "1" — and
  // SEPARATED: 5,400, the way formatArea prints every other number in the app. A
  // field that showed 5400 beside a total reading 5,400 made the two look like
  // different quantities.
  //
  // Only at rest. Reformatting what someone is halfway through typing moves the
  // caret out from under them, so while the field is focused the draft is left
  // exactly as typed and the separators return on blur — which is also why
  // `settle` has to strip them back out again.
  const format = (n) => (n == null || n === '' ? '' : formatArea(Number(n), displayDigits, minDigits))

  // Back the other way: what is in the field, as a number. Separators are
  // display only and must come off before anything parses it — Number('5,400')
  // is NaN, which would settle a typed area back to its minimum.
  const unformat = (raw) => String(raw ?? '').replace(/,/g, '')

  const [draft, setDraft] = useState(format(value))
  const [focused, setFocused] = useState(false)

  // Whether the draft holds an edit that has not been settled yet, and the
  // latest of everything the unmount flush below needs. A ref because that
  // flush runs from a cleanup that must not re-subscribe on every keystroke.
  const dirtyRef = useRef(false)
  const latestRef = useRef(null)

  // An undo, a discard, or an edit made elsewhere changes the count under a
  // field nobody is typing in.
  useEffect(() => {
    if (!focused) setDraft(format(value))
    // format closes over `decimals`, which never changes for a given field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused])

  // Rounded to the allowed precision, so a pasted 1.4372 settles rather than
  // being reported as typed.
  const quantise = (n) => Math.round(n * 10 ** displayDigits) / 10 ** displayDigits

  // Whatever is in the field, as a legal value.
  const settle = (raw) => {
    const parsed = Number(unformat(raw))
    return Math.max(min, quantise(Number.isFinite(parsed) ? parsed : min))
  }

  // FLUSH ON UNMOUNT.
  //
  // onBlur does not fire on an element that is removed, and this field is
  // removed under the pointer in a real case: typing a building's factor and
  // then clicking a different building unmounts it (its key carries the
  // building) before the blur lands, so the edit vanished with no error and no
  // write. Anything typed and not settled is settled here instead.
  //
  // Only when dirty — a field somebody merely tabbed through must not write.
  latestRef.current = { draft, value, settle, onChange, onCommit }
  useEffect(
    () => () => {
      if (!dirtyRef.current) return
      const l = latestRef.current
      const next = l.settle(l.draft)
      if (next !== l.value) l.onChange(next)
      l.onCommit?.(next)
    },
    []
  )

  const shown = format(value)

  // Italic, the same ink as whatever it sits in, and three quarters the size of
  // it: the figure is part of the phrase — "Consultation Room ×10" — but the
  // subordinate half of it.
  const figure = { fontStyle: 'italic', fontSize: size, color: colour }

  if (!canEdit) {
    return (
      <span
        style={{
          ...figure,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          ...(width ? { width, textAlign: 'right' } : null),
        }}
      >
        {prefix}
        {shown}
        {suffix ? ` ${suffix}` : ''}
      </span>
    )
  }

  // While typing: report anything that parses to a real value, ignore the rest
  // (an empty field, a lone minus) rather than forcing a 1 under the caret.
  const typeCount = (text) => {
    setDraft(text)
    dirtyRef.current = true
    const n = quantise(Number(text))
    if (Number.isFinite(n) && n >= min && n !== value) onChange(n)
  }

  // On the way out: settle whatever is in the field to a legal value.
  const commit = () => {
    const next = settle(draft)
    setDraft(format(next))
    dirtyRef.current = false
    if (next !== value) onChange(next)
    // Always, even when the value did not change: leaving a field is when a
    // caller that writes gets its chance, and "typed the same number back" must
    // still settle rather than leaving an edit unwritten.
    onCommit?.(next)
  }

  // One press of − or +. Goes through the same floor and precision as typing,
  // and reports on the same coalesce key, so holding a stepper is one undo step
  // exactly as typing a number is.
  const nudge = (by) => {
    const from = Number.isFinite(Number(draft)) && draft !== '' ? Number(draft) : value
    const next = Math.max(min, quantise(from + by * step))
    setDraft(format(next))
    dirtyRef.current = false
    if (next !== value) onChange(next)
    // A stepper press is a FINISHED edit, not a keystroke on the way to one —
    // there is no half-pressed +. Without this a caller that writes on commit
    // never heard about it, and the value only reached the database if you
    // happened to click away afterwards and blur the input.
    onCommit?.(next)
  }

  const stepButton = (label, by) => (
    <button
      type="button"
      // The field is inside a clickable room header on one panel and a
      // selectable card on the other; without this a nudge also navigates.
      onClick={(e) => {
        e.stopPropagation()
        nudge(by)
      }}
      title={by < 0 ? 'Decrease' : 'Increase'}
      style={{
        // A hit target, not a decoration — and big enough that the glyph inside
        // it is legible at the size the figure beside it is now drawn.
        width: 16,
        height: 16,
        lineHeight: '14px',
        padding: 0,
        fontSize: 13,
        cursor: 'pointer',
        color: 'inherit',
        background: 'rgba(255,255,255,0.35)',
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: 2,
      }}
    >
      {label}
    </button>
  )

  return (
    // count-wrap is what the steppers' hover is keyed on — see index.css. They
    // occupy their space at all times, so nothing reflows as the pointer
    // arrives.
    <span
      className="count-wrap"
      // The size lives here, once, so the input can simply inherit it — an
      // <input> takes none of its font from its parent unless told to, so
      // setting it in two places is how the × and the figure drift apart.
      style={{
        ...figure,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        // A fixed-width field is a column: push its contents to the right edge
        // so the figures stack under one another however many digits each has.
        ...(width ? { width, justifyContent: 'flex-end' } : null),
      }}
    >
      <span>{prefix}</span>
      <input
        // TEXT, NOT NUMBER. A number input refuses any value it cannot parse,
        // and "5,400" is one of them — it would show an empty field the moment
        // the separators went in. Nothing is lost: the native spinner was
        // already suppressed (the − / + beside it are the steppers), and `min`,
        // `step` and the precision are enforced by settle() rather than by the
        // element. inputMode keeps the numeric keypad on a touch device.
        type="text"
        inputMode="decimal"
        className="count-field"
        value={draft}
        // Digits, one decimal point, and the separators a paste may bring —
        // anything else would settle to the minimum on blur without ever
        // looking like it was rejected.
        onChange={(e) => typeCount(e.target.value.replace(/[^\d.,]/g, ''))}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(format(value))
        }}
        title={title}
        style={{
          // Sized to its own contents so the figure sits against the name
          // rather than in a fixed column. The floor keeps a single digit from
          // collapsing to nothing.
          // Just enough slack for the caret. It was 0.4ch, which read as a
          // second space before a unit — "2,000  sqft" against the printed
          // "1,000 sqft" of the rows above it.
          width: `${Math.max(1.6, String(draft).length + 0.2)}ch`,
          // Longhands only, never the `font` shorthand: mixing the two in one
          // React style object lets the shorthand reset fontStyle after it has
          // been set, and the figure comes out upright.
          fontStyle: 'italic',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          color: 'inherit',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: 0,
          textAlign: 'left',
        }}
      />
      {suffix && <span>{suffix}</span>}
      {steppers && (
        <span className="count-steps" style={{ display: 'inline-flex', gap: 2 }}>
          {stepButton('−', -1)}
          {stepButton('+', 1)}
        </span>
      )}
    </span>
  )
}

// `tone` is for a row that is not an object at all: the derived circulation
// line, quiet by default and red when it goes negative — the objects do not fit
// in the area entered for the room.
//
// IT IS A BRANCH OF THE TREE — the things standing in a room are its children,
// and the line carries on down into them from the caret that opened the room.
// The row terminates in a dot: there is nothing under an object to open. The
// caller says nothing about the tree at all; the layer can see the whole list.
export function ObjectRow({
  name,
  type,
  count,
  area,
  tone = null,
  canEdit = true,
  onCountChange,
  // As RoomBlock's onAreaCommit: for the Tree tab, where every edit is a write
  // and a keystroke must not be one.
  onCountCommit,
  onRemove,
}) {
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()
  // No wrapping: the row is narrow, so the name takes whatever the figure on the
  // right doesn't need and ellipsises rather than pushing it out of the panel.
  // spp-row highlights the whole row under the pointer, tying the name to the
  // figure across the gap from it.
  return (
    <Branch {...BODY} onRemove={canEdit ? onRemove : null} removeTitle={removeHint(name)}>
    <div
      className="spp-row"
      // paddingBlock, NOT the `padding` shorthand — see the note in
      // EnergyFieldRows: the shorthand resets .spp-row's padding-inline and the
      // row ends up offset by its own negative margin.
      style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBlock: ROW_PAD, minWidth: 0 }}
    >
      {/* The type is deliberately NOT drawn. "AHU Machine (mep_equipment)" spent
          most of a narrow row on a word that repeats what the name already
          says, and ellipsised the half that identifies the thing. `type` is
          still taken, and still the tooltip, so putting it back is one line. */}
      {/* THE COUNT SITS AGAINST THE NAME, not out in the middle of the row.
          "AHU Machine ×2" is one phrase — the figure is part of what the thing
          is called here — and floated between the name and the area it read as
          a third column belonging to neither. The pair takes the row's spare
          width together, so the name still ellipsises before the area does. */}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          title={type ? `${name} (${type})` : name}
          style={{
            ...ellipsis,
            flex: '0 1 auto',
            fontSize: 13,
            fontStyle: tone ? 'italic' : undefined,
            color: tone === 'warn' ? '#c11' : tone ? '#888' : undefined,
          }}
        >
          {name}
        </span>

        {count != null && (
          <CountField
            value={count}
            canEdit={canEdit}
            onChange={onCountChange ?? (() => {})}
            onCommit={onCountCommit}
            title={`How many ${name}`}
          />
        )}
      </span>

      {/* LAST IN THE ROW, so it ends on the block's own right edge — the same
          column the room's area in the header above ends on. The two have to
          line up: one is the room, the rest are what is in it. */}
      {area !== undefined && (
        <span style={{ ...AREA_FIGURE, color: tone === 'warn' ? '#c11' : '#555' }}>
          {area != null ? `${formatArea(toDisplay(area))} ${AREA_UNIT}` : 'no area'}
        </span>
      )}
    </div>
    </Branch>
  )
}

// THE ROOM'S OWN AREA, as a row above its object list rather than a figure in
// its header. It leads: the room, ruled off, then what stands in it, then what
// they leave over.
//
// That is the order the three are read in — you type the area, you list what has
// to fit, and circulation is the answer at the bottom. The header used to hold
// the input, which asked the same column to be a field on one line and a total
// on every other, and left the room's real size — area × count — a figure
// nothing on screen ever showed.
//
// Same two columns as an ObjectRow, so every figure in the block lines up: the
// label, and the area in AREA_WIDTH ending on the block's own edge. It is the
// room's own row rather than one of its children, so it carries no branch — the
// tree runs past it on the way to the objects.
export function RoomAreaRow({
  label = 'Room area',
  value,
  canEdit = true,
  onChange,
  onCommit,
  title,
  // True when `value` is not something stated for this placement — the
  // catalog's generic sp_room.area_sqm (or 0, when that's empty too) rather
  // than a figure this placement's own RoomAreaRow was typed into. Drawn
  // muted, the same "borrowed, not authored" ink every other inherited figure
  // in this app uses — see CLAUDE.md, "Defaults in the catalog".
  isDefault = false,
}) {
  // `value` is held in sqft everywhere upstream (see CLAUDE.md, Area); this
  // field only converts what it shows and what it hands back, at its own edge.
  const { label: AREA_UNIT, toDisplay, toStored } = useAreaUnit()

  // TYPING NOTHING MUST STORE NOTHING, and in m² that takes saying so.
  //
  // The field shows one decimal, so 200 sqft reads 18.6 m²; converting that
  // straight back gives 200.2, which is a different area from the one that
  // produced it. CountField commits on every blur, changed or not — so merely
  // clicking into a room's area and out again rewrote it, a whole-section jsonb
  // write and an undo step on the Tree tab, and a dirty Save Data on the other.
  //
  // So: if what is in the field still ROUNDS TO THE FIGURE ALREADY SHOWN, it is
  // the same area, and the stored sqft goes back untouched.
  const back = (n) => (Math.round(toDisplay(value) * 10) === Math.round(n * 10) ? value : toStored(n))

  return (
    <div
      className="spp-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingBlock: ROW_PAD,
        minWidth: 0,
        // The breaker: the room, then what is in it.
        borderBottom: `1px solid ${SUBTLE_RULE}`,
        marginBottom: ROW_PAD,
      }}
    >
      <span style={{ ...ellipsis, fontSize: 13 }}>{label}</span>
      <CountField
        value={toDisplay(value)}
        canEdit={canEdit}
        onChange={(n) => onChange?.(back(n))}
        onCommit={onCommit ? (n) => onCommit(back(n)) : undefined}
        // Muted ink for a figure nobody stated on this placement — see the
        // note on `isDefault` above. Still italic: CountField always is.
        colour={isDefault ? '#999' : '#555'}
        // A room may legitimately have no area entered yet, so unlike a count
        // this floors at zero.
        min={0}
        // Always one decimal place, whichever unit this is shown in — a room
        // area is a measurement read off a drawing, and a whole number alone
        // looks more precise than it is.
        decimals={1}
        prefix=""
        suffix={AREA_UNIT}
        // Typed, never nudged — a measurement read off a drawing.
        steppers={false}
        width={AREA_WIDTH}
        size="12px"
        title={title ?? 'Area of one of this room'}
      />
    </div>
  )
}

// One room: a coloured header carrying its name, how many of it, and its remove
// button, then a body holding whatever the caller puts in it — object rows, and
// its own picker.
//
// IT HANGS OFF THE TREE AND IT IS SHUT. The block draws its own branch (see
// PanelTree.jsx) because the caret at the end of that branch is what opens it,
// and a line and the control it lands on cannot be drawn by two components and
// be relied on to meet. The caller says nothing about the tree: the layer sees
// the whole list, and the line starts at the department's own heading.
//
//   >>> SHUT IS THE RESTING STATE, the same call the canvas card's room list
//   >>> made. A department of twelve rooms, each with its parameter band, its
//   >>> objects and its notes, is the detail view — not the one a department is
//   >>> read in. Shut, a room is one row: its name, how many, and its area on
//   >>> the same datum as every other figure in the panel.
//
// The state is local, unlike the canvases' — there a card's height is what the
// layout stacks the next one by, so an open card would grow over its neighbours.
// A panel is flow and has no such problem.
//
// `count` is optional because only an option has one: how many of a room a
// program holds is not a catalog fact, so the Tree tab passes none and its
// header is a name, an area and a ×. An object's count is the other way round —
// both tabs have it. See data/tree.js.
//
// Deliberately not `overflow: hidden`: a picker's dropdown is absolutely
// positioned below its input and has to escape the block's bottom edge. The
// header rounds its own top corners instead.
export function RoomBlock({
  colours,
  name,
  type,
  count,
  // WHAT THIS MANY OF THE ROOM COMES TO — area × count, read-only. The area of
  // ONE of it is typed on RoomAreaRow, down in the body; this is the figure
  // that was never shown anywhere, and it is the one that adds up to the
  // department. An object row states its total the same way.
  totalAreaSqft,
  canEdit = true,
  onCountChange,
  // RENAMED BY DOUBLE-CLICKING THE TITLE. Pass no handler and the title is
  // plain text — which is what a read-only view and the Companion get.
  //
  // `inheritedName` is what the room is called with nothing typed here: the
  // catalog's label on the Tree tab, and on the Project tab the catalog's label
  // or the definition's name. Typing exactly that stores NO override — see
  // below.
  onNameCommit,
  inheritedName,
  onRemove,
  // An annotation slot: a node a second app can put in the header's one control
  // position, where the × would otherwise be. The two never appear together —
  // an app with something to put here is read-only, so there is no ×. This file
  // does not know or care what the node is; see ui/option/annotations.jsx.
  control,
  // A node rendered INSTEAD of the count field. The count is a fact about the
  // program and an app that cannot edit it may have something better to say in
  // its place. Null everywhere but that app.
  countOverride = null,
  // DRAG THIS ROOM SOMEWHERE ELSE IN THE LIST. From useReorderList: the handle's
  // props, and the row's. Null on both and the grip is not drawn — a read-only
  // view, the Companion, and any caller whose list has no order to speak of.
  //
  // The grip is on the HANDLE and the handle alone. Making the block draggable
  // would turn selecting text in any of the inputs inside it into a drag.
  dragHandleProps = null,
  dragProps = null,
  isDragging = false,
  // WHICH OPTIONAL PARTS THIS ROOM ALREADY HAS, and which it may be given. See
  // RoomExtras: a size and a note are drawn when the room has one and offered as
  // a + beside the object picker when it has not.
  //
  // `canAdd…` is about this PANEL, not this room: the catalog's suggested size is
  // authored on the Tree tab alone, so the Project tab offers no + for it.
  hasSize = false,
  hasNote = false,
  canAddSize = false,
  canAddNote = false,
  // HOW FAR IN THIS ROOM'S CONTAINER SITS from the box the tree branched out of
  // — 0 straight under a department, the group body's own inset inside a room
  // group. It is the ONE number a deeper level needs: the tree's columns are all
  // measured from the element they are drawn in, so both of this block's follow
  // from it and everything below (its objects) needs nothing at all.
  inset = 0,
  // SELECT SEVERAL ROOMS AND GROUP THEM — the Tree tab only, where the grouping
  // is authored. A click on the title bar toggles; a right-click on it groups
  // what is selected. Both absent everywhere else, so the header behaves exactly
  // as it did.
  selected = false,
  onSelect,
  onGroup,
  groupHint,
  children,
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()
  const [asked, setAsked] = useState({ size: false, note: false })
  const extras = {
    showSize: hasSize || asked.size,
    showNote: hasNote || asked.note,
    canAddSize,
    canAddNote,
    revealSize: () => setAsked((a) => ({ ...a, size: true })),
    revealNote: () => setAsked((a) => ({ ...a, note: true })),
    // The × on the part itself: it clears the stored value AND takes back the
    // asking, or a row emptied by its own × would sit there still asked for.
    // Un-asking alone would be worse — the value would stay stored and come
    // back on the next draw.
    hideSize: () => setAsked((a) => ({ ...a, size: false })),
    hideNote: () => setAsked((a) => ({ ...a, note: false })),
  }

  // What Enter (or leaving the field) does with what was typed.
  //
  //   >>> TYPING BACK THE INHERITED NAME STORES NOTHING. The field opens holding
  //   >>> the name as shown, so the commonest way to leave it unchanged is to
  //   >>> type nothing at all — and storing "Toilet" over an inherited "Toilet"
  //   >>> would look identical while quietly pinning the name against a later
  //   >>> rename of sp_room. Blank does the same thing, which is how a name is
  //   >>> cleared: empty the field and press Enter.
  const commitName = () => {
    if (!editing) return
    setEditing(false)
    const next = draft.trim()
    onNameCommit?.(next && next !== (inheritedName ?? '') ? next : '')
  }

  return (
    <Branch
      endpoint="caret"
      // The air above the block is the branch's padding, not the block's margin:
      // the spine is drawn down the item, and a margin would fall outside it and
      // leave a gap in the line between one room and the next.
      padTop={BLOCK_GAP}
      head={BLOCK_GAP + ROOM_HEAD / 2}
      // The branch enters the BOX rather than stopping outside it: the block is
      // inset just enough that its own spine column falls under the caret the
      // branch ends on, so the line carries straight on down inside it to the
      // objects. See BRANCH_BOX — and `inset`, which is all a deeper level moves.
      endX={insideBox(inset).endX}
      contentAt={BRANCH_BOX - inset}
      expanded={open}
      onToggle={() => setOpen((v) => !v)}
      title={open ? `Hide what is in ${name}` : `Show what is in ${name}`}
      onRemove={canEdit ? onRemove : null}
      removeTitle={removeHint(name)}
    >
    <div
      {...dragProps}
      style={{
        position: 'relative',
        // No outline: the tree says what this belongs to, and the shadow says
        // where it ends. See BLOCK_SHADOW.
        borderRadius: BLOCK_RADIUS,
        // SELECTED rings the block rather than tinting it: the header is painted
        // in the room's own function colour and a tint on top of an unknown hue
        // is the one thing that cannot be relied on to show. The ring is outside
        // the box, so nothing inside moves when it appears.
        boxShadow: selected ? `0 0 0 2px ${SELECT_RING}, ${BLOCK_SHADOW}` : BLOCK_SHADOW,
        minWidth: 0,
        // The row being carried is faded where it currently sits, so the gap
        // opening up ahead of it reads as where it is going rather than as a
        // second copy of it.
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div
        // CLICK THE TITLE BAR TO SELECT, right-click to group what is selected.
        // Nothing else uses either gesture on this strip — opening is the caret,
        // renaming is a double-click (which nets two toggles and so leaves the
        // room as it was), and the count field and the grip stop their own
        // events. Absent on every panel but the one that authors groups.
        onClick={onSelect ? () => onSelect() : undefined}
        onContextMenu={
          onGroup
            ? (e) => {
                e.preventDefault()
                e.stopPropagation()
                onGroup()
              }
            : undefined
        }
        title={groupHint}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: onSelect ? 'pointer' : undefined,
          // ONE HEIGHT, because the branch has to meet it at a known point —
          // see ROOM_HEAD. The left inset clears the caret the tree draws over
          // this strip; the right is the block's own, so the area figure lands
          // on the panel's datum. Both are less the block's border, which the
          // tree's columns are measured from the outside of.
          height: ROOM_HEAD,
          padding: `0 ${HEADER_PADDING_RIGHT}px 0 ${BRANCH_CONTENT - BRANCH_BOX - BLOCK_BORDER}px`,
          background: colours.background,
          color: colours.color,
          fontWeight: 600,
          minWidth: 0,
          // Shut, the header IS the block: its bottom corners have to round too,
          // or the colour squares off inside the block's own radius.
          borderRadius: open ? `${BLOCK_RADIUS}px ${BLOCK_RADIUS}px 0 0` : BLOCK_RADIUS,
        }}
      >

        {/* NOT hover-revealed, unlike the ×. spp-reveal means "this deletes
            something" everywhere in this app, and a second meaning would leave
            it meaning nothing — see CLAUDE.md. It is quiet instead: a grip at
            half strength, which is also the only hint that the list has an
            order worth arranging. */}
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            title={`Drag to move ${name}`}
            style={{
              flexShrink: 0,
              cursor: 'grab',
              opacity: 0.55,
              fontSize: 11,
              lineHeight: 1,
              // The glyph is two columns of dots and sits high in its em box.
              marginTop: -1,
              userSelect: 'none',
            }}
          >
            ⠿
          </span>
        )}

        {/* Name and count read as one phrase — "Consultation Room ×10" — so the
            count sits immediately after the name rather than being flung to the
            far edge. The name shrinks and ellipsises before the count does; the
            spacer after them is what holds the × against the right edge.

            DOUBLE-CLICK TO RENAME. A title is a title until you ask it to be a
            field: a room's name is read a hundred times for every time it is
            changed, and an input sitting permanently on a function-coloured
            strip would be the loudest thing in the panel — the same argument
            the count field settled long ago. A single click is spoken for
            anyway; the header selects and drags in other panels.

            Opens holding the name AS SHOWN, so you edit the words you were
            looking at rather than an empty box. Enter commits, Escape abandons,
            and leaving the field commits too — the tab's own rule, since a blur
            that threw away what you typed would be the same trap as the room
            count's flush-on-unmount. */}
        {editing ? (
          <input
            className="spp-title-field"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onBlur={() => commitName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                // Abandon before the blur handler can commit it.
                setEditing(false)
                e.currentTarget.blur()
              }
            }}
            style={{
              flex: '0 1 auto',
              minWidth: 0,
              // Sized to what is in it, so the count still sits against the name
              // rather than across a gap.
              width: `${Math.max(8, draft.length + 1)}ch`,
              fontFamily: 'inherit',
              fontSize: 'inherit',
              fontWeight: 'inherit',
              color: 'inherit',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: 0,
            }}
          />
        ) : (
          <span
            // THE TYPE IS IN THE TOOLTIP, NOT THE TITLE — the same place
            // ObjectRow has always kept it. A room's type is a fact about the
            // definition, not what this placement is called, and spelled out in
            // brackets after every name it doubled the length of the one line
            // the header exists to show.
            title={[type ? `${name} (${type})` : name, canEdit && onNameCommit ? '— double-click to rename' : '']
              .filter(Boolean)
              .join(' ')}
            onDoubleClick={
              canEdit && onNameCommit
                ? (e) => {
                    e.stopPropagation()
                    setDraft(name ?? '')
                    setEditing(true)
                  }
                : undefined
            }
            style={{ ...ellipsis, flex: '0 1 auto' }}
          >
            {name}
          </span>
        )}
        {count != null &&
          (countOverride ?? (
            <CountField
              value={count}
              canEdit={canEdit && !!onCountChange}
              onChange={onCountChange}
              title={`How many ${name}`}
              // The header is painted with the room's function colour, so a
              // read-only figure takes the ink that colour was paired with.
              colour="inherit"
            />
          ))}
        <span style={{ flex: 1, minWidth: 0 }} />

        {/* EVERY AREA IN THIS BLOCK IS THE SAME FIGURE IN THE SAME COLUMN: the
            same size, italic, right-aligned in AREA_WIDTH, ending where the one
            below it ends. This one is a total, not an input — typed on
            RoomAreaRow — so it is drawn, not fielded. */}
        {totalAreaSqft != null && (
          <span
            title={count != null ? `${count} × the area of one ${name}` : `Area of ${name}`}
            style={{ ...AREA_FIGURE, color: 'inherit' }}
          >
            {formatArea(toDisplay(totalAreaSqft))} {AREA_UNIT}
          </span>
        )}

        {/* An annotation, and NO COLUMN HELD OPEN FOR ONE. There is no × here
            any more — removal is a right-click on the branch — so the slot that
            used to hold either of them is gone, and a second app's control is
            simply the last thing in the row when there is one. In the editor
            there never is, and the area figure ends on the panel's own edge. */}
        {control}

      </div>

      {/* NOT MOUNTED WHILE SHUT, and so not slid open either.

          A band slides because it is a few rows appearing in place. A room's
          body is the rest of the panel moving, and — the reason that settles it
          — the tree is MEASURED: rows kept in the layout but clipped still have
          a position, so the drawing would branch to objects nobody can see, and
          every frame of a slide would be a stale line. */}
      {open && (
        <div
          // White, so object rows stay legible whatever colour the room's
          // function paints the header and whatever the panel behind it is
          // tinted.
          style={{
            // Wider on the left, where the tree runs — see BODY_INSET. The
            // RIGHT stays BLOCK_PADDING, because that edge is the datum every
            // area figure in the panel ends on.
            padding: `${BLOCK_PADDING}px ${BLOCK_PADDING}px ${BLOCK_PADDING}px ${BODY_INSET}px`,
            minWidth: 0,
            background: '#fff',
            color: '#1a1a1a',
            borderRadius: `0 0 ${BLOCK_RADIUS}px ${BLOCK_RADIUS}px`,
          }}
        >
          <RoomExtras.Provider value={extras}>{children}</RoomExtras.Provider>
        </div>
      )}
    </div>
    </Branch>
  )
}

// A ROOM GROUP — a named box around some of a department's rooms, one level
// deep. The shape and the rules are in data/tree.js under ROOM GROUPS; this is
// only how one is drawn, and both panels draw it: the Tree tab authors it, the
// Project tab shows the same thing without the name field or the dissolve.
//
// IT TAKES NO FUNCTION COLOUR. A room group has no sp_function, and inventing
// one would put a fourth hue in a panel already carrying the department's wash
// and every room's own. It is the quiet box; the rooms inside stay the loudest
// thing in it, which is the right way round.
//
// IT ARRIVES NAMED. The name is asked for when the group is made, before
// anything is written — so there is no moment where a group sits unnamed in a
// catalog everyone reads. Double-click to rename it after, the way a room is
// renamed; emptying the name is allowed and draws the placeholder, because
// clearing is a thing someone may mean.
export function RoomGroupBlock({
  // THE DEPARTMENT'S colours, not a function of its own — a room group has no
  // sp_function and inventing one would put a fourth hue in a panel already
  // carrying the department's wash and every room's. It borrows the department's
  // because that is whose group it is.
  colours,
  name,
  // Absent on the Project tab, where the grouping is the catalog's to change.
  onNameCommit,
  totalAreaSqft,
  onRemove,
  removeTitle,
  children,
}) {
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name ?? '')
  const { label: AREA_UNIT, toDisplay } = useAreaUnit()

  const commitName = () => {
    if (!editing) return
    setEditing(false)
    onNameCommit?.(draft.trim())
  }

  const shown = name || 'Untitled group'

  return (
    <Branch
      endpoint="caret"
      padTop={BLOCK_GAP}
      head={BLOCK_GAP + GROUP_HEAD / 2}
      contentAt={BRANCH_BOX}
      expanded={open}
      onToggle={() => setOpen((v) => !v)}
      title={open ? `Hide ${shown}` : `Show ${shown}`}
      onRemove={onRemove}
      removeTitle={removeTitle}
    >
      {/* A CARD, the way a group box is one on the canvas: the rooms inside are
          things IN something, not things beside each other at a smaller size.
          White ground with the block shadow, so it lifts off the department's
          wash exactly as a room does — and NO RIGHT PADDING, which is the one
          thing that would move every area figure inside it off the datum. */}
      <div
        style={{
          minWidth: 0,
          background: '#fff',
          border: `${GROUP_BORDER}px solid ${colours?.inverted.border ?? SUBTLE_RULE}`,
          borderRadius: BLOCK_RADIUS,
          boxShadow: BLOCK_SHADOW,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: GROUP_HEAD,
            // The department's own wash, ruled off from the white below: a band
            // that labels what is under it rather than a second card on top of
            // one.
            background: colours?.inverted.background,
            borderBottom: open ? `1px solid ${colours?.inverted.border ?? SUBTLE_RULE}` : 'none',
            borderRadius: open
              ? `${BLOCK_RADIUS - GROUP_BORDER}px ${BLOCK_RADIUS - GROUP_BORDER}px 0 0`
              : BLOCK_RADIUS - GROUP_BORDER,
            // The same left inset a room's header takes, so a group's name and a
            // room's name start on the same vertical; nothing on the right but
            // the figure, which stays on the panel's datum.
            padding: `0 ${HEADER_PADDING_RIGHT}px 0 ${BRANCH_CONTENT - BRANCH_BOX - GROUP_BORDER}px`,
            minWidth: 0,
            fontSize: GROUP_NAME,
            fontWeight: 700,
            // ITALIC, like every other thing this app STATES rather than lets
            // you edit in place — a group is a heading over its rooms, not one
            // of them.
            fontStyle: 'italic',
            color: '#444',
          }}
        >
          {editing ? (
            <input
              className="spp-title-field spp-group-field"
              autoFocus
              value={draft}
              placeholder="write group name"
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => commitName()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  // Abandon before the blur handler can commit it — the same
                  // guard a room's rename uses.
                  setEditing(false)
                  e.currentTarget.blur()
                }
              }}
              style={{
                flex: '0 1 auto',
                minWidth: 0,
                // Wide enough to hold the placeholder, which is longer than most
                // names anyone types into it.
                width: `${Math.max(16, draft.length + 1)}ch`,
                fontFamily: 'inherit',
                fontSize: 'inherit',
                fontWeight: 'inherit',
                color: 'inherit',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                padding: 0,
              }}
            />
          ) : (
            <span
              title={onNameCommit ? `${shown} — double-click to rename` : shown}
              onDoubleClick={
                onNameCommit
                  ? (e) => {
                      e.stopPropagation()
                      setDraft(name ?? '')
                      setEditing(true)
                    }
                  : undefined
              }
              // An unnamed group says so where its name would be, in the same
              // grey italic the field's placeholder uses — it is a group waiting
              // to be named, not a group called nothing.
              style={{ ...ellipsis, flex: '0 1 auto', ...(name ? null : { fontStyle: 'italic', opacity: 0.6 }) }}
            >
              {name || 'write group name'}
            </span>
          )}
          <span style={{ flex: 1, minWidth: 0 }} />
          {totalAreaSqft != null && (
            <span title={`Everything in ${shown}`} style={{ ...AREA_FIGURE, color: '#555' }}>
              {formatArea(toDisplay(totalAreaSqft))} {AREA_UNIT}
            </span>
          )}
        </div>

        {/* LEFT PADDING ONLY. Nothing here sets a width, so the rooms inside
            still end on the panel's own right edge and every area figure stays
            on the one datum — a right padding is the single thing that would
            break that column. */}
        {open && (
          <div
            style={{
              paddingLeft: GROUP_BODY_LEFT,
              // The top takes less because each room's own branch already pads
              // by BLOCK_GAP above it; the bottom has nothing under it, so it
              // takes both and the rooms sit evenly inside the box.
              paddingTop: BLOCK_GAP,
              paddingBottom: BLOCK_GAP * 2,
              minWidth: 0,
            }}
          >
            {children}
          </div>
        )}
      </div>
    </Branch>
  )
}

// How far a room inside a group is from the box the tree branched out of — what
// RoomBlock's `inset` wants. The card's border counts: `inset` is measured from
// the card's OUTER edge, which is where the tree's columns are.
export const GROUP_ROOM_INSET = GROUP_BODY_LEFT + GROUP_BORDER

// A CARD FOR SOMETHING THE OPTION HAS NOT ADDED YET — a room, or a whole group
// of them. The catalog says what a department is built from, so the panel draws
// all of it and marks what is missing; the + on the branch's end adds it.
//
// The same idea the option CANVAS already uses for a section, a group or a
// department it does not hold. Quiet and dashed, so a list of them reads as an
// outline of what could be there rather than as a list of things that are.
export function GhostBlock({ name, note, onAdd, addTitle, head = ROOM_HEAD, inset = 0 }) {
  return (
    <Branch
      endpoint="add"
      padTop={BLOCK_GAP}
      head={BLOCK_GAP + head / 2}
      endX={insideBox(inset).endX}
      contentAt={BRANCH_BOX - inset}
      add={<AddButton onClick={onAdd} title={addTitle} size={ADD_ENDPOINT} />}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          border: GHOST_DASH,
          borderRadius: BLOCK_RADIUS,
          padding: `0 ${HEADER_PADDING_RIGHT}px 0 ${BRANCH_CONTENT - BRANCH_BOX}px`,
          minWidth: 0,
          color: GHOST_INK,
          fontSize: 13,
          fontStyle: 'italic',
          minHeight: head,
        }}
      >
        <span style={{ ...ellipsis, flex: '0 1 auto' }}>{name}</span>
        {note && <span style={{ flexShrink: 0, fontSize: 11, opacity: 0.8 }}>{note}</span>}
      </div>
    </Branch>
  )
}

// ONE read-only note: a labelled line behind a rule down its left edge.
//
// Everything the catalog says about a room and the option only reads — its
// general note, its suggested size — is drawn with this, so those all look like
// what they are: someone else's words, stated once and true everywhere.
// The label carries its OWN punctuation — "General Note:" ends in a colon,
// "Generic Room Size is" reads on into the figure. Adding a colon here would
// make one of the two ungrammatical.
export function CatalogNote({ label, children, title }) {
  return (
    <div
      title={title ?? 'From the catalog, the same for every option'}
      style={{
        borderLeft: '2px solid #ddd',
        paddingLeft: 8,
        marginTop: ROW_PAD,
        fontSize: 12,
        color: '#777',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      }}
    >
      <span style={{ fontWeight: 600, color: '#666' }}>{label}</span> {children}
    </div>
  )
}

// WHAT THE CATALOG SAYS ABOUT A ROOM, above its object list: the size it is
// usually built to, and the General Note. Ruled off from the objects, because a
// room's own description and the things standing in it are different kinds of
// statement and were running together.
//
// The size is a SUGGESTION. Nothing computes from it and it is allowed to
// disagree with the room's area, which is the figure that counts; see
// data/tree.js. The Tree tab passes the two commit handlers and edits it;
// everywhere else it reads as a note, like the note beneath it.
//
//   >>> EITHER SIDE UNSET AND THE SIZE DOES NOT RENDER AT ALL. Half a rectangle
//   >>> says nothing, and "12 × 0 ft" says something false.
//
// `children` is whatever else belongs in the same block — the General Note, in
// both panels. The whole block disappears when there is nothing in it.
export function RoomBrief({ widthFt, lengthFt, canEdit = false, onWidthCommit, onLengthCommit, children }) {
  const extras = useRoomExtras()
  const editable = canEdit && !!(onWidthCommit && onLengthCommit)
  const hasSize = widthFt > 0 && lengthFt > 0
  // A room with a size shows it. A room without one shows the empty pair only
  // once someone has asked for it with the + below — an empty 0 × 0 on every
  // room was a permanent line inviting input nobody was going to give. Outside a
  // RoomBlock there is no context and nothing changes.
  const show = hasSize || (editable && (extras?.showSize ?? true))
  if (!show && !children) return null

  return (
    <div
      style={{ paddingBottom: SUBTLE_GAP, marginBottom: SUBTLE_GAP, borderBottom: `1px solid ${SUBTLE_RULE}` }}
    >
      {show && editable ? (
        // The catalog's own field, empty pair and all: at this point someone has
        // asked to state a size, so the invitation is the point.
        <div
          // The × waits for the pointer, like every other remove in the app.
          // Mark this row and not the block, or the note's × below appears with
          // it — see REMOVE_BUTTON_STYLE.
          className="spp-hover-reveal"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: ROW_PAD,
            minWidth: 0,
            fontSize: 12,
            fontStyle: 'italic',
            color: '#777',
          }}
        >
          <span style={{ fontStyle: 'normal', fontWeight: 600, color: '#666', marginRight: 2 }}>
            Generic Room Size is
          </span>
          <CountField
            value={widthFt}
            min={0}
            prefix=""
            steppers={false}
            size="1em"
            colour="#777"
            title="Suggested width, in feet"
            onChange={() => {}}
            onCommit={onWidthCommit}
          />
          <span>×</span>
          <CountField
            value={lengthFt}
            min={0}
            prefix=""
            steppers={false}
            size="1em"
            colour="#777"
            title="Suggested length, in feet"
            onChange={() => {}}
            onCommit={onLengthCommit}
          />
          <span>ft</span>
          {/* Takes the size away: both halves cleared — either one at 0 is what
              makes the row stop rendering anyway — and the asking withdrawn.
              Nothing is lost that the catalog does not hold, and it is one undo
              step per half, as typing them was. */}
          {/* Hard right, not against the "ft": the fields grow with their digits
              and a × trailing them would sit at a different place on every room.
              The note's × below is on the same edge. */}
          <span style={{ flex: 1 }} />
          <RemoveButton
            size={OBJECT_CONTROL}
            title="Remove the suggested size"
            onRemove={() => {
              onWidthCommit(0)
              onLengthCommit(0)
              extras?.hideSize()
            }}
          />
        </div>
      ) : (
        show && (
          <CatalogNote label="Generic Room Size is" title="The size this room is usually built to — a suggestion">
            {widthFt} × {lengthFt} ft
          </CatalogNote>
        )
      )}

      {children}
    </div>
  )
}

// THE OPTIONAL PARTS OF A ROOM ARE ASKED FOR, not always drawn.
//
// A suggested size and a note are things SOME rooms have. Drawn unconditionally,
// each spent a permanent line — the note a 46px box — on every room that has
// neither, which is most of them; a panel of twelve rooms was mostly empty
// fields inviting input nobody was going to give.
//
// So a room that has one shows it, and a room that has not offers a + beside its
// object picker. There is no way to take one away again and there does not need
// to be: emptying the field is what clears it, and the row goes on its own the
// next time the panel is drawn.
//
// The state belongs to ONE ROOM, which is why it lives in RoomBlock rather than
// in the panels: a room is rendered inside a `.map`, so a hook per room in the
// panel would change hook order as rooms are added and removed.
const RoomExtras = createContext(null)

// Null outside a RoomBlock — the Companion draws rooms, and a caller that has
// not opted in keeps drawing whatever it always drew.
function useRoomExtras() {
  return useContext(RoomExtras)
}

// The row under a room's object list: its picker, then a + for each part the
// room has not got yet. One row, because they are the same kind of act — "this
// room also has a…" — and three separate lines of + would be taller than the
// fields they are hiding.
//
// IT IS THE LAST BRANCH, and the + stands on its end: the thing the tree is
// pointing at is the thing you press. The canvas's ghost + is the same idea.
export function RoomAddRow({ children }) {
  const extras = useRoomExtras()
  const offers = [
    extras?.canAddSize && !extras.showSize && { key: 'size', label: 'Add size', onClick: extras.revealSize },
    extras?.canAddNote && !extras.showNote && { key: 'note', label: 'Add note', onClick: extras.revealNote },
  ].filter(Boolean)

  // The + is an object's size here rather than a room's, so it takes the
  // branch's end at its own half-width.
  return (
    <Branch
      {...BODY}
      endpoint="add"
      head={BLOCK_GAP + OBJECT_CONTROL / 2}
      contentAt={BODY.endX - OBJECT_CONTROL / 2}
    >
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', minWidth: 0 }}>
      {children}
      {offers.map((offer) => (
        <span
          key={offer.key}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: BLOCK_GAP }}
        >
          {/* The object picker's size, not AddButton's default: these sit on
              one row with it and act on the same tier — one part of a room. */}
          <AddButton onClick={offer.onClick} title={offer.label} size={OBJECT_CONTROL} />
          <span style={{ fontSize: 12, color: '#888' }}>{offer.label}</span>
        </span>
      ))}
    </div>
    </Branch>
  )
}

// A room's editable note.
//
// The catalog's General Note is NOT here — it sits in RoomBrief, above the
// object list, with the size: the two are what the catalog says about the room
// and belong together at the top. This is the box someone types in, which stays
// at the foot where a note is written after reading what is above it.
//
// It draws when the room HAS a note, or once one has been asked for with the +
// beside the object picker — see RoomExtras. On the Tree tab it is the catalog's
// own note; on the Project tab it is this option's second note.
//
// `onChange` reports each keystroke, for the Project tab, where Save Data has to
// notice; `onCommit` fires on blur, for the Tree tab, where each edit is a
// write. Callers pass whichever they need, exactly as CountField takes both.
export function RoomNotes({ note, canEdit = false, onChange, onCommit }) {
  const extras = useRoomExtras()
  const [draft, setDraft] = useState(note ?? '')
  const [focused, setFocused] = useState(false)

  // An undo, a discard, or a reload changes the note under a field nobody is
  // typing in.
  useEffect(() => {
    if (!focused) setDraft(note ?? '')
  }, [note, focused])

  if (!(canEdit && (onChange || onCommit))) return null
  // The box appears when the room HAS a note, or once someone has asked for one
  // with the + below. Empty on every room it was the tallest thing in the block.
  if (!(extras?.showNote ?? true)) return null

  return (
    // The × sits beside the box rather than over it: a textarea is resizable
    // from its own bottom-right corner and anything floated inside fights it.
    <div className="spp-hover-reveal" style={{ display: 'flex', alignItems: 'flex-start', gap: 4, minWidth: 0 }}>
      <textarea
        value={draft}
        rows={2}
        placeholder="Notes"
        onChange={(e) => {
          setDraft(e.target.value)
          onChange?.(e.target.value)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          onCommit?.(draft)
        }}
        style={{
          width: '100%',
          marginTop: BLOCK_GAP,
          boxSizing: 'border-box',
          resize: 'vertical',
          border: '1px solid #ddd',
          borderRadius: 4,
          padding: '4px 6px',
          fontFamily: 'inherit',
          fontSize: 12,
          color: '#333',
          background: '#fff',
        }}
      />
      {/* Empties the note and withdraws the asking. Both reports fire: the
          Project tab is listening to onChange for Save Data, the Tree tab to
          onCommit for its write, and this is the one edit that happens without
          the field being touched. */}
      <span style={{ marginTop: BLOCK_GAP + 2 }}>
        <RemoveButton
          size={OBJECT_CONTROL}
          title="Remove this note"
          onRemove={() => {
            setDraft('')
            onChange?.('')
            onCommit?.('')
            extras?.hideNote()
          }}
        />
      </span>
    </div>
  )
}

// The one muted line: "nothing here yet", "pick something first". It was spelt
// six ways across five files. `pad` is for the times it stands alone in an empty
// panel rather than sitting under a list.
export function PanelNote({ children, pad = false }) {
  return <div style={{ fontSize: pad ? 13 : 12, color: '#999', padding: pad ? 24 : '4px 0' }}>{children}</div>
}
