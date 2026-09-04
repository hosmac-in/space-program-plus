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

import RemoveButton from '../primitives/RemoveButton.jsx'
import { formatArea } from '../map/area.js'
import { useEffect, useRef, useState } from 'react'
import {
  AREA_WIDTH,
  BLOCK_PADDING,
  BLOCK_RADIUS,
  CONTROL_SLOT,
  HEADER_PADDING,
  OBJECT_CONTROL,
  ROOM_CONTROL,
  SUBTLE_GAP,
  SUBTLE_RULE,
} from './panelLayout.js'

const ellipsis = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

// The box the whole panel sits in, painted with the department's own function
// colour — the same pale wash its card wears on either canvas, so the pane
// visibly belongs to the card you clicked.
export function PanelShell({ colours, children }) {
  return (
    <div
      style={{
        border: `2px solid ${colours.inverted.border}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        background: colours.inverted.background,
        color: colours.inverted.color,
        minWidth: 0,
      }}
    >
      {children}
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
// department 22, room 14 (bold), object 13, path 12.
export function PanelHeading({ name, path, note, right }) {
  return (
    <div style={{ minWidth: 0 }}>
      {/* Above the name: context is read on the way in, and below the name it
          collided with the figures beside it. */}
      {path && (
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 1, overflowWrap: 'anywhere' }}>
          {path}
          {note && <span style={{ marginLeft: 6, color: '#c17' }}>{note}</span>}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
        <div
          style={{ flex: 1, minWidth: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2, overflowWrap: 'anywhere' }}
        >
          {name}
        </div>
        {right}
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
  size = '0.75em',
  // Off for a figure that is always typed rather than nudged. An area is a
  // measurement someone reads off a drawing — stepping it from 0 is not how it
  // is ever arrived at, and the buttons only take room from the column it has
  // to line up in.
  steppers = true,
  // Fixed width for the whole field, so a column of them aligns. Without it
  // each sizes to its own digits and sits against the text it follows.
  width = null,
}) {
  // At rest a figure is shown at its full precision — "1.00", not "1" — so the
  // field keeps the same width as it is stepped and the − / + beside it do not
  // shuffle sideways under the pointer. Only at rest: reformatting what someone
  // is halfway through typing moves the caret out from under them.
  const format = (n) => (decimals > 0 ? Number(n ?? 0).toFixed(decimals) : String(n ?? ''))

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
  // being reported as typed. decimals: 0 floors, exactly as this always did.
  const quantise = (n) => (decimals > 0 ? Math.round(n * 10 ** decimals) / 10 ** decimals : Math.floor(n))

  // Whatever is in the field, as a legal value.
  const settle = (raw) => {
    const parsed = Number(raw)
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

  const shown = decimals > 0 ? Number(value).toFixed(decimals) : value

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
        width: 13,
        height: 13,
        lineHeight: '11px',
        padding: 0,
        fontSize: 11,
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
        type="number"
        // Suppresses the native spinner in both engines — see index.css.
        className="count-field"
        min={min}
        step={step}
        value={draft}
        onChange={(e) => typeCount(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(String(value))
        }}
        title={title}
        style={{
          // Sized to its own contents so the figure sits against the name
          // rather than in a fixed column. The floor keeps a single digit from
          // collapsing to nothing.
          width: `${Math.max(1.6, String(draft).length + 0.4)}ch`,
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
  return (
    // No wrapping: the row is narrow, so the name takes whatever the fixed
    // controls on the right don't need and ellipsises rather than pushing them
    // out of the panel.
    //
    // spp-row highlights the whole row under the pointer, tying the name to the
    // figures across the gap from it; spp-hover-reveal brings out the × at the
    // same moment — see RemoveButton.
    <div
      className="spp-row spp-hover-reveal"
      // paddingBlock, NOT the `padding` shorthand — see the note in
      // EnergyFieldRows: the shorthand resets .spp-row's padding-inline and the
      // row ends up offset by its own negative margin.
      style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBlock: 4, minWidth: 0 }}
    >
      {/* The type is deliberately NOT drawn. "AHU Machine (mep_equipment)" spent
          most of a narrow row on a word that repeats what the name already
          says, and ellipsised the half that identifies the thing. `type` is
          still taken, and still the tooltip, so putting it back is one line. */}
      <span
        title={type ? `${name} (${type})` : name}
        style={{
          ...ellipsis,
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

      {/* Same column as the room's own area in the header above — see
          AREA_WIDTH. The two have to line up: one is the room, the rest are
          what is in it. */}
      {area !== undefined && (
        <span
          style={{
            width: AREA_WIDTH,
            textAlign: 'right',
            flexShrink: 0,
            fontSize: 12,
            fontStyle: 'italic',
            color: tone === 'warn' ? '#c11' : '#555',
            whiteSpace: 'nowrap',
          }}
        >
          {area != null ? `${formatArea(area)} sqft` : 'no area'}
        </span>
      )}

      <span style={{ width: CONTROL_SLOT, flexShrink: 0, display: 'inline-flex', justifyContent: 'center' }}>
        {canEdit && onRemove && (
          <RemoveButton onRemove={onRemove} title={`Remove ${name}`} size={OBJECT_CONTROL} />
        )}
      </span>
    </div>
  )
}

// One room: a coloured header carrying its name, how many of it, and its remove
// button, then a body holding whatever the caller puts in it — object rows, and
// its own picker.
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
  // The area of ONE of this room, typed. The Project tab's is this option's
  // figure; the Tree tab's is the catalog default an option starts from.
  areaSqft,
  canEdit = true,
  onCountChange,
  onAreaChange,
  // Called once when the field is left, for the caller that WRITES on each edit
  // — the Tree tab, where a keystroke would be a whole-section jsonb write. The
  // Project tab edits in memory and needs only onAreaChange.
  onAreaCommit,
  onRemove,
  children,
}) {
  return (
    <div style={{ border: `1px solid ${colours.border}`, borderRadius: BLOCK_RADIUS, marginTop: 8, minWidth: 0 }}>
      <div
        // The header, not the whole block: marking the block would reveal every
        // object row's × inside it at once — see RemoveButton.
        className="spp-hover-reveal"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: HEADER_PADDING,
          background: colours.background,
          color: colours.color,
          fontWeight: 600,
          minWidth: 0,
          borderRadius: `${BLOCK_RADIUS - 1}px ${BLOCK_RADIUS - 1}px 0 0`,
        }}
      >
        {/* Name and count read as one phrase — "Consultation Room ×10" — so the
            count sits immediately after the name rather than being flung to the
            far edge. The name shrinks and ellipsises before the count does; the
            spacer after them is what holds the × against the right edge. */}
        <span title={name} style={{ ...ellipsis, flex: '0 1 auto' }}>
          {name} {type ? `(${type})` : ''}
        </span>
        {count != null && (
          <CountField
            value={count}
            canEdit={canEdit && !!onCountChange}
            onChange={onCountChange}
            title={`How many ${name}`}
            // The header is painted with the room's function colour, so a
            // read-only figure takes the ink that colour was paired with.
            colour="inherit"
          />
        )}
        <span style={{ flex: 1, minWidth: 0 }} />

        {/* The room's own area, typed — the objects do not add up to it. Held
            against the right edge rather than against the name: it is a
            measurement of the room, not part of what the room is called. */}
        {areaSqft != null && (
          <CountField
            value={areaSqft}
            canEdit={canEdit && !!(onAreaChange || onAreaCommit)}
            onChange={onAreaChange ?? (() => {})}
            onCommit={onAreaCommit}
            // A room may legitimately have no area entered yet, so unlike a
            // count this floors at zero.
            min={0}
            prefix=""
            suffix="sqft"
            // Typed, never nudged — see CountField.
            steppers={false}
            width={AREA_WIDTH}
            title={`Area of one ${name}`}
            colour="inherit"
          />
        )}

        <span
          style={{ width: CONTROL_SLOT, flexShrink: 0, display: 'inline-flex', justifyContent: 'center' }}
        >
          {canEdit && onRemove && <RemoveButton onRemove={onRemove} title={`Remove ${name}`} size={ROOM_CONTROL} />}
        </span>
      </div>

      {/* White, so object rows stay legible whatever colour the room's function
          paints the header and whatever the panel behind it is tinted. */}
      <div
        style={{
          padding: BLOCK_PADDING,
          minWidth: 0,
          background: '#fff',
          color: '#1a1a1a',
          borderRadius: `0 0 ${BLOCK_RADIUS - 1}px ${BLOCK_RADIUS - 1}px`,
        }}
      >
        {children}
      </div>
    </div>
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
        marginTop: 6,
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
  const editable = canEdit && !!(onWidthCommit && onLengthCommit)
  const hasSize = widthFt > 0 && lengthFt > 0
  if (!editable && !hasSize && !children) return null

  return (
    <div
      style={{ paddingBottom: SUBTLE_GAP, marginBottom: SUBTLE_GAP, borderBottom: `1px solid ${SUBTLE_RULE}` }}
    >
      {editable ? (
        // The catalog's own field. Always drawn for an author, even at 0 × 0,
        // because an empty pair is the invitation to state one.
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 6,
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
        </div>
      ) : (
        hasSize && (
          <CatalogNote label="Generic Room Size is" title="The size this room is usually built to — a suggestion">
            {widthFt} × {lengthFt} ft
          </CatalogNote>
        )
      )}

      {children}
    </div>
  )
}

// A room's editable note.
//
// The catalog's General Note is NOT here — it sits in RoomBrief, above the
// object list, with the size: the two are what the catalog says about the room
// and belong together at the top. This is the box someone types in, which stays
// at the foot where a note is written after reading what is above it.
//
// It always draws, since its emptiness is the invitation. On the Tree tab it is
// the catalog's own note; on the Project tab it is this option's second note.
//
// `onChange` reports each keystroke, for the Project tab, where Save Data has to
// notice; `onCommit` fires on blur, for the Tree tab, where each edit is a
// write. Callers pass whichever they need, exactly as CountField takes both.
export function RoomNotes({ note, canEdit = false, onChange, onCommit }) {
  const [draft, setDraft] = useState(note ?? '')
  const [focused, setFocused] = useState(false)

  // An undo, a discard, or a reload changes the note under a field nobody is
  // typing in.
  useEffect(() => {
    if (!focused) setDraft(note ?? '')
  }, [note, focused])

  if (!(canEdit && (onChange || onCommit))) return null

  return (
    <div style={{ minWidth: 0 }}>
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
          marginTop: 6,
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
    </div>
  )
}

// The one muted line: "nothing here yet", "pick something first". It was spelt
// six ways across five files. `pad` is for the times it stands alone in an empty
// panel rather than sitting under a list.
export function PanelNote({ children, pad = false }) {
  return <div style={{ fontSize: pad ? 13 : 12, color: '#999', padding: pad ? 24 : '4px 0' }}>{children}</div>
}
