// The one remove affordance in the app: a red circle with a white ×.
//
// Every "get rid of this" control — department cards on both canvases, group
// headers, room and object rows, chips — uses this, so removal looks the same
// everywhere and nothing has to re-derive the styling. If you need a remove
// button, import this rather than writing another one.

const RED = 'rgb(247, 112, 112)'
const RED_HOVER = '#d11d1d'
const OUTLINE = '#1a1a1a'

export default function RemoveButton({
  onRemove,
  title = 'Remove',
  size = 18,
  // Pins to the top-right corner of a positioned parent, for card corners.
  corner = false,
  // React Flow claims pointerdown for panning/dragging before a click can
  // land, so anything inside a canvas node has to stop it in capture.
  stopPointerDown = false,
}) {
  return (
    <button
      type="button"
      className="spp-remove-btn spp-reveal nodrag nopan"
      title={title}
      aria-label={title}
      onPointerDownCapture={stopPointerDown ? (e) => e.stopPropagation() : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onRemove()
      }}
      style={{
        ...(corner ? { position: 'absolute', top: 4, right: 4 } : null),
        flexShrink: 0,
        width: size,
        height: size,
        padding: 0,
        // Cards are tinted by their function, and some of those tints sit close
        // enough to the red that the button would dissolve into the card. The
        // dark ring keeps its edge readable against any of them; border-box
        // stops it changing the button's footprint.
        border: `1px solid ${OUTLINE}`,
        boxSizing: 'border-box',
        borderRadius: '50%',
        background: RED,
        color: '#fff',
        fontSize: Math.round(size * 0.66),
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      ×
    </button>
  )
}

// Injected once by App so the hover state doesn't need per-instance state.
//
// `spp-hover-reveal` on an ancestor makes any button marked `spp-reveal` inside
// it appear only while that thing is hovered — this one and ResetButton.
//
// A red circle on every room, object and card is the loudest mark on a surface
// whose job is to be read, and removal is the rarest thing done there — so it
// waits until you are actually on the thing.
//
// It stays reachable by keyboard: focus-within keeps it visible while tabbing,
// and it is only ever hidden, never removed from the document.
//
// Mark the SMALLEST element that wraps the button — a room's header, an object's
// row — not a whole card. The selector is a descendant one, so marking a room
// block would reveal every object's × inside it at the same time.
export const REMOVE_BUTTON_STYLE = `
  .spp-remove-btn { transition: background-color 120ms ease, transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease; }
  .spp-remove-btn:hover { background: ${RED_HOVER} !important; transform: scale(1.12); }
  .spp-remove-btn:active { transform: scale(0.94); }
  .spp-hover-reveal .spp-reveal { opacity: 0; }
  .spp-hover-reveal:hover .spp-reveal,
  .spp-hover-reveal:focus-within .spp-reveal { opacity: 1; }
`
