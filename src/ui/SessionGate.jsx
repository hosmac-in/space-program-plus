// Nobody sees anything until they are signed in and the catalog is available.
//
// Both apps open the same way, so the sequence lives here rather than at the top
// of each shell: load the session, show Login if there is none, and mount the
// catalog provider around whatever comes next. The catalog is the shared
// vocabulary of every screen — sections, buildings, rooms, objects, functions —
// so nothing below is worth rendering without it.
//
// `authNote` is drawn beside the login form. The Companion puts its sign-in
// failure there, since `Login` owns its own error state and knows nothing about
// a session arriving from somewhere else.
//
// `children` is a function of the session, not a node: everything below wants
// the user id, and threading it as a prop from two shells is two chances to
// forget.

import { useSession } from '../data/auth.js'
import { CatalogProvider } from '../data/catalog.jsx'
import Login from './Login.jsx'
import LoadingOverlay from './primitives/LoadingOverlay.jsx'

export default function SessionGate({ authNote = null, children }) {
  const { session, loading } = useSession()

  if (loading) return <LoadingOverlay />

  if (!session) {
    return (
      <>
        <Login />
        {authNote}
        <LoadingOverlay />
      </>
    )
  }

  return <CatalogProvider>{children(session)}</CatalogProvider>
}
