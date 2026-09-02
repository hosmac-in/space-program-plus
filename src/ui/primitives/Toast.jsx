// The one toast system.
//
// There were two: this one, owned by App and showing a single message at a
// time, and a second stack inside the Tree canvas with its own timers and its
// own look. The same event — "that worked", "that was refused" — appeared in
// two different places depending on which tab you were on.
//
// Now anything can say something by calling useToast(), wherever it is in the
// tree, and every message lands in the same stack above the footer.

import { createContext, useCallback, useContext, useState } from 'react'
import { ABOVE_FOOTER } from '../layout.js'
import { Z } from './zIndex.js'

const TOAST_MS = 3000

const ToastContext = createContext(() => {})

// push(message, type) — 'success' (default) or 'error'.
export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((message, type = 'success') => {
    if (!message) return
    const id = `${Date.now()}-${Math.random()}`
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}

      {/* Above the footer band, not on top of it. Newest nearest the bottom,
          which is where the eye already is after an action. */}
      <div
        style={{
          position: 'fixed',
          bottom: ABOVE_FOOTER,
          right: 16,
          zIndex: Z.toast,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 6,
          alignItems: 'flex-end',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: t.type === 'error' ? '#c0392b' : '#1f2937',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              fontSize: 13,
              maxWidth: 320,
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
