// "Tag the selected Rhino objects as this."
//
// Only ever rendered inside Rhino — see rhino.js, where presence of the WebView2
// bridge is the flag. In a browser this never mounts, so it costs the deployed
// app nothing but its own bytes.
//
// NOT `spp-reveal`. Hover-reveal is the convention for destructive controls,
// which are rare and loud; in connect mode this is the one thing you are there
// to do, and a link you have to hunt for by hovering each room in turn is worse
// than a slightly busier header.

const BLUE = 'rgb(90, 140, 235)'
const BLUE_HOVER = '#2b5fd0'
const OUTLINE = '#1a1a1a'

export default function LinkButton({ onLink, title = 'Link', size = 18 }) {
  return (
    <button
      type="button"
      className="spp-link-btn nodrag nopan"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onLink()
      }}
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        padding: 0,
        // Same dark ring as RemoveButton, and for the same reason: the header
        // behind it is whatever colour the room's function paints it.
        border: `1px solid ${OUTLINE}`,
        boxSizing: 'border-box',
        borderRadius: '50%',
        background: BLUE,
        color: '#fff',
        fontSize: Math.round(size * 0.6),
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      ⛓
    </button>
  )
}

// Injected once by App, beside REMOVE_BUTTON_STYLE.
export const LINK_BUTTON_STYLE = `
  .spp-link-btn { transition: background-color 120ms ease, transform 120ms ease; }
  .spp-link-btn:hover { background: ${BLUE_HOVER} !important; transform: scale(1.12); }
  .spp-link-btn:active { transform: scale(0.94); }
`
