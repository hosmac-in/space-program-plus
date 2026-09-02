// The dialog that stands between someone and losing work.
//
// Removing a room, a department, a section, or walking away from unsaved
// edits — four dialogs that were four hand-rolled copies, and had already
// drifted: different button orders, different labels, and nothing marking the
// destructive choice as destructive. These are the last thing a person reads
// before something goes away, so they are defined once.
//
// The confirm button is the destructive one and is coloured as such. Cancel is
// always last and always plain, so the safe way out is in the same place every
// time. `secondary` is for the third case — save first, discard, or cancel.

import Modal from './Modal.jsx'

const BASE = {
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 6,
  cursor: 'pointer',
}

export default function ConfirmModal({
  title,
  children,
  confirmLabel = 'Yes, remove',
  onConfirm,
  confirmDisabled = false,
  // `danger` for anything that destroys; `primary` when the confirm is the
  // safe path (saving before leaving).
  tone = 'danger',
  secondaryLabel,
  onSecondary,
  onCancel,
}) {
  const confirmColour = tone === 'danger' ? '#c0392b' : '#1a73e8'

  return (
    <Modal title={title} onClose={onCancel}>
      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>{children}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          style={{
            ...BASE,
            border: `1px solid ${confirmColour}`,
            background: confirmColour,
            color: '#fff',
          }}
        >
          {confirmLabel}
        </button>

        {secondaryLabel && (
          <button
            type="button"
            onClick={onSecondary}
            style={{ ...BASE, border: '1px solid #c0392b', background: '#fff', color: '#c0392b' }}
          >
            {secondaryLabel}
          </button>
        )}

        <button
          type="button"
          onClick={onCancel}
          style={{ ...BASE, border: '1px solid #ccc', background: '#fff', color: '#333', fontWeight: 400 }}
        >
          Cancel
        </button>
      </div>
    </Modal>
  )
}
