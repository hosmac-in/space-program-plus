// EXTRA MARKS ON THE OPTION PANEL — the seam between the editor and a second app
// =============================================================================
//
// The department pane draws a department, its rooms and their objects. A second
// app built from the same parts may want to say something MORE about each of
// them — the Rhino Companion draws a link control and a completion ring, from
// facts (the model) that the editor has no access to and no interest in.
//
// This is how it does that without the panel learning what Rhino is. The panel
// asks for annotations and renders whatever it is handed; a shell that has none
// gets `null` and draws exactly what it always drew.
//
//   >>> THE DIRECTION MATTERS AND IS THE WHOLE POINT. `ui/` declares the slot;
//   >>> the specialised app fills it. Before this, panelParts.jsx imported the
//   >>> Companion's LinkButton and carried five props for one caller, so "how a
//   >>> room is drawn" knew what a Rhino link was. Nothing under src/ui/ or
//   >>> src/data/ should mention Rhino; if a change makes it, that is drift.
//
// The shape, every entry optional:
//
//   controlSlot        px reserved for a control, when wider than the default
//   department(dept, areaSqft, path)  -> node   beside the pane's heading
//   room(room, path, name)            -> node   in the room header's control slot
//   roomCount(room, name)             -> node   REPLACING the room's count field
//
// They are functions rather than pre-built nodes because the panel is the only
// thing that knows which room it is drawing.
//
// `name` is the RESOLVED name — a room placement may be labelled, so two
// placements of one definition read as "Male Toilet" and "Female Toilet" (see
// resolveRoomLabel in data/tree.js). Passed as an argument rather than by
// handing over a doctored `{ ...room, name }`: that copy would be a lie about
// the room object, and the first thing anyone did with it would be to store it.

import { createContext, useContext } from 'react'

const AnnotationsContext = createContext(null)

// Null in the editor, which is the ordinary case — callers use `?.`.
export function useAnnotations() {
  return useContext(AnnotationsContext)
}

export function AnnotationsProvider({ value, children }) {
  return <AnnotationsContext.Provider value={value}>{children}</AnnotationsContext.Provider>
}
