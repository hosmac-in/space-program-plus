// A tiny pub-sub counter of in-flight Supabase requests, fed by wrapping
// window.fetch once at startup (see trackSupabaseFetch below). Kept outside
// React so any component tree — even ones that mount before auth resolves —
// can subscribe without prop-drilling a request count through the whole app.
const listeners = new Set()
let pendingCount = 0

function notify() {
  listeners.forEach((listener) => listener(pendingCount))
}

export function subscribePending(listener) {
  listeners.add(listener)
  listener(pendingCount)
  return () => listeners.delete(listener)
}

// Wraps the global fetch so every request Supabase's client makes (postgrest
// queries, rpc calls, auth) increments/decrements the shared pending count —
// one interception point instead of touching every call site in the app.
// Guarded against double-wrapping since Vite HMR can re-run this module.
export function trackSupabaseFetch(supabaseUrl) {
  if (window.__sppFetchTracked) return
  window.__sppFetchTracked = true

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const input = args[0]
    const url = typeof input === 'string' ? input : input?.url
    const isSupabaseCall = typeof url === 'string' && typeof supabaseUrl === 'string' && url.startsWith(supabaseUrl)

    if (isSupabaseCall) {
      pendingCount += 1
      notify()
    }
    try {
      return await originalFetch(...args)
    } finally {
      if (isSupabaseCall) {
        pendingCount -= 1
        notify()
      }
    }
  }
}
