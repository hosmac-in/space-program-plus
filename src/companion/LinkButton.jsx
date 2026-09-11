// "Tag the objects selected in Rhino as this", and — around it — how much of
// this the model already holds.
//
// Only ever rendered inside Rhino — see rhino.js, where presence of the WebView2
// bridge is the flag. In a browser this never mounts, so it costs the deployed
// app nothing but its own bytes.
//
// The ring is the census (rhino.js) against what the program asks for, in AREA
// at both levels: a room's `areaSqft × count`, a department's grossed area. It
// says area and ONLY area — whether each of a room's five bays has been placed
// is a different question, answered by `linkedCount` in the room's title.
//
//   grey  + blue arc  + ⛓ on hover   short, or nothing linked
//   green + green ring + ✔           the model holds what the program asks for
//   red   + red ring   + ✖           MORE than it asks for — most often an
//                                    object copied with its user text still on
//
// >>> THE CONTROL IS DRAWN ON ITS OWN GROUND, and that is the whole design of
// >>> it. It sits on a header painted in that room's FUNCTION COLOUR, which may
// >>> itself be blue or red, so nothing here takes its meaning from a colour
// >>> laid straight on that header: a white plate carries the control, the state
// >>> is a disc inside it, and the arc is ringed in white on both sides.
//
// THE RING IS ALWAYS THERE; THE GLYPH IS ON HOVER. The ring is a reading, wanted
// on every room whether or not you are reaching for it; the ⛓ is the action, and
// a chain on a hundred rows buried the thing worth scanning for — which rooms
// are short. The plate stays the click target, so nothing must be hunted for.
//
// Once a ✔ or ✖ holds the middle, the ⛓ never appears there: an answer that
// flickers back to a chain under the pointer reads worse than a still one. The
// button is invisible, not gone — still clickable, still carrying the tooltip.
//
// Two things that look like edge cases and are not. Over-full is a COLOUR and
// not a longer arc: past full there is no arc left, and the fault is not "more"
// but "wrong". And a room nobody has measured asks for 0 sqft, which is a real
// state — the ring is drawn empty and anything linked to it counts as over.
// (Skipping the ring there once left the glyph permanently visible, since the
// reveal lives on the ring's wrapper.)

const BLUE = 'rgb(90, 140, 235)'
const GREEN = '#3f9c54'
const RED = '#d0342c'
const PLATE = '#fff'
const TRACK = '#dcdcdc'
const OUTLINE = '#1a1a1a'

// The disc behind the glyph: which of the three states this is.
const FILL_EMPTY = '#e6e6e6'
const FILL_MET = '#bfe7c6'
const FILL_OVER = '#f7cfcb'

// Half the footprint the ring adds. The caller widens its control slot by
// RING_INSET * 2 when it passes a ring — see RoomBlock.
export const RING_INSET = 6
// Thick enough to carry a colour rather than state one. A 2px arc read as an
// artefact on a coloured header.
const STROKE = 3
// White either side of the arc — outside it to the plate's rim, inside it to
// the state disc. This is what keeps blue and red legible over any function
// colour, so it is not spare space.
const MARGIN = 2.5
// The glyph gives up a little to the ring, so adding one barely moves the row.
const RING_TRIM = 4

// >>> A 5% BAND EITHER SIDE COUNTS AS MET. Modelled area never lands on a
// >>> programmed figure to the square foot, and a state nothing can ever reach
// >>> is not a state — the ring would have sat one hair short of green on every
// >>> room in the building. 5% is close enough that the brief is satisfied and
// >>> tight enough that a room modelled at half again still reads as over.
const TOLERANCE = 0.05

export const LINK_SHORT = 'short'
export const LINK_MET = 'met'
export const LINK_OVER = 'over'

// The one definition of how much is enough. Shared because three things say it
// at once — the disc, the arc and the tooltip — and marks that disagree about
// whether a room is done are worse than no marks.
export function linkState(linked, total) {
  // Nobody has measured this room. Nothing to satisfy, so anything at all in
  // the model against it is more than it asks for.
  if (!(total > 0)) return linked > 0 ? LINK_OVER : LINK_SHORT
  if (linked > total * (1 + TOLERANCE)) return LINK_OVER
  if (linked >= total * (1 - TOLERANCE)) return LINK_MET
  return LINK_SHORT
}

