import { useCallback, useRef, useState } from 'react'

// Drag one row of a side-panel list into a different place in it.
//
// THE ORDER IS THE DATA. These lists are arrays in a jsonb document and the
// array's order is what everything draws — there is no sort key and there
// should not be, for the reason sp_section needed one and these do not: a room
// list belongs to one department and is rewritten whole on every edit anyway.
//
// The caller keeps owning the write, because the two tabs save differently and
// this must not know which it is in: the Tree tab commits a reorder as one
// jsonb write and one undo step, the Project tab as one in-memory change that
// lights Save Data.
//
// PREVIEWED WHILE DRAGGING, COMMITTED ON DROP. The rows rearrange live under the
// pointer — the same "make space as it passes" the canvases do — but `onCommit`
// fires once, at the end. Reordering the real array on every crossing would be a
// database write per row passed on the Tree tab, and an undo step per row.
//
// The HANDLE is what is draggable, not the row: a room block is full of inputs,
// and a draggable ancestor makes selecting text in them a drag instead.
export function useReorderList({ items, keyOf, onCommit, enabled = true }) {
  // The arrangement being previewed, as keys. Null when no drag is in progress,
  // which is what makes `items` the truth the rest of the time.
  const [keys, setKeys] = useState(null)
  const [dragging, setDragging] = useState(null)
  // The row the pointer was last over. dragenter BUBBLES, so moving across a
  // row's children re-fires it against the same row — and re-running the move
  // there swaps the pair back and forth for as long as the pointer sits still.
  const over = useRef(null)

  const stop = useCallback(() => {
    setKeys(null)
    setDragging(null)
    over.current = null
  }, [])

  const order = keys ?? items.map(keyOf)
  const byKey = new Map(items.map((item) => [keyOf(item), item]))
  // Anything the preview has never heard of — an item added mid-drag, which
  // nothing does today — simply keeps its place in `items`.
  const shown = keys ? keys.map((k) => byKey.get(k)).filter(Boolean) : items

  const handleProps = (key) =>
    !enabled
      ? null
      : {
          draggable: true,
          onDragStart: (e) => {
            // Firefox starts no drag at all unless the transfer carries data.
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', String(key))
            over.current = key
            setDragging(key)
            setKeys(items.map(keyOf))
          },
          // Fires after onDrop, and also when a drag is abandoned — which is
          // what discards the preview and leaves the stored order alone.
          onDragEnd: stop,
        }

  const itemProps = (key) => ({
    onDragEnter: () => {
      if (dragging == null || over.current === key) return
      over.current = key
      if (key === dragging) return
      setKeys((cur) => {
        const next = [...(cur ?? items.map(keyOf))]
        const from = next.indexOf(dragging)
        const to = next.indexOf(key)
        if (from < 0 || to < 0) return cur
        next.splice(to, 0, ...next.splice(from, 1))
        return next
      })
    },
  })

  // On the element WRAPPING the rows, so the gaps between them are droppable
  // too — a drop landing in an 8px gutter would otherwise read as abandoned and
  // silently undo everything the pointer had just rearranged.
  const listProps = !enabled
    ? null
    : {
        onDragOver: (e) => {
          if (dragging == null) return
          // Without preventDefault the browser refuses the drop, and onDrop
          // never fires however carefully it is wired.
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        },
        onDrop: (e) => {
          if (dragging == null) return
          e.preventDefault()
          const next = order.map((k) => byKey.get(k)).filter(Boolean)
          // Nothing moved: no write, no undo step, no dirty Save Data.
          if (next.some((item, i) => item !== items[i])) onCommit(next)
          stop()
        },
      }

  return { items: shown, draggingKey: dragging, handleProps, itemProps, listProps }
}
