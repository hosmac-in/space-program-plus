// THE NAMES A FIELD WILL FINISH FOR YOU, under the caret.
//
// >>> NOT SearchAddPicker, and the difference is not cosmetic. That one OWNS its
// >>> trigger and its own search box, and is anchored to a button; this is
// >>> anchored to a point inside somebody else's input, filtered by what is
// >>> already typed there, and never holds focus at all — the field keeps it, or
// >>> every keystroke would leave the rule. Widening the picker to cover both
// >>> would have meant a mode where most of it is inert.
//
// IT IS A PORTAL, for the reason every popover in this app is: side is an
// overflowY column, and a scroll container clips its descendants at any z-index.
// See SearchAddPicker, which learnt this first.
//
// FOCUS STAYS IN THE FIELD, so this takes no clicks through onClick — a click
// blurs the input before the handler runs, which commits the rule and unmounts
// the list. onMouseDown with preventDefault is what keeps the caret where it was.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const ROW = 22
const MAX_ROWS = 8

// Breathing room against either edge of the window, and the floor the list stops
// sliding left at.
const GUTTER = 8

// Wide enough that a short list does not look like a stray box, and capped so a
// very long path does not span the whole window — past this it ellipsises, and
// the completion is nearly made anyway by the time a name is that long.
const MIN_WIDTH = 200
const MAX_WIDTH = 620

// What is being completed: the name the caret is inside, and where it starts.
// A name here may hold dots (see isNameChar in data/formula.js), so this walks
// the same characters the tokeniser would.
export function tokenAt(source, caret) {
  const text = String(source ?? '')
  const isChar = (c) => /[A-Za-z0-9_.]/.test(c)
  let start = caret
  while (start > 0 && isChar(text[start - 1])) start -= 1
  return { start, text: text.slice(start, caret) }
}

// The matches, best first: what STARTS with the typed text before what merely
// contains it. A name is reached by typing its beginning far more often than by
// typing its middle, and a list that mixes the two puts the row you meant below
// four you did not.
export function completionsFor(names, typed) {
  if (!typed) return []
  const needle = typed.toLowerCase()
  const starts = []
  const inside = []
  names.forEach((name) => {
    const at = name.toLowerCase().indexOf(needle)
    if (at === 0) starts.push(name)
    else if (at > 0) inside.push(name)
  })
  // One exact match and nothing else is a name already finished — there is
  // nothing to offer, and a list over a completed word is a list in the way.
  if (starts.length === 1 && inside.length === 0 && starts[0].toLowerCase() === needle) return []
  return [...starts, ...inside]
}

export default function CompletionList({ options, active, at, onPick }) {
  const [box, setBox] = useState(null)
  const listRef = useRef(null)

  // Measured after layout, so the flip is decided against the height it will
  // actually have rather than against the one it had a frame ago.
  useLayoutEffect(() => {
    if (!at) return setBox(null)
    const height = Math.min(options.length, MAX_ROWS) * ROW + 8
    const below = window.innerHeight - at.bottom
    setBox({
      left: at.left,
      top: below < height + 8 ? at.top - height - 2 : at.bottom + 2,
      height,
    })
  }, [at, options.length])

  // IT GROWS LEFTWARD, because a name is read by its TAIL. The list sizes to its
  // longest path and would then run off the right edge — side is the last column
  // on screen and the caret is already near it — so what falls off is the end of
  // every row, which is the half telling two paths apart. Sliding the whole list
  // left keeps the caret's own row aligned where there is room and gives up the
  // alignment only when there is not.
  //
  // Measured rather than estimated: the width is a path nobody can predict, and
  // this runs before paint, so the list never appears in the wrong place.
  useLayoutEffect(() => {
    const node = listRef.current
    if (!node || !box) return
    const width = node.offsetWidth
    const room = window.innerWidth - GUTTER
    const left = Math.max(GUTTER, Math.min(box.left, room - width))
    if (Math.abs(left - box.left) > 0.5) setBox((b) => (b ? { ...b, left } : b))
  }, [box, options])

  // The active row kept in view as the arrows walk past the eighth one.
  useEffect(() => {
    const node = listRef.current?.children?.[active]
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!at || !box || options.length === 0) return null

  return createPortal(
    <div
      ref={listRef}
      style={{
        position: 'fixed',
        left: box.left,
        top: box.top,
        maxHeight: box.height,
        // SIZED BY THE LONGEST PATH IN IT, not by a column: these are names read
        // character by character and a truncated one is a name you cannot tell
        // from its neighbour. max-content over the rows, which are `nowrap`.
        width: 'max-content',
        minWidth: MIN_WIDTH,
        maxWidth: Math.min(MAX_WIDTH, window.innerWidth - GUTTER * 2),
        overflowY: 'auto',
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 4,
        boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
        // ABOVE EVERYTHING, and the lightbox is why. This portals to <body>, so
        // it is a SIBLING of whatever opened it rather than a child — under the
        // lightbox's own overlay it simply disappeared. Nothing is ever meant to
        // cover a completion: it is always the newest thing on screen.
        zIndex: 100,
        padding: 4,
      }}
    >
      {options.map((name, i) => (
        <div
          key={name}
          // NOT onClick: a click blurs the field first, which commits the rule
          // and takes this list with it before any handler here could run.
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(name)
          }}
          style={{
            height: ROW,
            lineHeight: `${ROW}px`,
            padding: '0 6px',
            borderRadius: 3,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: 'pointer',
            background: i === active ? '#f2f7ff' : '#fff',
          }}
        >
          {name}
        </div>
      ))}
    </div>,
    document.body
  )
}
