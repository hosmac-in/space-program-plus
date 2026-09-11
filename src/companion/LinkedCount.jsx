// HOW MANY OF A ROOM THE MODEL HOLDS — `AHU room ×0/1`
//
// It takes the place of the room's editable count field (the Companion cannot
// edit it anyway), because the count is already written there and this is the
// same figure answered: `×n` becomes `×n/m`.
//
// The ring beside it measures AREA. This measures COUNT, and the two are
// different questions — area says whether the program fits, this says whether
// every one of them has been placed. A department of five ICU bays modelled as
// one merged solid reads ×1/5 with a full ring, which is exactly the truth.
//
// >>> OVER-COUNT IS A CHIP, NOT COLOURED TEXT. It sits on the room's function
// >>> colour, which can be anything — and a mid-grey header (the `default`
// >>> function, so the commonest one) is the case no red wins: a deep one and a
// >>> pale one are both close to it. White on solid red brings its own ground,
// >>> so it reads on every hue at every lightness. Same answer as the link
// >>> ring's white plate, and picking the red by the header's lightness was
// >>> tried first and fails exactly on those mid-tones.

// The ring's red, so the ✖ at one end of a header and the chip at the other are
// one alarm rather than two.
const WARN_FILL = '#d0342c'

export default function LinkedCount({ name, linked, count }) {
  const over = linked > count

  return (
    <span
      title={`${linked} of ${count} ${name} tagged in the model`}
      style={{
        flexShrink: 0,
        fontStyle: 'italic',
        // Plain in the header's own ink otherwise: `×1/1` is not news.
        ...(over
          ? {
              background: WARN_FILL,
              color: '#fff',
              fontStyle: 'normal',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 999,
            }
          : null),
      }}
    >
      ×{linked}/{count}
    </span>
  )
}
