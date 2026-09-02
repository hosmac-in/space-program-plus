// The header: the full-width band across the top of both main and side.
//
// It was previously two bars that only looked like one — a floating one over
// main carrying the brand and the tabs, and a sticky one at the top of side
// carrying the signed-in user — lined up by matching padding. One element now,
// so the regulating line under it is real and nothing has to be kept in sync.
//
// It carries no tabs. UHDP and Canvas aren't places you switch to — you get to
// a project's canvas by picking the project, and back to the map by going home
// through the brand. The only tab left is Tree, in the footer.

import { RULE } from './layout.js'

export default function AppHeader({ onHome, email, onSignOut }) {
  return (
    <header
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 24px',
        background: '#fff',
        borderBottom: RULE,
      }}
    >
      {/* The brand is the way home — a button, not a styled div, so it's
          reachable by keyboard and announced as something you can press. */}
      <button
        type="button"
        onClick={onHome}
        title="Home — the site map, nothing selected"
        style={{
          margin: 0,
          padding: 0,
          border: 'none',
          background: 'none',
          font: 'inherit',
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'inherit',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Space Program Plus
      </button>

      {/* Pushes the identity to the far right, over side. */}
      <div style={{ flex: 1 }} />

      <span style={{ fontSize: 13, color: '#666' }}>{email}</span>
      <button
        type="button"
        onClick={onSignOut}
        style={{
          padding: '6px 12px',
          fontSize: 13,
          border: '1px solid #ccc',
          borderRadius: 6,
          background: '#fff',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Sign out
      </button>
    </header>
  )
}
