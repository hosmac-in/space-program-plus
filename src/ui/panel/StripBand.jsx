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
  // What the band is called — "Room Parameters", "Department Parameters".
  title,
  // The ROOM's function colours, from functionColours(). Never reach for
  // bg_colour directly: a null function_id is normal and functionColours is what
  // resolves it (see data/functions.js).
  colours,
  // How much padding the body it bleeds out of has. A room's is BLOCK_PADDING; a
  // department's PanelShell is 16, and guessing wrong leaves the band inset by
  // the difference on both sides.
  pad = BLOCK_PADDING,
  // A department's shell is ALREADY painted in its wash, so a band painted the
  // same is invisible. `plain` rules it off top and bottom instead and paints
  // nothing — the same band, without a second copy of this file.
  plain = false,
  // How far below whatever is above it the band sits. A room's butts against
  // its header — the negative margin cancels the body's padding — which is what
  // makes it read as part of the room. A department's follows a heading with
  // figures beside it and needs air, so it takes a positive number.
  top = null,
  children,
}) {
  const [open, setOpen] = useState(false)

  const skin = plain
    ? {
        background: 'none',
        borderTop: `1px solid ${colours.inverted.border}`,
        borderBottom: `1px solid ${colours.inverted.border}`,
      }
    : {
        background: colours.inverted.background,
        borderBottom: `1px solid ${colours.inverted.border}`,
      }

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
      // spp-band: what the reduced-motion rule in index.css switches the
      // caret's turn and the padding's ease off through.
      className="spp-band"
      style={{
        margin: `${top ?? -pad}px -${pad}px ${pad}px`,
        // The padding eases with the row, or the band gains its last 2px in one
        // frame after the slide has finished.
        padding: `4px ${pad}px ${open ? 6 : 4}px`,
        transition: 'padding 180ms ease',
        color: colours.inverted.color,
        ...skin,
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
            // Turns with the slide, so one gesture reads as one movement.
            transition: 'transform 180ms ease',
          }}
        >
          ▶
        </span>
        {/* Heavier and a size up from the rows it heads — and NOTHING ELSE. It
            was 11px regular, the same size as a room's rows and smaller than a
            department's, so the heading was the quietest thing in the band it
            headed. The fix for that is weight, not a different treatment: caps
            and letterspacing read as a second typeface next to the sentence-case
            rows below, which is a worse fault than the one being corrected.

            Ink inherited from the band, not a fixed grey: the wash is a
            different hue on every room, and a grey that reads on a pale mint
            does not read on a pale navy. */}
        <span style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, opacity: 0.8 }}>{title}</span>
      </button>

      {/* SLIDES rather than appearing. The band is dense and sits mid-panel, so
          switching it in place made the rooms below jump by a hundred pixels
          with nothing to say which way they went.

          A 0fr -> 1fr grid row, not an animated height: the content's height is
          never known here — it depends on the fields, the panel's width and the
          text in them — and a fixed max-height either clips a tall band or
          makes a short one ease against a value it never reaches, which reads
          as a pause. The row resolves to the real height, so the timing is the
          same whatever is inside.

          `minHeight: 0` on the inner box is load-bearing: a grid item's default
          `min-height: auto` refuses to go below its content and the row would
          not close at all. */}
      <div className="spp-slide" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
        <div style={{ minHeight: 0, overflow: 'hidden' }}>{children}</div>
      </div>
    </div>
  )
}
