// Chrome shared by BOTH side panels: the Tree tab's rooms panel and the Project
// tab's department block.
//
// Both draw a department, the rooms in it, and the objects in each room. Only
// what they mean by those differs — the Tree edits the shared catalog, the
// Project edits one option — so everything visual lives here and each panel
// keeps only its own data mapping and its own writes.
//
// They were two copies and they drifted, exactly as the canvases once did: a
// row of room chips was removed from one and left in the other, one room block
// grew a white body, the count inputs ended up different widths. If you need to
// change how a room or an object looks, change it here.
//
// No data access, no writes, no knowledge of either data shape: callers resolve
// their nodes into these props.

import RemoveButton from '../primitives/RemoveButton.jsx'
import { formatArea } from '../map/area.js'
import { useEffect, useState } from 'react'
import { BLOCK_PADDING, BLOCK_RADIUS, COUNT_WIDTH, HEADER_PADDING, OBJECT_CONTROL, ROOM_CONTROL } from './panelLayout.js'

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

// Where a department sits, as one line. An unresolvable half shows as a dash
// rather than blanking, so the shape of the path is always legible.
export function formatPath(sectionName, groupName) {
  if (!sectionName && !groupName) return null
  return `${sectionName ?? '—'} → ${groupName ?? '—'}`
}

// The department the panel is about: its name, and where it sits in the tree.
export function PanelHeading({ name, path, note, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, overflowWrap: 'anywhere' }}>{name}</div>
        {path && (
          <div style={{ fontSize: 11, opacity: 0.75, overflowWrap: 'anywhere' }}>
            {path}
            {note && <span style={{ marginLeft: 6, color: '#c17' }}>{note}</span>}
          </div>
        )}
      </div>
      {right}
    </div>
  )
}

// One object in one room.
//
// Both panels list objects; only the Project tab counts them. The catalog says
// what a room may contain, an option says how many — so `count` and `area` are
// both optional here, and the Tree passes neither: its rows are a name and a
// remove button.
//
// A count reports every keystroke, so whatever depends on it — the Save Data
// button, the totals — answers while you are still typing. It waited for blur
// once, and the button stayed grey over a number you had already changed.
//
// Typing "120" is therefore three reports, but ONE undo step: the caller
// coalesces consecutive edits to the same object (see `coalesce` in
// InstanceBuilder). The draft is still local so a half-typed or empty field
// never reaches the option — only values that parse.
export function ObjectRow({ name, type, count, area, canEdit = true, onCountChange, onRemove }) {
  const [draft, setDraft] = useState(String(count ?? ''))

  // An undo, a discard, or an edit made elsewhere changes the count under a row
  // nobody is typing in.
  useEffect(() => setDraft(String(count ?? '')), [count])

  // While typing: report anything that parses to a real count, ignore the rest
  // (an empty field, a lone minus) rather than forcing a 1 under the caret.
  const typeCount = (text) => {
    setDraft(text)
    const n = Math.floor(Number(text))
    if (Number.isFinite(n) && n >= 1 && n !== count) onCountChange(n)
  }

  // On the way out: settle whatever is in the field to a legal value.
  const commit = () => {
    const next = Math.max(1, Math.floor(Number(draft) || 0))
    setDraft(String(next))
    if (next !== count) onCountChange(next)
  }

  return (
    // No wrapping: the row is narrow, so the name takes whatever the fixed
    // controls on the right don't need and ellipsises rather than pushing them
    // out of the panel.
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', minWidth: 0 }}>
      <span title={name} style={{ ...ellipsis, fontSize: 13 }}>
        {name} {type ? `(${type})` : ''}
      </span>

      {count == null ? null : canEdit ? (
        <input
          type="number"
          min={1}
          value={draft}
          onChange={(e) => typeCount(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setDraft(String(count))
          }}
          title={`How many ${name}`}
          style={{ width: COUNT_WIDTH, flexShrink: 0, padding: '2px 4px', boxSizing: 'border-box' }}
        />
      ) : (
        <span style={{ width: COUNT_WIDTH, textAlign: 'right', flexShrink: 0, fontSize: 13, color: '#555' }}>
          × {count}
        </span>
      )}

      {area !== undefined && (
        <span style={{ width: 62, textAlign: 'right', flexShrink: 0, fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
          {area != null ? `${formatArea(area)} sqft` : 'no area'}
        </span>
      )}

      {canEdit && onRemove && (
        <RemoveButton onRemove={onRemove} title={`Remove ${name}`} size={OBJECT_CONTROL} />
      )}
    </div>
  )
}

// One room: a coloured header carrying its name and its remove button, then a
// body holding whatever the caller puts in it — object rows, and its own picker.
//
// Deliberately not `overflow: hidden`: a picker's dropdown is absolutely
// positioned below its input and has to escape the block's bottom edge. The
// header rounds its own top corners instead.
export function RoomBlock({ colours, name, type, canEdit = true, onRemove, children }) {
  return (
    <div style={{ border: `1px solid ${colours.border}`, borderRadius: BLOCK_RADIUS, marginTop: 8, minWidth: 0 }}>
      <div
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
        <span title={name} style={ellipsis}>
          {name} {type ? `(${type})` : ''}
        </span>
        {canEdit && onRemove && <RemoveButton onRemove={onRemove} title={`Remove ${name}`} size={ROOM_CONTROL} />}
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

// The one muted line: "nothing here yet", "pick something first". It was spelt
// six ways across five files. `pad` is for the times it stands alone in an empty
// panel rather than sitting under a list.
export function PanelNote({ children, pad = false }) {
  return <div style={{ fontSize: pad ? 13 : 12, color: '#999', padding: pad ? 24 : '4px 0' }}>{children}</div>
}
