// The one <style> block every app injects.
//
// The primitives keep their own rules beside themselves — a button's hover, the
// ribbon's states — and this is where they are gathered. Both apps inject the
// same string, because these are not decoration: `spp-reveal` (in
// REMOVE_BUTTON_STYLE) is what makes hover-reveal work anywhere, and a shell
// that forgot it would show every destructive control at once, or none.
//
// A specialised app appends its own, e.g. the Companion's LINK_BUTTON_STYLE.

import { APP_STYLE } from './appStyle.js'
import { ADD_BUTTON_STYLE } from './primitives/AddButton.jsx'
import { REMOVE_BUTTON_STYLE } from './primitives/RemoveButton.jsx'
import { RESET_BUTTON_STYLE } from './primitives/ResetButton.jsx'
import { RIBBON_STYLE } from './primitives/UndoRedoRibbon.jsx'

export const SHARED_STYLE =
  APP_STYLE + REMOVE_BUTTON_STYLE + RESET_BUTTON_STYLE + ADD_BUTTON_STYLE + RIBBON_STYLE
