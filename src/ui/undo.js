// What the two undo systems have in common.
//
// The Project tab and the Tree tab keep history differently, and have to: an
// option is one row with one editor, so it keeps snapshots of itself; the
// catalog is shared and its edits are relative, so it keeps inverse commands
// that re-apply against whatever the tree looks like now.
//
// But how deep the history goes, and which keys drive it, are not properties of
// either data model — they are properties of the app. They live here so the two
// tabs cannot answer them differently.

import { useEffect } from 'react'

// The same number of steps back on both tabs.
export const UNDO_DEPTH = 20

// Ctrl/Cmd+Z to undo, Ctrl+Y or Shift+Ctrl+Z to redo.
//
// Bound in one place — AppFooter, which already decides which stack the ribbon
// drives — so the keyboard and the buttons can never point at different
// histories. Typing in a field is never an undo: the browser's own text undo
// belongs to the caret.
export function useUndoShortcuts({ onUndo, onRedo, enabled = true }) {
  useEffect(() => {
    if (!enabled) return undefined

    function handleKeyDown(event) {
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
      if (!(event.ctrlKey || event.metaKey)) return

      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        onUndo?.()
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        onRedo?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onUndo, onRedo])
}
