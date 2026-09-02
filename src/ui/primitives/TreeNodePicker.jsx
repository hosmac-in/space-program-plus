// Points at ONE placement in the catalog tree.
//
// Two uses, both in the questionnaire designer: a sub-question's department
// binding, and that question's number target — which is narrowed to the rooms
// inside that same department. One component rather than two, for the reason
// CLAUDE.md gives: a second picker is how two of them drift.
//
// It lists PLACEMENTS, not definitions, which is the whole difficulty: the same
// Lobby placed in two buildings is two rows with the same name. So every row
// carries its path, and SearchAddPicker draws and searches it.
//
// What is bound is shown as a row with its own × — the binding is a value you
// replace or clear, not a list you append to, so the + disappears once one is
// set. Anything already chosen shows its FROZEN path when the placement has
// since left the catalog, which is what the stored *_path is for.

import { useMemo } from 'react'
import { useCatalog } from '../../data/catalog.jsx'
import { findFlatNode, flattenTreeNodes } from '../../data/tree.js'
import RemoveButton from './RemoveButton.jsx'
import { SearchAddPicker } from './SearchAddPicker.jsx'

const KIND_LABEL = { department: 'Department', room: 'Room', object: 'Object' }

export default function TreeNodePicker({
  label,
  // The stored binding: the id, and the path frozen when it was chosen.
  instanceId,
  path,
  // Which levels may be pointed at. A department binding takes departments
  // only; a number target takes rooms only.
  kinds,
  // Narrows the list to one department placement's own nodes. A question's
  // number sizes a room in the department that question adds, so offering the
  // whole catalog would offer a question that adds one thing and sizes another.
  withinDepartment,
  // Shown instead of the picker when there is nothing to choose from yet —
  // which for a number target means no department is bound.
  emptyNote,
  canEdit = true,
  onPick,
  onClear,
}) {
  const { sections, departments, rooms, objects, groups, buildings } = useCatalog()

  const flat = useMemo(() => {
    const all = flattenTreeNodes(sections, { departments, rooms, objects, groups, buildings }, { kinds })
    return withinDepartment === undefined ? all : all.filter((n) => n.deptInstanceId === withinDepartment)
  }, [sections, departments, rooms, objects, groups, buildings, kinds, withinDepartment])

  const live = findFlatNode(flat, instanceId)
  // Bound to something the catalog no longer has. The frozen path is all that
  // is left to say which placement it was, which is exactly why it is stored.
  const lost = instanceId && !live

  return (
    <div style={{ marginTop: 10, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: '#777', marginBottom: 2 }}>{label}</div>

      {instanceId ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>
              {live?.name ?? 'Not in the tree'}
              {live && kinds?.length !== 1 && (
                <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 11, color: '#888' }}>
                  {KIND_LABEL[live.kind]}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: lost ? '#c17' : '#999', overflowWrap: 'anywhere' }}>
              {live?.path ?? path ?? '—'}
              {lost && <span style={{ marginLeft: 6 }}>(no longer in the tree)</span>}
            </div>
          </div>
          {canEdit && <RemoveButton onRemove={onClear} title={`Clear ${label}`} size={16} />}
        </div>
      ) : canEdit && flat.length > 0 ? (
        <SearchAddPicker
          options={flat}
          placeholder={withinDepartment ? 'Search this department...' : 'Search the catalog...'}
          title={`Choose ${label}`}
          label="Choose"
          size={16}
          width={320}
          onAdd={(node) => onPick(node)}
        />
      ) : canEdit ? (
        <div style={{ fontSize: 12, color: '#999' }}>{emptyNote ?? 'Nothing to choose from'}</div>
      ) : (
        <div style={{ fontSize: 12, color: '#bbb' }}>Not set</div>
      )}
    </div>
  )
}
