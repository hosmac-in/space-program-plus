// One row per field of a room's schedules, loads or HVAC — a number, a choice,
// or a yes/no. Rendered inside RoomEnergyStrip, never on its own.
//
// ONE definition, used by both side panels and by all three groups. What a field
// IS lives in data/roomEnergy.js; this is only how one is drawn.
//
// EVERY ROW IS THE SAME THREE COLUMNS: label, value, reset. The value column is
// a fixed width and everything in it is right-aligned — a figure, a dropdown, a
// switch — so the eye runs down one edge instead of tracking a ragged one. That
// is the whole reason a switch is used for a boolean rather than a checkbox with
// a word beside it: it occupies the value column like a number does.
//
// There is NO empty state. Every field has a fallback (see data/roomEnergy.js),
// so a row always shows a value and is always editable — no em dash, no "set
// this first" button, nothing that makes one row taller or wider than its
// neighbours.
//
// WHAT THE TWO PANELS MEAN BY A ROW
//
//   Tree tab      'here' or unset. There is nothing to inherit from — this IS
//                 the thing others inherit from.
//   Project tab   'inherited' is drawn muted and underlined; changing it IS the
//                 override, and a ↺ reverts to whatever the catalog says.
//
// A row nobody has answered at either level (`source: null`) is drawn muted
// too — it is showing you the fallback, not somebody's answer, and the two
// should not read alike.

import { formatField } from '../../data/roomEnergy.js'
import { CountField } from './panelParts.jsx'
import ResetButton from '../primitives/ResetButton.jsx'
import Toggle from '../primitives/Toggle.jsx'
import { CONTROL_SLOT, PAIR_WIDTH, VALUE_WIDTH } from './panelLayout.js'

