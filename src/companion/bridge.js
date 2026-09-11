// THE RHINO BRIDGE — the channel between the Companion and the model
// ==================================================================
//
// `gh/sp_connect.py` hosts the Rhino Companion in a WebView2 control, so an
// architect can select objects in the model and click a room here to say what
// those objects ARE. This module is the whole channel between the two, and it is
// the only file that knows a host exists.
//
// PRESENCE IS THE FLAG. `window.chrome.webview` exists only inside WebView2, so
// `inRhino()` needs no URL parameter, no build variant and no setting. main.jsx
// reads it once to decide which app to mount; nothing else has to ask.
//
// The link gesture is RHINO-FIRST: objects are already selected when the click
// happens here, so a message says only what was clicked and Rhino supplies the
// rest. That is what makes this one-way and lets one click tag many objects.
//
// Rhino answers twice: `result` — what it just did, which becomes a toast — and
// `census`, the tally of every tag in the document, which is how a room can say
// how much of it is placed. NONE OF THIS IS IN THE DATABASE: the tags live in
// the .3dm, so a census is true of that file on that machine and ends when Rhino
// closes. See CLAUDE.md, Rhino Companion.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../data/supabase.js'

// Read through a function, never captured at module load: the control injects
// this object, and a module evaluated during navigation can run first.
function host() {
  return (typeof window !== 'undefined' && window.chrome?.webview) || null
}

// Whether this page is the Companion. Called once by main.jsx to pick an app —
// a browser does not become Rhino, so nothing re-checks it later.
export function inRhino() {
  return host() != null
}

// { link(payload), lastResult, census }
//
// `link` takes { kind: 'room' | 'department', instanceId, path, name }.
// `instanceId` and never a *_def_id — the same identity rule as everywhere else
// (see data/tree.js): two placements of one duplicable department must not
// collapse into one thing on the model side either.
//
// `census` is { rooms: {id: {count, areaSqft}}, departments: {…} }. Asked for
// once on mount and re-sent by the host after every link and every document
// change, so nothing here has to track what it just did — the document is
// always the answer.
const EMPTY_CENSUS = { rooms: {}, departments: {} }

export function useRhinoBridge() {
  const [lastResult, setLastResult] = useState(null)
  const [census, setCensus] = useState(null)

  useEffect(() => {
    const bridge = host()
    if (!bridge) return undefined

    // Rhino replies with PostWebMessageAsJson, so `data` arrives parsed.
    const onMessage = (event) => {
      if (event.data?.type === 'census') {
        setCensus({ rooms: event.data.rooms ?? {}, departments: event.data.departments ?? {} })
      } else if (event.data?.type === 'result') {
        setLastResult(event.data)
      }
    }
    bridge.addEventListener('message', onMessage)
    bridge.postMessage({ type: 'census-request' })
    return () => bridge.removeEventListener('message', onMessage)
  }, [])

  const link = useCallback((payload) => {
    host()?.postMessage({ type: 'link', ...payload })
  }, [])

  return { link, lastResult, census: census ?? EMPTY_CENSUS }
}

// SIGNING IN
// ----------
//
// WebView2 keeps its own profile, separate from the architect's browser, so the
// Companion opens signed out and would otherwise show a login form in a window
// that exists to be clicked through in seconds.
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
// sql/viewer_role.sql. Nothing here relies on that (the Companion writes nothing
// regardless, see readOnly.jsx), but it is what makes it a boundary rather than
// a convention.
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
