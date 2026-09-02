// The counterpart to RemoveButton: the one "add something here" affordance.
//
// Same circle and same size, so add and remove read as a matched pair wherever
// they sit next to each other. Where remove is a solid red disc, add is a white
// disc inside a thick rainbow ring — unmistakably not the remove button, but
// quiet enough to sit in a list without shouting.
//
// If you need an add button, import this rather than writing another one.

const RAINBOW =
  'conic-gradient(from 0deg, #ff004d, #ff7a00, #ffd000, #29c04b, #00b5d8, #3b6bf5, #a13bf5, #ff004d)'
const GLYPH = '#1a1a1a'

export default function AddButton({
  onClick,
  title = 'Add',
  // Half again the remove button's 18: add is a deliberate act you go looking
  // for, and the rainbow ring needs the room to be a ring.
  size = 27,
  expanded = false,
  // React Flow claims pointerdown for panning/dragging before a click can
  // land, so anything inside a canvas node has to stop it in capture.
  stopPointerDown = false,
}) {
  // Thick enough to read as a rainbow rather than a coloured hairline, and
  // proportional so it stays that way at any size.
  const ring = Math.max(2, Math.round(size * 0.17))

  return (
    <button
      type="button"
      className="spp-add-btn nodrag nopan"
      title={title}
      aria-label={title}
      aria-expanded={expanded}
      onPointerDownCapture={stopPointerDown ? (e) => e.stopPropagation() : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{
        // Rotation lives in a variable, not in `transform`, so the stylesheet
        // below can add a hover scale without overwriting it.
        '--spp-add-rot': expanded ? '45deg' : '0deg',
        flexShrink: 0,
        width: size,
        height: size,
        padding: 0,
        // Two backgrounds, clipped differently: the white fills the padding
        // box, the rainbow shows only in the transparent border ring.
        border: `${ring}px solid transparent`,
        borderRadius: '50%',
        background: `linear-gradient(#fff, #fff) padding-box, ${RAINBOW} border-box`,
        boxSizing: 'border-box',
        color: GLYPH,
        // Sized against the white disc inside the ring, not the button, or the
        // glyph outgrows the space the thick border leaves it.
        fontSize: Math.round((size - 2 * ring) * 0.95),
        fontWeight: 700,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      +
    </button>
  )
}

// Injected once by App so the hover state doesn't need per-instance state.
export const ADD_BUTTON_STYLE = `
  .spp-add-btn {
    transform: rotate(var(--spp-add-rot, 0deg));
    transition: transform 150ms ease, filter 120ms ease, box-shadow 120ms ease;
  }
  .spp-add-btn:hover { transform: rotate(var(--spp-add-rot, 0deg)) scale(1.12); }
  .spp-add-btn:active { transform: rotate(var(--spp-add-rot, 0deg)) scale(0.94); }
`