export default function EnergyFieldRows({
  rows,
  roomName = 'this room',
  // The ROOM's function colours, for the one control that needs a fill of its
  // own — see Toggle. Everything else here inherits its ink from the band.
  colours,
  canEdit = true,
  // Reports as it is edited — for the Project tab, where Save Data must notice.
  onChange,
  // Fires when the field is left — for the Tree tab, where each edit is a write
  // and a keystroke must not be one. A choice and a switch are finished the
  // moment they change, so they call both.
  onCommit,
  // Only the Project tab has anything to revert to.
  onReset,
}) {
  const settle = (field, value) => {
    onChange?.(field, value)
    onCommit?.(field, value)
  }

  return rows.map((row) => {
    const stated = row.source != null
    const inherited = row.source === 'inherited'
    const overridden = row.source === 'option'

    // A row governed by another that is currently off — an air change figure in
    // an unconditioned room. It is drawn faint and cannot be edited, but it is
    // still DRAWN, with its value: the row is not irrelevant, it is not in
    // force, and hiding it would make the column jump every time the switch
    // moved. Its reset goes too, since reverting a field you cannot edit is a
    // change you cannot see.
    const dead = !!row.disabled
    const editable = canEdit && !dead

    return (
      <div
        key={row.key}
        // spp-row highlights the whole row under the pointer, which is what ties
        // a label to the value across the gap from it; spp-hover-reveal is what
        // brings out the reset at the same moment.
        className="spp-row spp-hover-reveal"
        // paddingBlock, NOT the `padding` shorthand: the shorthand resets the
        // padding-inline that .spp-row uses to cancel its own negative margin,
        // which left every row sitting 4px left of the heading above it.
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingBlock: 3,
          minWidth: 0,
          fontSize: 11,
          // The whole row fades, label included — it is the row that does not
          // apply, not just its value.
          opacity: dead ? 0.4 : 1,
        }}
      >
        <span
          style={{ flex: 1, minWidth: 0, opacity: 0.8 }}
          title={dead ? `Not in force: ${roomName} is not conditioned` : undefined}
        >
          {row.label}
        </span>

        <span
          style={{
            width: row.type === 'pair' ? PAIR_WIDTH : VALUE_WIDTH,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            // Muted while it is the catalog's answer or the fallback rather than
            // one given here; underlined only when there is somebody's answer
            // behind it to revert to.
            opacity: stated && !inherited ? 1 : 0.6,
            borderBottom: inherited ? '1px dashed currentColor' : '1px solid transparent',
          }}
        >
          {/* TWO FIELDS, ONE ROW. Each half writes its own jsonb key and is a
              plain number field; only the label, the slot and — when both
              halves are in the same unit — the unit are shared. The separator
              is a slash rather than an en dash: this is two values, not a range
              between them, and 21 – 24 reads as a subtraction. */}
          {row.type === 'pair' &&
            row.parts.map((part, i) => (
              <span key={part.key} style={{ display: 'inline-flex', alignItems: 'center' }}>
                {i > 0 && <span style={{ opacity: 0.45, padding: '0 3px' }}>/</span>}
                <CountField
                  value={part.value}
                  canEdit={editable}
                  min={0}
                  step={part.step}
                  decimals={part.decimals}
                  prefix=""
                  // The shared unit prints ONCE, after the last half. Two copies
                  // of "°C" is what makes a pair too wide to fit.
                  suffix={part.unit || (i === row.parts.length - 1 ? row.unit : null) || null}
                  steppers={false}
                  size="1em"
                  colour="inherit"
                  title={part.describe(roomName)}
                  onChange={(value) => onChange?.(part, value)}
                  onCommit={onCommit ? (value) => onCommit(part, value) : undefined}
                />
              </span>
            ))}

          {row.type === 'number' && (
            <CountField
              value={row.value}
              canEdit={editable}
              // Nought people is a real answer, so these floor at zero rather
              // than at one.
              min={0}
              step={row.step}
              decimals={row.decimals}
              prefix=""
              suffix={row.unit || null}
              // TYPED, NEVER NUDGED — the same treatment a room's area gets, and
              // for the same two reasons: these are figures read off a schedule
              // or a standard rather than arrived at by stepping, and in half a
              // panel the − and + take the room the unit needs.
              steppers={false}
              size="1em"
              colour="inherit"
              title={row.describe(roomName)}
              onChange={(value) => onChange?.(row, value)}
              onCommit={onCommit ? (value) => onCommit(row, value) : undefined}
            />
          )}

          {row.type === 'choice' && (
            // A <select>, not a picker popover: a handful of options do not need
            // searching, and the answer stays visible without opening anything.
            <select
              value={row.value ?? ''}
              disabled={!editable}
              title={row.describe(roomName)}
              onChange={(e) => settle(row, e.target.value)}
              style={{
                font: 'inherit',
                fontSize: 11,
                color: 'inherit',
                background: 'transparent',
                border: 'none',
                cursor: editable ? 'pointer' : 'default',
                padding: 0,
                maxWidth: '100%',
                textAlign: 'right',
                // Firefox honours text-align on a select; Chrome needs the
                // direction flip to right-align the closed value.
                textAlignLast: 'right',
              }}
            >
              {row.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}

          {row.type === 'boolean' && (
            <Toggle
              checked={!!row.value}
              disabled={!editable}
              tint={colours?.inverted.color}
              title={row.describe(roomName)}
              onChange={(next) => settle(row, next)}
            />
          )}
        </span>

        {/* Reverts to the catalog's value, or to nothing when it states none —
            clearing an override removes it rather than writing a 0 or a No.
            Only an overridden row has anything to revert. */}
        <span
          style={{ width: CONTROL_SLOT, flexShrink: 0, display: 'inline-flex', justifyContent: 'center' }}
        >
          {overridden && !dead && onReset && (
            <ResetButton
              // A pair reverts only the halves that were actually overridden —
              // one ↺ for the row, but never touching a half that was already
              // the catalog's. Each is a separate call because each is a
              // separate key.
              onReset={() =>
                row.type === 'pair'
                  ? row.parts.filter((p) => p.source === 'option').forEach((p) => onReset(p))
                  : onReset(row)
              }
              title={
                row.type === 'pair'
                  ? 'Back to the catalog'
                  : row.inherited != null
                    ? `Back to the catalog's ${formatField(row, row.inherited)}`
                    : `Back to the catalog, which states none — ${formatField(row, row.fallback)}`
              }
            />
          )}
        </span>
      </div>
    )
  })
}
