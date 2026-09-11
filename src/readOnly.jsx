// CAN THIS SESSION WRITE ANYTHING AT ALL
// ======================================
//
// Two unrelated reasons the answer is no, and every control that writes cares
// about the same answer rather than about which reason it was:
//
//   * the signed-in account is a `viewer` — sql/viewer_role.sql
//   * the app is the Companion, which is read-only by construction
//
// The second is not a permission but what that app is FOR: it shows a program so
// a model can be checked against it, and a × or an "Add a room" there would let
// someone edit the program from a window opened to read it. It is passed as a
// constant rather than derived, and holds even for an admin.
//
//   >>> This hides controls. It is NOT the security boundary — RLS is, exactly
//   >>> as with useIsAdmin(). The viewer role is enforced in the database; the
//   >>> Companion's read-only-ness is not enforced anywhere and does not need to
//   >>> be, since the account it signs in as should itself be a viewer.
//
// A context rather than a prop threaded through every panel: this is one fact
// about the whole session, read by controls at every depth, and the alternative
// is adding the same prop to a dozen components that otherwise do not care.
// `canEdit` stays what it is — a per-panel answer about the CATALOG, owned by
// admin — and callers combine the two.
//
// It does not disable ANNOTATIONS (ui/option/annotations.jsx). Those write to
// whatever the second app is looking at, never to the database, and are the one
// thing such an app exists to offer.

import { createContext, useContext } from 'react'

const ReadOnlyContext = createContext(false)

export function useReadOnly() {
  return useContext(ReadOnlyContext)
}

export function ReadOnlyProvider({ readOnly, children }) {
  return <ReadOnlyContext.Provider value={!!readOnly}>{children}</ReadOnlyContext.Provider>
}
