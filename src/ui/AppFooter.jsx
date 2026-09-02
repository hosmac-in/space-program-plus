// The footer: the full-width band under both main and side.
//
// It holds the undo/redo ribbon on the left and the Tree tab on the right —
// the app's only tab, and a toggle: it opens the catalog from wherever you are,
// and pressing it again returns you to the canvas you left. Without that second
// press there'd be no way back but Home, which throws away the open option.
// The ribbon used to be drawn inside each canvas — so it stopped at main's edge
// and vanished entirely on UHDP, where there is no canvas to draw it. One band
// now, always present and always the same height, so the regulating line above
// it holds on every tab.
//
// Undo/redo is per domain (see CLAUDE.md): the catalog has one stack, an option
// has its own. The footer doesn't own either — it shows whichever belongs to
// the tab you're on, and sits disabled on UHDP, which edits neither.

import UndoRedoRibbon from './primitives/UndoRedoRibbon.jsx'
import TabButton from './primitives/TabButton.jsx'
import { useTreeEditorContext } from './tree/useTreeEditor.jsx'
import { useUndoShortcuts } from './undo.js'

export default function AppFooter({ view, canEdit, builder, onViewChange }) {
  // Safe on every tab: the provider wraps the whole app, and the hook is only
  // ever read here — this component is rendered inside it.
  const editor = useTreeEditorContext()

  // A read-only viewer has no catalog undo to offer, since they can't edit it.
  const tree = view === 'tree' && canEdit
  const option = view === 'project'

  const props = tree
    ? { onUndo: editor.undo, onRedo: editor.redo, canUndo: editor.canUndo, canRedo: editor.canRedo }
    : option
      ? { onUndo: builder.undo, onRedo: builder.redo, canUndo: builder.canUndo, canRedo: builder.canRedo }
      : { canUndo: false, canRedo: false }

  // The keyboard drives whatever the ribbon drives — bound here so the two
  // cannot end up pointing at different histories. Disabled on UHDP, which has
  // no history at all.
  useUndoShortcuts({ onUndo: props.onUndo, onRedo: props.onRedo, enabled: tree || option })

  return (
    <UndoRedoRibbon {...props}>
      {/* Pushes the tab to the far right of the band. */}
      <div style={{ flex: 1 }} />
      <TabButton
        label="Tree"
        active={view === 'tree'}
        onClick={() => onViewChange(view === 'tree' ? 'project' : 'tree')}
      />
    </UndoRedoRibbon>
  )
}
