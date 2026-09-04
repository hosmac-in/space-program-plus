// THE ADDRESS BAR — what a shareable link contains
// ================================================
//
//   #/uhdp
//   #/uhdp?p=7f3a1c2e…
//   #/project?p=7f3a1c2e…&o=b21c4f90…
//   #/tree
//   #/questions?b=1d9e5a30…
//
//   p = sp_project.id      o = sp_option.id      b = sp_building.id
//
// The Tree tab takes no parameter: it shows every building at once, stacked.
//
// The Questions tab takes `b`, because a questionnaire is authored one building
// at a time and a link to one should open that one. Absent or unrecognised falls
// back to the first building.
//
// The tab is a path segment named by its visible label; the ids are query
// parameters, present only when something is selected. Anything unrecognised
// falls back to #/uhdp.
//
// HASH-BASED because the app is served from a GitHub Pages project site, which
// knows nothing about client-side routes — a real path would 404 on reload or a
// pasted link. Everything after the # never reaches the server.
//
// The department selection is deliberately NOT in the URL: it would make links
// long and flood the Back button.

import { useCallback, useEffect, useState } from 'react'

// URL slug <-> the view value the app uses internally. They match apart from
// UHDP, whose internal name is older than its label. The former slugs `canvas`
// and `hierarchy` are deliberately not read: one name per screen, not two.
const VIEW_BY_SLUG = { uhdp: 'map', project: 'project', tree: 'tree', questions: 'questions' }
const SLUG_BY_VIEW = { map: 'uhdp', project: 'project', tree: 'tree', questions: 'questions' }

const DEFAULT_VIEW = 'map'

function parseHash(hash = '') {
  // "#/canvas?p=1&o=2" -> path "canvas", query "p=1&o=2"
  const raw = hash.replace(/^#\/?/, '')
  const [path, query] = raw.split('?')
  const params = new URLSearchParams(query ?? '')

  return {
    view: VIEW_BY_SLUG[path] ?? DEFAULT_VIEW,
    projectId: params.get('p') || null,
    optionId: params.get('o') || null,
    buildingId: params.get('b') || null,
  }
}

function buildHash({ view, projectId, optionId, buildingId }) {
  const params = new URLSearchParams()
  if (projectId) params.set('p', projectId)
  if (optionId) params.set('o', optionId)
  // Only the Questions tab reads it, so it is dropped everywhere else rather
  // than trailing behind the project and option on every other link.
  if (buildingId && view === 'questions') params.set('b', buildingId)

  const query = params.toString()
  return `#/${SLUG_BY_VIEW[view] ?? 'uhdp'}${query ? `?${query}` : ''}`
}

// True when the hash isn't already exactly what this state should produce —
// used to rewrite junk like "#/nonsense" or "#" into its canonical form.
function isCanonical(state) {
  return window.location.hash === buildHash(state)
}

// The app's navigation state, read from and written to the address bar.
//
//   navigate(next)                    adds a history entry (Back returns here)
//   navigate(next, { replace: true }) rewrites in place, no history entry
export function useUrlState() {
  const [state, setState] = useState(() => parseHash(window.location.hash))

  useEffect(() => {
    // Fires for Back/Forward, for manual edits to the address bar, and for our
    // own pushes below (which go through location.hash).
    const onHashChange = () => setState(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((next, { replace = false } = {}) => {
    setState((prev) => {
      const merged = { ...prev, ...next }
      const hash = buildHash(merged)

      if (replace) {
        // replaceState does NOT fire hashchange, so the listener above won't
        // run — returning `merged` here is what updates React.
        window.history.replaceState(null, '', hash)
      } else if (window.location.hash !== hash) {
        // Assigning location.hash pushes a history entry AND fires hashchange,
        // setting the same value again — harmless, and it keeps Back/Forward
        // and in-app navigation on one code path.
        window.location.hash = hash
      }

      return merged
    })
  }, [])

  // Rewrite an unrecognised or partial hash to its canonical form on first
  // load, without adding a history entry.
  useEffect(() => {
    if (!isCanonical(state)) window.history.replaceState(null, '', buildHash(state))
    // Runs once: later navigation is canonical by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return [state, navigate]
}
