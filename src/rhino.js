// THE RHINO BRIDGE — what the app can do when it is running inside Rhino
// ======================================================================
//
// `gh/sp_connect.py` hosts this app in a WebView2 control inside Rhino, so an
// architect can select objects in the model and click a room here to say what
// those objects ARE. This module is the whole channel between the two.
//
// It sits beside url.js rather than in data/: both are how the app talks to the
// environment it is running in, and neither touches the database.
//
// PRESENCE IS THE FLAG. `window.chrome.webview` exists only inside WebView2, so
// `connected` needs no URL parameter, no build variant and no setting — the
// deployed app simply never lights up the connect affordances, and nobody
// browsing it can reach a control that would do nothing.
//
// The link gesture is RHINO-FIRST: objects are already selected when the click
// happens here, so a message says only what was clicked and Rhino supplies the
// rest. That is what makes this one-way and lets one click tag many objects.
// Rhino answers only to report what it did.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from './data/supabase.js'

// Read through a function, never captured at module load: the control injects
// this object, and a module evaluated during navigation can run first.
function host() {
  return (typeof window !== 'undefined' && window.chrome?.webview) || null
}

// { connected, link(payload), lastResult }
//
// `link` takes { kind: 'room' | 'department', instanceId, path, name }.
// `instanceId` and never a *_def_id — the same identity rule as everywhere else
// (see data/tree.js): two placements of one duplicable department must not
// collapse into one thing on the model side either.
export function useRhinoBridge() {
  // Fixed for the life of the page — a browser does not become Rhino.
  const [connected] = useState(() => host() != null)
  const [lastResult, setLastResult] = useState(null)

  useEffect(() => {
    const bridge = host()
    if (!bridge) return undefined

    // Rhino replies with PostWebMessageAsJson, so `data` arrives parsed.
    const onMessage = (event) => setLastResult(event.data)
    bridge.addEventListener('message', onMessage)
    return () => bridge.removeEventListener('message', onMessage)
  }, [])

  const link = useCallback((payload) => {
    host()?.postMessage({ type: 'link', ...payload })
  }, [])

  return { connected, link, lastResult }
}

// SIGNING IN INSIDE RHINO
// ----------------------
//
// WebView2 keeps its own profile, separate from the architect's browser, so the
// connect window opens signed out and would otherwise show a login form in a
// window that exists to be clicked through in seconds.
//
// So it asks the host, which has the credentials already — gh/.env, the same
// file gh/sp_option_bind.py reads. The page posts `auth-request` and Rhino
// answers with an email and password, which go through the ordinary
// signInWithPassword.
//
// Deliberately NOT seeding supabase-js's storage key with a token minted in
// Python: that depends on the library's internal key name and session shape, and
// would break silently on an upgrade. This uses the public API, so the session,
// its refresh and its persistence are all supabase-js's own.
//
// The account those credentials name should be a `viewer` — see
// sql/viewer_role.sql. Nothing here relies on that (the connect view hides every
// write control regardless, see readOnly.jsx), but it is what makes it a
// boundary rather than a convention.
//
// Runs once, only when there is no session and only inside Rhino. Outside it the
// effect returns immediately and the app's own Login screen is unaffected.
export function useRhinoSignIn(hasSession, loading) {
  const [error, setError] = useState(null)

  useEffect(() => {
    const bridge = host()
    if (!bridge || loading || hasSession) return undefined

    let done = false
    const onMessage = (event) => {
      if (done || event.data?.type !== 'auth') return
      done = true
      const { email, password } = event.data
      supabase.auth
        .signInWithPassword({ email, password })
        .then(({ error: signInError }) => setError(signInError?.message ?? null))
    }

    bridge.addEventListener('message', onMessage)
    bridge.postMessage({ type: 'auth-request' })
    return () => bridge.removeEventListener('message', onMessage)
  }, [hasSession, loading])

  return error
}
