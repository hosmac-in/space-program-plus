// A labelled figure, and the card they sit in.
//
// Statistics appear in two places now — the project's numbers in side on UHDP,
// the open option's in side on Project — so the row and the box are defined
// once. If you need a figure with a label, use these.

export function Stat({ label, value, unit }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, color: '#777' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#222', textAlign: 'right' }}>
        {value}
        {unit && <span style={{ fontSize: 11, fontWeight: 400, color: '#777', marginLeft: 4 }}>{unit}</span>}
      </span>
    </div>
  )
}

export function StatCard({ title, children }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 0,
      }}
    >
      {title && <h4 style={{ margin: 0, fontSize: 14, color: '#333', overflowWrap: 'anywhere' }}>{title}</h4>}
      {children}
    </div>
  )
}
