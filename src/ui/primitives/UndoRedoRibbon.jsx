// The band along the bottom of the app — the footer's chrome. AppFooter is its
// only caller; it decides which undo stack the buttons drive and passes what
// else belongs on the band as children.
//
// The ribbon is only the buttons; the history itself belongs to whatever owns
// the data (useTreeEditor for the catalog, InstanceBuilder for an option).

import { FOOTER_HEIGHT, RULE } from '../layout.js'

export default function UndoRedoRibbon({ onUndo, onRedo, canUndo, canRedo, children }) {
  return (
    <div
      style={{
        height: FOOTER_HEIGHT,
        boxSizing: 'border-box',
        padding: '0 12px',
        background: '#fff',
        borderTop: RULE,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}
    >
      <RibbonButton onClick={onUndo} disabled={!canUndo} title="Undo last action (Ctrl+Z)">
        ↶ Undo
      </RibbonButton>
      <RibbonButton onClick={onRedo} disabled={!canRedo} title="Redo last undone action (Ctrl+Y)">
        ↷ Redo
      </RibbonButton>
      {children}
    </div>
  )
}

function RibbonButton({ onClick, disabled, title, children }) {
  return (
    <button
      type="button"
      className="spp-ribbon-btn"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '4px 12px',
        fontSize: 12,
        border: '1px solid #0e0d0d',
        borderRadius: 6,
        background: '#98e1f3',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

// Injected once by App, alongside REMOVE_BUTTON_STYLE.
export const RIBBON_STYLE = `
  .spp-ribbon-btn {
    transition: background-color 150ms ease, border-color 150ms ease, transform 100ms ease,
      box-shadow 120ms ease, filter 120ms ease;
  }
  .spp-ribbon-btn:hover:not(:disabled) { background: #b6ecfa !important; border-color: #0e0d0d; }
  .spp-ribbon-btn:active:not(:disabled) { transform: scale(0.95); }
  .spp-ribbon-btn:disabled { opacity: 0.4; cursor: default; }
`
