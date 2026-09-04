// ONE value you replace or clear.
//
// The counterpart to SearchAddPicker, which appends to a list. Here there is
// room for exactly one answer, so the + disappears once something is chosen and
// what is chosen is shown with its own × instead.
//
// That behaviour — set: name and a ×; unset: a picker; unset and read-only: a
// muted "Not set" — was TreeNodePicker's alone, and the schedule strip needed
// the same thing in a narrower space. Rather than a second copy of it (see
// CLAUDE.md on how the pickers and panels drifted), the behaviour lives here
// once and the two shapes differ only in `compact`:
//
//   block    a caption, the value in bold, a quiet detail line beneath it.
//            What TreeNodePicker draws: it has a path to show and room to show
//            it in.
//   compact  one row — caption, value, × — for a strip of several of these
//            stacked inside a room block, where a three-line block each would
//            be taller than the room's own contents.
//
// It holds no data and knows nothing about what is being picked: callers hand
// it `options` ({ id, name, path? }, as SearchAddPicker takes them) and the
// resolved display strings.

import RemoveButton from './RemoveButton.jsx'
import { SearchAddPicker } from './SearchAddPicker.jsx'

export default function ValuePicker({
  // The caption. Also what the clear button and the picker name in their
  // tooltips, so it reads as a noun: "Occupancy", "Department".
  label,
  // Whether something is chosen. Explicit rather than inferred from `name`,
  // because a value can be set and still have no name to show — an id whose
  // row has since been deleted.
  set,
  name,
  // Drawn immediately after the name, small and quiet: a kind, a source, a
  // qualifier. A node, not a string, since callers style their own.
  suffix,
  // The quiet line under the name in `block`, and dropped entirely in
  // `compact`, which has no room for it.
  detail,
  // 'muted' | 'warn' — warn is for a detail that reports a problem, such as a
  // binding whose target has left the catalog.
  detailTone = 'muted',
  options,
  placeholder,
  chooseLabel = 'Choose',
  // A value that is in force without being SET here — one inherited from
  // somewhere else, which picking would override. Drawn muted and underlined
  // beside the picker, so the row reads as answered while the + still offers to
  // answer it differently.
  //
  // `compact` only: the block layout's callers have nothing to inherit from.
  hint,
  // Shown in place of the picker when there is nothing to choose from. The
  // caller knows why the list is empty; this component only knows that it is.
  emptyNote = 'Nothing to choose from',
  // Shown instead of a picker when read-only and nothing is set.
  unsetNote = 'Not set',
  canEdit = true,
  compact = false,
  size = 16,
  width = 320,
  onPick,
  onClear,
}) {
  const picker =
    options.length > 0 ? (
      <SearchAddPicker
        options={options}
        placeholder={placeholder}
        title={`Choose ${label}`}
        label={chooseLabel}
        size={size}
        width={width}
        onAdd={onPick}
      />
    ) : (
      <span style={{ fontSize: 12, color: '#999' }}>{emptyNote}</span>
    )

  if (compact) {
    return (
      // No wrapping: the caption and the × are fixed, and the value between
      // them ellipsises rather than pushing the × out of a narrow panel — the
      // same rule ObjectRow follows.
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', minWidth: 0 }}>
        <span style={{ width: 76, flexShrink: 0, fontSize: 11, color: '#777' }}>{label}</span>

        {set ? (
          <>
            <span
              title={name ?? undefined}
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 12,
              }}
            >
              {name}
              {suffix}
            </span>
            {canEdit && <RemoveButton onRemove={onClear} title={`Clear ${label}`} size={14} />}
          </>
        ) : (
          // The picker sits where the value would, so a strip of these lines up
          // whether or not each row has an answer yet. Its own wrapper carries
          // a marginTop, which is pulled back out here to keep the row on one
          // baseline.
          <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            {hint && (
              <span
                title={typeof hint === 'string' ? hint : undefined}
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 12,
                  color: '#999',
                  borderBottom: '1px dashed #ccc',
                }}
              >
                {hint}
              </span>
            )}
            {canEdit ? (
              // flex/minWidth, not shrink-to-fit: SearchAddPicker's popover is
              // positioned against THIS box and capped at maxWidth 100%, so a
              // wrapper only as wide as the + button crushes the dropdown to a
              // 20px column of single letters.
              <span style={{ flex: 1, minWidth: 0, marginTop: -8 }}>{picker}</span>
            ) : (
              !hint && <span style={{ fontSize: 12, color: '#bbb' }}>{unsetNote}</span>
            )}
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: '#777', marginBottom: 2 }}>{label}</div>

      {set ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>
              {name}
              {suffix}
            </div>
            {detail && (
              <div
                style={{
                  fontSize: 11,
                  color: detailTone === 'warn' ? '#c17' : '#999',
                  overflowWrap: 'anywhere',
                }}
              >
                {detail}
              </div>
            )}
          </div>
          {canEdit && <RemoveButton onRemove={onClear} title={`Clear ${label}`} size={size} />}
        </div>
      ) : canEdit ? (
        picker
      ) : (
        <div style={{ fontSize: 12, color: '#bbb' }}>{unsetNote}</div>
      )}
    </div>
  )
}
