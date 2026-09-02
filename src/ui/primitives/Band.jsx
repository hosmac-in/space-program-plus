// A band: a labelled strip of controls across the top or bottom of main.
//
// The Tree tab's carousels are bands, and so is the Canvas tab's project
// and option bar. They are the same thing — a heavy rule against the canvas, a
// stack of labelled rows divided by lighter ones — so they are one component
// rather than two that drift.
//
// A band holds rows; a row is a fixed-width label and whatever controls belong
// beside it. Mark the last row so the band's own edge isn't doubled by a
// divider directly above it.

import { RULE, RULE_INNER } from '../layout.js'

export function Band({ edge = 'bottom', children }) {
  return (
    <div
      style={{
        flexShrink: 0,
        background: '#fff',
        [edge === 'top' ? 'borderTop' : 'borderBottom']: RULE,
      }}
    >
      {children}
    </div>
  )
}

export function BandRow({ title, last = false, children }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 12px',
        borderBottom: last ? undefined : RULE_INNER,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#888',
          // Every label the same width, so the controls beside them line up
          // down the band however long each label is.
          width: 90,
          flexShrink: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {title}
      </span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          overflowX: 'auto',
          flex: 1,
          minWidth: 0,
          paddingBottom: 2,
        }}
      >
        {children}
      </div>
    </div>
  )
}