export default function LinkButton({ onLink, title = 'Link', size = 18, linked = 0, total = 0 }) {
  const state = linkState(linked, total)
  const over = state === LINK_OVER
  const met = state === LINK_MET

  const box = size + RING_INSET * 2
  const glyph = size - RING_TRIM
  // The arc's colour, which the glyph also takes on hover — the two are one
  // reading, and tying them says so without adding a second mark. The arc goes
  // green with the disc: a full BLUE ring on a green disc read as "still going"
  // at the moment the room was finished.
  const ink = over ? RED : met ? GREEN : BLUE
  // A finished room is marked and an overshot one is struck out. Either way the
  // mark holds the spot for good and the ⛓ stays hidden — see the header note.
  const mark = met ? '✔' : over ? '✖' : null

  const button = (
    <button
      type="button"
      // spp-reveal: the glyph fades in when an ancestor marked spp-hover-reveal
      // is hovered — a room's header already is, and the wrapper below marks
      // itself so a department heading needs nothing. It only goes transparent,
      // never away, so the click target never moves.
      //
      // A ✔ or ✖ already holds the spot, so the glyph stays out of the way
      // entirely rather than swapping with it on hover: an answer that flickers
      // back to a chain under the pointer is a worse read than a still one, and
      // the button is invisible, not gone — it still takes the click and still
      // carries the tooltip.
      className={`spp-link-btn nodrag nopan${mark ? '' : ' spp-reveal'}`}
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onLink()
      }}
      style={{
        // No filled background: the disc behind it is already saying something,
        // and a blue button on it would be a third colour meaning nothing.
        flexShrink: 0,
        width: glyph,
        height: glyph,
        padding: 0,
        border: 'none',
        background: 'none',
        boxSizing: 'border-box',
        // Dark ink: it always sits on the state disc, which is always light.
        color: OUTLINE,
        fontSize: Math.round(glyph * 0.85),
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        position: 'relative',
        opacity: mark ? 0 : undefined,
        // Read by the stylesheet's :hover rule — the hover ink depends on which
        // state this is, so it cannot be a static class.
        '--spp-link-ink': ink,
      }}
    >
      ⛓
    </button>
  )

  const plate = box / 2 - 0.5
  const radius = plate - MARGIN - STROKE / 2
  const disc = radius - STROKE / 2
  // Closed once it counts as met, not at exactly 100%: a ring left a hair short
  // would say "nearly" about a room the rest of the UI is calling finished.
  const fraction = met || over ? 1 : total > 0 ? Math.max(0, Math.min(1, linked / total)) : 0
  const circumference = 2 * Math.PI * radius

  return (
    <span
      // Marks ITSELF, so hovering the control alone reveals the glyph wherever
      // it is dropped — a department heading is not a hover-reveal region and
      // should not have to become one for this.
      className="spp-hover-reveal"
      style={{
        position: 'relative',
        width: box,
        height: box,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Behind the button and not interactive: the button is the control, this
          is what it is reporting. */}
      <svg
        width={box}
        height={box}
        viewBox={`0 0 ${box} ${box}`}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {/* The plate, ringed in the same dark hairline every round control here
            carries, so it reads as a chip on the header rather than as a hole
            punched in it. */}
        <circle
          cx={box / 2}
          cy={box / 2}
          r={plate}
          fill={PLATE}
          stroke={OUTLINE}
          strokeOpacity={0.35}
          strokeWidth={1}
        />
        <circle
          className="spp-link-fill"
          cx={box / 2}
          cy={box / 2}
          r={disc}
          fill={over ? FILL_OVER : met ? FILL_MET : FILL_EMPTY}
        />
        <circle cx={box / 2} cy={box / 2} r={radius} fill="none" stroke={TRACK} strokeWidth={STROKE} />
        <circle
          className="spp-link-ring"
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke={ink}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          // From the top, clockwise.
          transform={`rotate(-90 ${box / 2} ${box / 2})`}
        />
      </svg>

      {/* Over the disc, filling it: the control already looks like a spot to be
          marked, so the mark goes in it rather than beside it. Not a button —
          the button underneath it is still the click target. */}
      {mark && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            color: ink,
            fontSize: Math.round(disc * 1.6),
            lineHeight: 1,
          }}
        >
          {mark}
        </span>
      )}

      {button}
    </span>
  )
}

// Injected once by App, beside REMOVE_BUTTON_STYLE.
export const LINK_BUTTON_STYLE = `
  .spp-link-btn { transition: color 120ms ease, transform 120ms ease, opacity 120ms ease; }
  .spp-link-btn:hover { color: var(--spp-link-ink); transform: scale(1.12); }
  .spp-link-btn:active { transform: scale(0.94); }
  .spp-link-ring { transition: stroke-dashoffset 320ms ease, stroke 320ms ease; }
  .spp-link-fill { transition: fill 320ms ease; }
  @media (prefers-reduced-motion: reduce) {
    .spp-link-ring, .spp-link-fill { transition: none; }
  }
`
