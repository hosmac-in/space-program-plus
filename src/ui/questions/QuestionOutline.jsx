// The Questions tab: the question set that will create an option, authored one
// building at a time.
//
// Drawn as an OUTLINE, not a canvas, unlike the other two tabs. Those two draw a
// catalog and a program — things with a shape, where what sits inside what is
// the information. A questionnaire is an ordered document: it is read top to
// bottom in the order it will be asked, and an outline is what that is. React
// Flow would give it pan, zoom and free placement, none of which mean anything
// for a list.
//
// Three levels and no more, which is the grammar (see data/questionnaire.js):
//
//   group          a named heading; sections the wizard's page
//     question     a yes/no GATE. Yes reveals the questions under it.
//       question   yes ADDS the department it is bound to
//
// Selecting is what side reads — the same division every other tab follows:
// selecting happens in main, side reports on it.

import { useCatalog } from '../../data/catalog.jsx'
import { Band, BandRow } from '../primitives/Band.jsx'
import AddButton from '../primitives/AddButton.jsx'
import RemoveButton from '../primitives/RemoveButton.jsx'
import TabButton from '../primitives/TabButton.jsx'
import { PanelNote } from '../panel/panelParts.jsx'
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'

// One row of the outline, at whichever depth. The three levels differ by indent,
// weight and what hangs off the right — not by being three components, because
// they are the same row.
function OutlineRow({ depth, label, muted, selected, canEdit, onSelect, onRemove, removeTitle, right }) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 10px',
        marginLeft: depth * 22,
        borderRadius: 6,
        cursor: 'pointer',
        minWidth: 0,
        background: selected ? '#e8f0fe' : 'transparent',
        boxShadow: selected ? 'inset 0 0 0 1px #1a73e8' : undefined,
      }}
    >
      <span
        title={label}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 13,
          fontWeight: depth === 0 ? 700 : 400,
          textTransform: depth === 0 ? 'uppercase' : undefined,
          letterSpacing: depth === 0 ? '0.03em' : undefined,
          color: muted ? '#aaa' : '#222',
        }}
      >
        {label}
      </span>
      {right}
      {/* RemoveButton stops its own click, so pressing × doesn't also select
          the row it just removed. */}
      {canEdit && onRemove && <RemoveButton onRemove={onRemove} title={removeTitle} size={16} />}
    </div>
  )
}

// The quiet marks on a row that say what it will do when answered, so the
// outline can be read without opening each question in turn.
function Marks({ question, isSub }) {
  const marks = []
  if (isSub) marks.push(question.department_node_id ? 'adds a department' : 'no department yet')
  if (question.number) marks.push(`number: ${question.number.label || 'unlabelled'}`)

  if (marks.length === 0) return null
  return (
    <span style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap', flexShrink: 0 }}>{marks.join(' · ')}</span>
  )
}

export default function QuestionOutline({ buildingId, onSelectBuilding, selectedId, onSelect, canEdit, onLeave }) {
  const { buildings } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  const { definition } = editor

  const groups = definition?.groups ?? []

  // The new node is selected as soon as it exists, so authoring is add-then-fill
  // rather than add-then-hunt-for-it.
  const addAnd = (promise) => promise.then((id) => id && onSelect(id))

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Band edge="bottom">
        <BandRow title="Building" last>
          {buildings.map((b) => (
            <TabButton
              key={b.id}
              label={b.name}
              active={b.id === buildingId}
              onClick={() => onSelectBuilding(b.id)}
            />
          ))}
          {/* The way back, the same one the Tree tab's own tab button is. */}
          <div style={{ flex: 1 }} />
          <TabButton label="Close" active={false} onClick={onLeave} />
        </BandRow>
      </Band>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, minWidth: 0 }}>
        {editor.error && (
          <div style={{ color: '#8a1c12', background: '#fdecea', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
            {editor.error}
          </div>
        )}

        {!editor.ready ? (
          <PanelNote pad>
            No questionnaire row for this building — run <code>sql/questionnaire_setup.sql</code>.
          </PanelNote>
        ) : groups.length === 0 ? (
          <PanelNote pad>
            Nothing authored for this building yet. Add a group — a heading like Clinical or Support — then the
            questions that go under it.
          </PanelNote>
        ) : null}

        {groups.map((group) => (
          <div key={group.instance_id} style={{ marginBottom: 14, minWidth: 0 }}>
            <OutlineRow
              depth={0}
              label={group.name || 'Untitled group'}
              selected={selectedId === group.instance_id}
              canEdit={canEdit}
              onSelect={() => onSelect(group.instance_id)}
              onRemove={() => editor.deleteGroup(group.instance_id)}
              removeTitle={`Remove ${group.name || 'this group'}`}
            />

            {(group.questions || []).map((question) => (
              <div key={question.instance_id} style={{ minWidth: 0 }}>
                <OutlineRow
                  depth={1}
                  label={question.prompt || 'Untitled question'}
                  selected={selectedId === question.instance_id}
                  canEdit={canEdit}
                  onSelect={() => onSelect(question.instance_id)}
                  onRemove={() => editor.deleteQuestion(question.instance_id)}
                  removeTitle="Remove this question and the ones under it"
                  right={<Marks question={question} isSub={false} />}
                />

                {(question.questions || []).map((sub) => (
                  <OutlineRow
                    key={sub.instance_id}
                    depth={2}
                    label={sub.prompt || 'Untitled question'}
                    muted={!sub.department_node_id}
                    selected={selectedId === sub.instance_id}
                    canEdit={canEdit}
                    onSelect={() => onSelect(sub.instance_id)}
                    onRemove={() => editor.deleteSubQuestion(sub.instance_id)}
                    removeTitle="Remove this question"
                    right={<Marks question={sub} isSub />}
                  />
                ))}

                {/* Sub-questions stop here: this + adds one, and a sub-question
                    has no + of its own. Two levels is the whole grammar. */}
                {canEdit && (
                  <div style={{ marginLeft: 2 + 2 * 22 }}>
                    <AddButton
                      onClick={() => addAnd(editor.addSubQuestion(question.instance_id))}
                      title="Add a question under this one"
                      size={16}
                    />
                  </div>
                )}
              </div>
            ))}

            {canEdit && (
              <div style={{ marginLeft: 2 + 22 }}>
                <AddButton
                  onClick={() => addAnd(editor.addQuestion(group.instance_id))}
                  title={`Add a question to ${group.name || 'this group'}`}
                  size={18}
                />
              </div>
            )}
          </div>
        ))}

        {canEdit && editor.ready && (
          <div style={{ marginTop: 8 }}>
            <AddButton onClick={() => addAnd(editor.addGroup())} title="Add a group" size={22} />
          </div>
        )}
      </div>
    </div>
  )
}
