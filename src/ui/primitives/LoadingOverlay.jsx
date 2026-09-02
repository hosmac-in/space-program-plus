import { useEffect, useState } from 'react'
import { subscribePending } from '../../data/loadingTracker.js'
import { Z } from './zIndex.js'

const SLOW_THRESHOLD_MS = 3000

// Shows a lightbox only once at least one Supabase request has been pending
// continuously for 3s — a normal fast round trip never shows anything. Any
// request finishing (count back to 0) cancels the pending timer and hides it
// immediately, even if a new request starts right after.
export default function LoadingOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer = null
    const unsubscribe = subscribePending((count) => {
      if (count > 0) {
        if (!timer) {
          timer = setTimeout(() => setVisible(true), SLOW_THRESHOLD_MS)
        }
      } else {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        setVisible(false)
      }
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(255,255,255,0.85)',
        zIndex: Z.loadingOverlay,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
      }}
    >
      <style>{`
        @keyframes sppSpin { to { transform: rotate(360deg); } }
        @keyframes sppFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .spp-loading-overlay { animation: sppFadeIn 200ms ease-out; }
        .spp-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #ddd;
          border-top-color: #1a73e8;
          border-radius: 50%;
          animation: sppSpin 0.8s linear infinite;
        }
      `}</style>
      <div className="spp-loading-overlay" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div className="spp-spinner" />
        <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>Still connecting…</div>
        <div style={{ fontSize: 12, color: '#777', maxWidth: 280, textAlign: 'center' }}>
          This is taking longer than usual. Check your internet connection.
        </div>
      </div>
    </div>
  )
}
