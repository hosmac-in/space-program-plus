// THE ONE DISCLOSURE TRIANGLE — and, on the canvases, the one disclosure
// BEHAVIOUR with no drawing at all.
//
// A department card's room list, a group box's cards and a room's parameter band
// all open behind the same control, and each had drawn its own: same character,
// three sizes, three ideas of what a click on it should stop.
//
// THE TRIANGLE IS DRAWN, NOT TYPED, for the reason AddButton's cross is: a glyph
// is centred by its LINE BOX rather than by its ink, and ▶ carries different
// left and right bearings — so it sits off-centre in anything drawn around it,
// and rotating it swings that offset around. A path about the middle of its own
// viewBox has no such opinion.
//
// `blank` is the canvas mode: no glyph, only the target. There the tree draws
// every caret itself (see ui/canvas/CanvasGuides.jsx), because the caret is
// where a branch lands and the two cannot be drawn by different things and still
// meet. What stays here is the logic — the hit area, the stopped events, what it
// announces.
//
// THE HIT AREA IS BIGGER THAN THE GLYPH. A 12px triangle is a 12px target, which
// on a canvas you are also panning and dragging is a miss more often than a hit.
// The padding grows the button outwards and an equal negative margin takes the
// growth back out of the layout, so the target is `hit` wide while the column it
// sits in is still `size` — the same trick .spp-row uses to bleed a highlight
// past its text.
//
// `onToggle` absent means GLYPH ONLY: a plain span with no target of its own,
// for a caret inside a larger button that is already the click (see StripBand).

// The column a caret occupies, and the pointer target around it. The target is
// deliberately close to the 24px a finger or a moving pointer can actually land.
export const CARET_SIZE = 12
export const CARET_HIT = 24

// A right-pointing triangle centred in its own box, so it turns about its
// middle. Drawn shorter than it is tall on purpose: an equilateral one reads as
// a play button.
export function CaretGlyph({ size }) {
  return (
    <svg viewBox="0 0 10 10" width={size} height={size} aria-hidden focusable="false" style={{ display: 'block' }}>
      <path d="M3.5 1.5 L8 5 L3.5 8.5 Z" fill="currentColor" />
    </svg>
  )
}

export default function DisclosureCaret({
  expanded = false,
  // Absent -> the glyph alone, inert.
  onToggle,
  // Reserved but blank: a container with nothing to open still holds the column,
  // or its name starts left of every other one beside it. Same rule as
  // ANNOTATION_SLOT and the card control column.
  disabled = false,
  title,
  size = CARET_SIZE,
  hit = CARET_HIT,
  opacity = 0.7,
  // Milliseconds for the turn; the callers that animate something else at the
  // same time pass their own duration so the two read as one movement.
  duration = 150,
  // The canvases: the target, and nothing drawn. See the note above.
  blank = false,
}) {
  const glyph = blank ? null : (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        transition: `transform ${duration}ms ease`,
        transform: expanded ? 'rotate(90deg)' : 'none',
      }}
    >
      <CaretGlyph size={size} />
    </span>
  )

  if (!onToggle) {
    return (
      <span style={{ flexShrink: 0, width: size, display: 'inline-flex', justifyContent: 'center', opacity }}>
        {glyph}
      </span>
    )
  }

  const pad = Math.max(0, (hit - size) / 2)

  return (
    <button
      type="button"
      // React Flow claims pointer events on a canvas: without these a press on
      // the caret pans the canvas or starts dragging the card it sits on.
      className="nodrag nopan"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        // Every caret here sits on something else that is itself clickable — a
        // card that selects, a container header that selects. Opening is not
        // selecting.
        e.stopPropagation()
        if (!disabled) onToggle()
      }}
      disabled={disabled}
      title={disabled ? undefined : title}
      aria-label={title}
      aria-expanded={expanded}
      style={{
        flexShrink: 0,
        // content-box, so `size` stays the column's width and the padding grows
        // the target outside it; the negative margin then takes that growth back
        // out of the layout.
        boxSizing: 'content-box',
        width: size,
        height: size,
        padding: pad,
        margin: -pad,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        // Never a fixed ink: these sit on function-coloured headers and on the
        // pale wash of a card, and a grey that reads on one does not on the
        // other.
        color: 'inherit',
        font: 'inherit',
        opacity: disabled ? 0 : opacity,
        cursor: disabled ? 'default' : 'pointer',
        userSelect: 'none',
      }}
    >
      {glyph}
    </button>
  )
}
