// THE ANSWER'S COUNTER, STANDING AT 0 — drawn in the outline and in the detail
// panel, so it is defined once.
//
// The designer authors the form, never a filled-in copy, so this is inert by
// construction rather than by a `disabled` flag someone could helpfully remove:
// there is no count to hold yet. 0 means nobody has chosen this set, which is
// what greys it.

export function Counter() {
  return (
    <span
      title="The counter this set gets when the question is answered. 0 is nobody has chosen it."
      style={{
        flexShrink: 0,
        minWidth: 26,
        textAlign: 'center',
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
        color: '#bbb',
        background: '#f4f4f4',
        border: '1px solid #e6e6e6',
        borderRadius: 4,
        padding: '0 5px',
      }}
    >
      0
    </span>
  )
}
