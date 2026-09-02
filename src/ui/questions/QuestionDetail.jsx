// Side, on the Questions tab: whichever node the outline last selected.
//
// Three faces, one per level of the grammar, and the difference between the two
// question faces is the whole point of the design:
//
//   group          a name, and nothing else — it is a heading
//   question       a prompt and an optional number. A GATE: yes reveals the
//                  questions under it and adds nothing itself
//   sub-question   a prompt, THE DEPARTMENT ITS YES ADDS, and an optional number
//
// Every field writes when you leave it, not on every keystroke: each write is a
// whole-document write of a jsonb column (see data/questionnaire.js), and a
// write per character would be a write per character. The draft is local until
// then, so a half-typed prompt never reaches the database.

import { useEffect, useState } from 'react'
import { findNode, newNumber } from '../../data/questionnaire.js'
import TreeNodePicker from '../primitives/TreeNodePicker.jsx'
import RemoveButton from '../primitives/RemoveButton.jsx'
import AddButton from '../primitives/AddButton.jsx'
import { PanelNote } from '../panel/panelParts.jsx'
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'

// A sub-question binds a department; its number sizes a ROOM inside that
// department. Nothing else is pointable — not an object, not the department
// itself, not a room somewhere else in the catalog. See the grammar note at the
// top of data/questionnaire.js.
const DEPARTMENT_KINDS = ['department']
const ROOM_KINDS = ['room']

// A text field that reports when you leave it, seeded from the stored value and
// re-seeded whenever that changes underneath — a reload, or an edit made in
// another window.
function Field({ label, value, placeholder, canEdit, onCommit }) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])

  if (!canEdit) {
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: '#777', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{value || '—'}</div>
      </div>
    )
  }

  return (
    <label style={{ display: 'block', marginTop: 10 }}>
      <span style={{ display: 'block', fontSize: 11, color: '#777', marginBottom: 2 }}>{label}</span>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== (value ?? '') && onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(value ?? '')
        }}
        style={{ width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 13 }}
      />
    </label>
  )
}

// The number a question may ask for. Absent by default — most questions are a
// yes/no and nothing else.
//
// On a sub-question it names a room in that question's department, and the
// answer becomes that room's count directly. On a gate it names nothing: a gate
// adds no department, so there is nothing of its own to size, and its number is
// a headline figure.
function NumberBlock({ number, departmentNodeId, isSub, canEdit, onSet, onRemove }) {
  if (!number) {
    if (!canEdit) return null
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, color: '#777', marginBottom: 2 }}>Number</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <AddButton onClick={() => onSet(newNumber())} title="Ask for a number as well" size={16} />
          <span style={{ fontSize: 12, color: '#888' }}>Ask for a number too</span>
        </span>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 14, border: '1px solid #eee', borderRadius: 6, padding: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: '#777', textTransform: 'uppercase' }}>
          Number
        </span>
        {canEdit && <RemoveButton onRemove={onRemove} title="Stop asking for a number" size={16} />}
      </div>

      <Field
        label="Asked as"
        value={number.label}
        placeholder={isSub ? 'How many beds?' : 'How many in total?'}
        canEdit={canEdit}
        onCommit={(label) => onSet({ ...number, label })}
      />

      {isSub ? (
        <>
          <TreeNodePicker
            label="Sets the count of"
            instanceId={number.target_node_id}
            path={number.target_path}
            kinds={ROOM_KINDS}
            withinDepartment={departmentNodeId ?? null}
            emptyNote={
              departmentNodeId
                ? 'That department has no rooms in the catalog yet — add them on the Tree tab.'
                : 'Bind a department above first; the room is one of its own.'
            }
            canEdit={canEdit}
            onPick={(node) => onSet({ ...number, target_node_id: node.instanceId, target_path: node.path })}
            onClear={() => onSet({ ...number, target_node_id: null, target_path: null })}
          />
          {/* No multiplier: the answer IS the count. */}
          <PanelNote>The answer becomes how many of that room this department has.</PanelNote>
        </>
      ) : (
        <PanelNote>
          A total for the brief. A gate adds no department, so this number sizes nothing of its own — the questions
          under it are what set room counts.
        </PanelNote>
      )}
    </div>
  )
}

export default function QuestionDetail({ selectedId, canEdit }) {
  const editor = useQuestionnaireEditorContext()
  const found = findNode(editor.definition, selectedId)

  if (!editor.ready) {
    return (
      <PanelNote pad>
        No questionnaire for this building yet. Run <code>sql/questionnaire_setup.sql</code>.
      </PanelNote>
    )
  }

  if (!found) {
    return <PanelNote pad>Pick a group or a question on the left.</PanelNote>
  }

  const { kind, node, group, question } = found

  if (kind === 'group') {
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888' }}>Group</div>
        <Field
          label="Name"
          value={node.name}
          placeholder="Clinical"
          canEdit={canEdit}
          onCommit={(name) => editor.renameGroup(node.instance_id, name)}
        />
        <PanelNote>
          A heading. It sections the wizard's page for this building and is never answered.
        </PanelNote>
      </div>
    )
  }

  const isSub = kind === 'subQuestion'

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888' }}>
        {isSub ? 'Question' : 'Question · gate'}
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, overflowWrap: 'anywhere' }}>
        {group.name || 'Untitled group'}
        {isSub && ` → ${question.prompt || 'Untitled question'}`}
      </div>

      <Field
        label="Asked as"
        value={node.prompt}
        placeholder={isSub ? 'General ward?' : 'Are there inpatient beds?'}
        canEdit={canEdit}
        onCommit={(prompt) => editor.setQuestion(node.instance_id, (q) => ({ ...q, prompt }))}
      />

      {isSub ? (
        <TreeNodePicker
          label="Yes adds this department"
          instanceId={node.department_node_id}
          path={node.department_path}
          kinds={DEPARTMENT_KINDS}
          canEdit={canEdit}
          // Re-binding clears the number's target: it names a room inside the
          // department this question used to add, and no longer does.
          onPick={(picked) =>
            editor.setQuestion(node.instance_id, (q) => ({
              ...q,
              department_node_id: picked.instanceId,
              department_path: picked.path,
              number: q.number ? { ...q.number, target_node_id: null, target_path: null } : null,
            }))
          }
          onClear={() =>
            editor.setQuestion(node.instance_id, (q) => ({
              ...q,
              department_node_id: null,
              department_path: null,
              number: q.number ? { ...q.number, target_node_id: null, target_path: null } : null,
            }))
          }
        />
      ) : (
        <PanelNote>
          A gate: yes opens the questions under it and adds nothing itself. The departments are added by those.
        </PanelNote>
      )}

      <NumberBlock
        number={node.number}
        isSub={isSub}
        departmentNodeId={node.department_node_id}
        canEdit={canEdit}
        onSet={(number) => editor.setQuestion(node.instance_id, (q) => ({ ...q, number }))}
        onRemove={() => editor.setQuestion(node.instance_id, (q) => ({ ...q, number: null }))}
      />
    </div>
  )
}
