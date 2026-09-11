// A NAMEPLATE, NOT A HEADER. The editor's header is the way out — the brand goes
// home, and home is another option or none. This window opens on one option and
// must stay there, so there is nothing here to press.
//
// No Sign out either, and that is not an oversight: the session came from
// gh/.env and `useRhinoSignIn` would sign straight back in, so the button would
// be a loop with a confident label.

import { RULE } from '../ui/layout.js'

export default function CompanionHeader({ optionName }) {
  return (
    <header
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 24px',
        background: '#fff',
        borderBottom: RULE,
      }}
    >
      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', flexShrink: 0 }}>
        Space Program Plus
      </span>

      {/* Which app this is. It matters because the two look alike by design and
          this one writes nothing — a chip is the cheapest way to say so without
          a banner explaining it. */}
      <span
        style={{
          flexShrink: 0,
          padding: '2px 10px',
          borderRadius: 999,
          background: '#eef3fd',
          border: '1px solid #cddcf7',
          color: '#2b5fd0',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Rhino Companion
      </span>

      <div style={{ flex: 1, minWidth: 0 }} />

      {/* The one thing worth naming: which option this window is bound to, which
          the architect chose in sp_option_bind and cannot change from here. */}
      {optionName && (
        <span
          title="This document is bound to this option — run sp_option_bind to change it"
          style={{
            fontSize: 13,
            color: '#666',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {optionName}
        </span>
      )}
    </header>
  )
}
