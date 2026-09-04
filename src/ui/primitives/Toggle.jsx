// The one yes/no control in the app: an iOS-style switch.
//
// A switch rather than a checkbox because these sit in a column of values, not
// in a form of questions — the row already asks the question, and a switch reads
// as the ANSWER to it at a glance, in the same way a number does. It also states
// its position without a label beside it, which is what lets a boolean row line
// up with the numeric rows around it.
//
// If you need a yes/no, import this rather than writing another one.

const TRACK_W = 30
const TRACK_H = 17
const KNOB = 13
const PAD = (TRACK_H - KNOB) / 2

// `tint` is the ON colour, and callers pass the FUNCTION colour of whatever the
// switch sits in — never a fixed accent. Everything else on these panels is
// drawn in its function's hue, and an iOS green here was the one control on the
// screen announcing itself in a colour that meant nothing.
//
// Pass the darkened form (`colours.inverted.color`), not the plain background:
// the switch sits on a pale wash of that same hue, and the knob is white, so the
// track has to be dark enough for both to read.
export default function Toggle({ checked, onChange, disabled = false, title, tint = '#8a8a8e' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        // These live inside clickable rows and cards on both panels; without
        // this a flick of the switch also selects whatever is behind it.
        e.stopPropagation()
        onChange(!checked)
      }}
      style={{
        width: TRACK_W,
        height: TRACK_H,
        flexShrink: 0,
        padding: 0,
        border: 'none',
        borderRadius: TRACK_H,
        // Off stays neutral rather than a pale tint: "no" should read as no
        // colour at all, and a wash of the function hue on the pale band it sits
        // on would be nearly invisible against it.
        background: checked ? tint : '#c7c7cc',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        position: 'relative',
        transition: 'background-color 160ms ease',
        // A switch is the answer, so it sits in the value column and aligns with
        // the figures above it rather than floating in the middle of the row.
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: PAD,
          left: PAD,
          width: KNOB,
          height: KNOB,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          // Translated rather than repositioned, so the knob slides instead of
          // jumping between two lefts.
          transform: checked ? `translateX(${TRACK_W - KNOB - PAD * 2}px)` : 'none',
          transition: 'transform 160ms ease',
        }}
      />
    </button>
  )
}
