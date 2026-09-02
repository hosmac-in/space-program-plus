// A view tab. There is only one left — Tree, in the footer — but it stays its
// own component because a tab is a distinct kind of control: the next one added
// must look like it rather than be restyled from scratch.

export default function TabButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        padding: '4px 10px',
        fontSize: 12,
        border: '1px solid #ccc',
        borderRadius: 6,
        background: active ? '#e8f0fe' : '#fff',
        color: active ? '#1a73e8' : '#333',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  )
}
