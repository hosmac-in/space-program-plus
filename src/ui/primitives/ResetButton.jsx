// "Put this back to what the catalog says."
//
// The counterpart to RemoveButton, and deliberately not it: a × means the thing
// is gone, and reverting an override is the opposite — the value stays, it just
// stops being one somebody typed here. Same circle, same sizes, same hover
// reveal; blue rather than red, and a return arrow rather than a cross.
//
// It only ever appears where there is a LOWER level to fall back to — an
// option's department or building factor, against the catalog's. The catalog
// itself has nothing beneath it, so its panels show no reset at all.

const BLUE = 'rgb(90, 141, 238)'
const BLUE_HOVER = '#1a56c4'
const OUTLINE = '#1a1a1a'

export default function ResetButton({
  onReset,
  title = 'Back to the default',
  size = 14,
  // React Flow claims pointerdown for panning before a click can land, so
  // anything inside a canvas node has to stop it in capture.
  stopPointerDown = false,
}) {
  return (
    <button
      type="button"
      // spp-reveal: hidden until an ancestor marked spp-hover-reveal is hovered
      // — the same mechanism RemoveButton uses.
      className="spp-reset-btn spp-reveal nodrag nopan"
      title={title}
      aria-label={title}
      onPointerDownCapture={stopPointerDown ? (e) => e.stopPropagation() : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onReset()
      }}
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        padding: 0,
        // The same dark ring RemoveButton wears, for the same reason: these sit
        // on cards tinted by their function and would otherwise dissolve into
        // the blues.
        border: `1px solid ${OUTLINE}`,
        boxSizing: 'border-box',
        borderRadius: '50%',
        background: BLUE,
        color: '#fff',
        fontSize: Math.round(size * 0.72),
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      ↺
    </button>
  )
}

// Injected once by App, beside REMOVE_BUTTON_STYLE.
export const RESET_BUTTON_STYLE = `
  .spp-reset-btn { transition: background-color 120ms ease, transform 120ms ease, opacity 120ms ease; }
  .spp-reset-btn:hover { background: ${BLUE_HOVER} !important; transform: scale(1.12); }
  .spp-reset-btn:active { transform: scale(0.94); }
`
