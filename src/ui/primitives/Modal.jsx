import { Z } from './zIndex.js'

export default function Modal({ title, onClose, children, overlayLeft = 0, maxWidth = 480 }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: overlayLeft,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: Z.modal,
        pointerEvents: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 24,
          width: '90%',
          maxWidth,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
