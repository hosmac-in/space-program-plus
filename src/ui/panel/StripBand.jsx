// The collapsed band across the top of a room's body, and the disclosure that
// opens it. Schedules use one; loads use another.
//
// Extracted rather than copied for the reason panelParts.jsx exists: the second
// band would have been a copy of the first, and the two would have drifted on
// the first fix — this file is the padding, the caret, the summary line and the
// full-bleed geometry, once.
//
// IT IS COLLAPSED BY DEFAULT, AND THAT IS THE WHOLE DESIGN
//
// Several rows on every room cost more height than the room's own contents and
// turn a department into a wall of controls, most of them for values nobody has
// set. A room's objects are what the panel is for.
//
// SO THE RESTING STATE IS JUST THE HEADING. It carried a summary of everything
// in force, and that was worse than nothing: every field has a fallback now, so
// the line filled with "0 lux · Unpressured · No" — a wall of text restating
// defaults, on every room, in the one place that was meant to save space.
// Whoever wants the values opens the band.

import { useState } from 'react'
import { BLOCK_PADDING } from './panelLayout.js'

export default function StripBand({
  // What the band is called — "Energy".
  title,
  // The ROOM's function colours, from functionColours(). Never reach for
  // bg_colour directly: a null function_id is normal and functionColours is what
  // resolves it (see data/functions.js).
  colours,
  children,
}) {
  const [open, setOpen] = useState(false)

  return (
    // A full-bleed band flush under the room's header: the negative margins
    // cancel the body's own padding, which is why BLOCK_PADDING is imported
    // rather than guessed. Butting against the header is what makes it read as
    // part of the room rather than as the first item in its object list.
    //
    // Painted in the room's own function colour, inverted — the same pale wash a
    // department card wears on a group, and for the same reason: it sits on
    // white and has to stay unmistakably the room's own hue.
    <div
      style={{
        margin: `-${BLOCK_PADDING}px -${BLOCK_PADDING}px ${BLOCK_PADDING}px`,
        padding: `4px ${BLOCK_PADDING}px ${open ? 6 : 4}px`,
        background: colours.inverted.background,
        borderBottom: `1px solid ${colours.inverted.border}`,
        color: colours.inverted.color,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? `Hide ${title.toLowerCase()}` : `Edit ${title.toLowerCase()}`}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          width: '100%',
          minWidth: 0,
          padding: '2px 0',
          background: 'none',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        {/* Rotated rather than swapped for a second glyph, so the caret keeps
            its exact size and baseline in both states. */}
        <span
          style={{
            fontSize: 9,
            flexShrink: 0,
            display: 'inline-block',
            opacity: 0.6,
            transform: open ? 'rotate(90deg)' : 'none',
          }}
        >
          ▶
        </span>
        {/* Ink inherited from the band, not a fixed grey: the wash is a
            different hue on every room, and a grey that reads on a pale mint
            does not read on a pale navy. */}
        <span style={{ fontSize: 11, flexShrink: 0, opacity: 0.8 }}>{title}</span>
      </button>

      {open && children}
    </div>
  )
}
