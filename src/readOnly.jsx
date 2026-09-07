// CAN THIS SESSION WRITE ANYTHING AT ALL
// ======================================
//
// Two unrelated reasons the answer is no, and every control that writes cares
// about the same answer rather than about which reason it was:
//
//   * the signed-in account is a `viewer` — sql/viewer_role.sql
//   * the app is running inside Rhino's connect view — rhino.js
//
// Rhino's is not a permission, it is what that view is FOR: it exists to pick a
// room and tag a model object, and a × or an "Add a room" there would let
// someone edit the program from a window opened to read it. Even signed in as an
// admin, that view writes nothing.
//
//   >>> This hides controls. It is NOT the security boundary — RLS is, exactly
//   >>> as with useIsAdmin(). The viewer role is enforced in the database; the
//   >>> Rhino case is not enforced anywhere and does not need to be, since the
//   >>> account it signs in as should itself be a viewer.
//
// A context rather than a prop threaded through every panel: this is one fact
// about the whole session, read by controls at every depth, and the alternative
// is adding the same prop to a dozen components that otherwise do not care.
// `canEdit` stays what it is — a per-panel answer about the CATALOG, owned by
// admin — and callers combine the two.

import { createContext, useContext } from 'react'

const ReadOnlyContext = createContext(false)

export function useReadOnly() {
  return useContext(ReadOnlyContext)
}

export function ReadOnlyProvider({ readOnly, children }) {
  return <ReadOnlyContext.Provider value={!!readOnly}>{children}</ReadOnlyContext.Provider>
}
