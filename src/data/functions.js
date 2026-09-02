// FUNCTIONS — what a space is for, and the colour it's drawn in
// =============================================================
//
// `sp_function` rows are (name, bg_colour, text_colour): ward, lab, corridor,
// plant, and so on. Sections, groups, departments and rooms each carry a
// nullable `function_id` pointing at one.
//
// Colours are stored as bare RGB triplets ("241,127,136") rather than hex, so
// they drop straight into rgb() and — more usefully — rgba(), which is how a
// container tints its body without washing out the cards nested inside it.
//
//   >>> A null function_id is normal, not missing data. It means "nothing
//   >>> specific", and renders as the row named 'default'. Every lookup here
//   >>> falls back to it, so callers never handle the null case themselves.

const DEFAULT_NAME = 'default'

// Used only if sp_function hasn't been seeded yet (sql/function_setup.sql), so
// an unconfigured database renders plain instead of invisible.
const FALLBACK = { name: DEFAULT_NAME, bg_colour: '213,213,213', text_colour: '0,0,0' }

function resolveFunction(functions = [], functionId) {
  return (
    (functionId && functions.find((f) => f.id === functionId)) ||
    functions.find((f) => f.name === DEFAULT_NAME) ||
    FALLBACK
  )
}

// The palette for one thing on screen.
//
//   background  solid fill        rgb(...)
//   color       readable text on that fill
//   border      a darker edge of the same hue
//   tint(a)     the same colour at opacity `a`, for container bodies
//   inverted    a pale wash of the same hue — see below
//
// `inverted` exists so a card can sit on a container filled with its own
// function colour and still be legible: groups are drawn solid, and the
// departments inside them are drawn inverted so they read as cut out of the
// parent rather than dissolving into it.
//
// An inverted card is ALWAYS a very light tint of bg_colour, never text_colour
// painted as a fill. text_colour is chosen to be legible *on* the background,
// which says nothing about how it looks *as* one — using it directly turned
// most cards near-black, and the few functions with a light text_colour into
// white cards. Washing bg_colour towards white instead keeps every card in its
// own hue family and uniformly light, with a darkened version of that same hue
// for the text.
//
// The wash mixes towards white rather than using alpha, because these cards sit
// on a solid-coloured parent — a translucent fill would let the group's colour
// through and undo the inversion.
export function functionColours(functions, functionId) {
  const fn = resolveFunction(functions, functionId)
  const bg = fn.bg_colour ?? FALLBACK.bg_colour
  const text = fn.text_colour ?? FALLBACK.text_colour

  return {
    name: fn.name,
    background: `rgb(${bg})`,
    color: `rgb(${text})`,
    border: shade(bg, 0.75),
    tint: (alpha) => `rgba(${bg},${alpha})`,
    // Clearly not the resting colour, but unmistakably the same function —
    // used when a card is a drop target. Which way it shifts depends on the
    // colour's own lightness: darkening 'corridor' (near-white) or lightening
    // 'staircase' (navy) would both be invisible, so each moves away from
    // where it already is.
    emphasis: isLight(bg) ? shade(bg, 0.86) : lighten(bg, 0.28),
    ring: `rgba(${bg},0.55)`,
    inverted: {
      background: lighten(bg, 0.85),
      color: shade(bg, 0.45),
      border: shade(bg, 0.6),
    },
  }
}

function channels(triplet) {
  const parts = String(triplet)
    .split(',')
    .map((n) => Number(n))
  return parts.length === 3 && parts.every(Number.isFinite) ? parts : null
}

const clamp = (n) => Math.round(Math.max(0, Math.min(255, n)))

// Multiplies each channel, giving a darker version that stays in the same hue
// family instead of a grey that fights every colour in the palette.
function shade(triplet, factor) {
  const parts = channels(triplet)
  return parts ? `rgb(${parts.map((n) => clamp(n * factor)).join(',')})` : `rgb(${triplet})`
}

// Mixes each channel towards white by `amount` (0 = unchanged, 1 = white).
function lighten(triplet, amount) {
  const parts = channels(triplet)
  return parts ? `rgb(${parts.map((n) => clamp(n + (255 - n) * amount)).join(',')})` : `rgb(${triplet})`
}

// Perceived brightness (WCAG relative luminance), used only to decide which
// direction a colour should shift to stand out from itself.
function isLight(triplet) {
  const parts = channels(triplet)
  if (!parts) return true
  const [r, g, b] = parts.map((c) => {
    const n = c / 255
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45
}
