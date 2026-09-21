// THE QUESTIONNAIRE DESIGNER, in main: the catalog with the questions hung off
// it.
//
// It is the SAME TREE the side panels draw — TreeLayer and Branch out of
// ui/panel/PanelTree.jsx, one drawing over the whole outline — because it is the
// same information at a different level: what sits inside what. Two trees with
// two ideas of what an indent is are two trees, so nothing here restates a
// number.
//
//   section        from the catalog, in the catalog's order
//     group        from the catalog, and it carries ONE question — the gate
//       department from the catalog, and it is functioning or supporting
//         question authored here. Functioning departments only.
//
// Nothing on this tab adds or removes a section, a group or a department: those
// are the Tree tab's, and this document only says what is asked about them.
// The only + is a question.
//
// Selecting happens here and side reports on it — the division every tab
// follows.

import { useState } from 'react'
import { useCatalog } from '../../data/catalog.jsx'
import { Band, BandRow } from '../primitives/Band.jsx'
import AddButton from '../primitives/AddButton.jsx'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import TabButton from '../primitives/TabButton.jsx'
import { PanelNote } from '../panel/panelParts.jsx'
import { removeHint } from '../primitives/RemoveButton.jsx'
import { Branch, TreeLayer } from '../panel/PanelTree.jsx'
import { ADD_ENDPOINT } from '../canvas/canvasLayout.js'
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'
import { buildModel, SUPPORTING } from './questionModel.js'
import { ROOM_GROUP } from '../../data/questionnaire.js'

// One row height for every level, so the tree's elbows land on a regular pitch
// and a section reads as the same kind of thing as a question, one step up.
const ROW = 26
const GAP = 4

// The type ladder, shallowest first. A section is the only thing set in caps:
// it is the divider the outline is scanned by, and everything under it is
// sentence case so the two never compete.
const LEVEL = {
  section: { size: 13, weight: 700, caps: true },
  group: { size: 13, weight: 600, caps: false },
  department: { size: 13, weight: 500, caps: false },
  question: { size: 13, weight: 400, caps: false },
  connection: { size: 12, weight: 500, caps: false },
  room: { size: 12, weight: 400, caps: false },
}

// A supporting department's chip. It is the DEPARTURE — absence means
// functioning — so only one of the two is ever written, and the row stays quiet
// for the common case.
function RoleChip() {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: '#6a5a2a',
        background: '#fdf3d6',
        borderRadius: 4,
        padding: '1px 5px',
      }}
    >
      supporting
    </span>
  )
}

// The quiet marks that say what a row will do when answered, so the outline can
// be read without opening each question in turn.
function Marks({ text }) {
  if (!text) return null
  return <span style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap', flexShrink: 0 }}>{text}</span>
}

function Row({ level, label, muted, selected, onSelect, right }) {
  const type = LEVEL[level]
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: ROW,
        paddingInline: 8,
        marginLeft: -8,
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
          fontSize: type.size,
          fontWeight: type.weight,
          textTransform: type.caps ? 'uppercase' : undefined,
          letterSpacing: type.caps ? '0.03em' : undefined,
          color: muted ? '#aaa' : '#222',
        }}
      >
        {label}
      </span>
      {right}
    </div>
  )
}

// THE RULE ITSELF, on the row it belongs to. A formula is short and is the whole
// content of a connection, so the outline states it rather than making you open
// each one in turn to find out what it does.
function Rule({ compiled }) {
  if (!compiled.authored) {
    return <span style={{ fontSize: 11, color: '#c00', opacity: 0.55, flexShrink: 0 }}>no rule yet</span>
  }
  return (
    <code
      title={compiled.ok ? compiled.source : compiled.message}
      style={{
        flexShrink: 0,
        fontSize: 11,
        color: compiled.ok ? '#666' : '#b3261e',
        background: compiled.ok ? '#f6f6f6' : '#fdecea',
        borderRadius: 4,
        padding: '1px 5px',
        maxWidth: 160,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {compiled.source}
    </code>
  )
}

// What a question does, in one line. The rooms are drawn under it, so their
// count is not worth repeating — only what is MISSING is, which is a question
// that connects to nothing or whose rules were never written.
function questionMarks(question, connections) {
  const marks = []
  if (connections.length === 0) marks.push('no rooms yet')
  else {
    const unruled = connections.filter((c) => !c.compiled.authored).length
    if (unruled > 0) marks.push(`${unruled} without a rule`)
  }
  if (question.comment) marks.push('commented')
  return marks.join(' · ')
}

// A supporting department is read by what it scales off — the one thing its name
// does not say — and by how much of it is actually written.
function supportingMarks(department) {
  const ruled = department.connections.filter((c) => c.compiled.authored).length
  const all = department.connections.length
  const scale = department.variables.length === 0 ? 'scales off nothing yet' : department.variables.map((v) => v.name).join(' · ')
  if (all === 0) return scale
  return `${scale} · ${ruled}/${all} sized`
}

// A question, with WHAT IT CONNECTS TO under it — the follow-up, always the same
// shape: a catalog room group or a room, and a counter. A single room draws
// nothing under it; a group lists its rooms, since "3 Tesla" alone does not say
// which three rooms it brings.
function QuestionBranch({ node, canEdit, selectedId, onSelect, onRemove }) {
  const connections = node.connections

  return (
    <Branch
      endpoint={connections.length > 0 ? 'caret' : 'dot'}
      expanded={connections.length > 0}
      head={ROW / 2}
      // RIGHT-CLICK ON THE BRANCH'S END, the one remove gesture in this app.
      // There is no × on a row here.
      onRemove={canEdit ? () => onRemove(node) : null}
      removeTitle={removeHint('this question')}
    >
      <Row
        level="question"
        label={node.question.prompt || 'Untitled question'}
        muted={!node.question.prompt}
        selected={selectedId === node.id}
        onSelect={() => onSelect(node.id)}
        right={<Marks text={questionMarks(node.question, connections)} />}
      />

      {/* Nothing below the question is separately selectable: a connection
          belongs to the question above it, and side draws the whole thing when
          that question is open. Clicking one selects the question. */}
      {connections.map((connection) => (
        <ConnectionBranch key={connection.instance_id} connection={connection} onSelect={() => onSelect(node.id)} />
      ))}
    </Branch>
  )
}

// One connection and its rule, under whatever owns it — a question, or a
// supporting department directly. Drawn once, for both.
function ConnectionBranch({ connection, onSelect }) {
  const group = connection.kind === ROOM_GROUP
  return (
    <Branch endpoint={group ? 'caret' : 'dot'} expanded={group} head={ROW / 2}>
      <Row
        level="connection"
        label={connection.name}
        muted={connection.missing}
        onSelect={onSelect}
        right={<Rule compiled={connection.compiled} />}
      />
      {/* Only a group: a single room would say its name twice, one line under
          the other. */}
      {group &&
        connection.rooms.map((room) => (
          <Branch key={room.instance_id} endpoint="dot" head={ROW / 2}>
            <Row level="room" label={room.label} onSelect={onSelect} />
          </Branch>
        ))}
    </Branch>
  )
}

export default function QuestionOutline({ buildingId, onSelectBuilding, selectedId, onSelect, canEdit, onLeave }) {
  const { buildings, sections, groups, departments, rooms } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  // What a right-click on a question's branch is asking to remove. The caller
  // ALWAYS prompts — see Branch's onRemove.
  const [pendingRemove, setPendingRemove] = useState(null)

  const model = buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms })

  // The new question is selected as soon as it exists, so authoring is
  // add-then-fill rather than add-then-hunt-for-it.
  const addAnd = (promise) => promise.then((id) => id && onSelect(id))

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Band edge="bottom">
        <BandRow title="Building" last>
          {buildings.map((b) => (
            <TabButton key={b.id} label={b.name} active={b.id === buildingId} onClick={() => onSelectBuilding(b.id)} />
          ))}
          {/* The way back, the same one the Tree tab's own tab button is. */}
          <div style={{ flex: 1 }} />
          <TabButton label="Close" active={false} onClick={onLeave} />
        </BandRow>
      </Band>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, minWidth: 0 }}>
        {editor.error && (
          <div style={{ color: '#8a1c12', background: '#fdecea', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
            {editor.error}
          </div>
        )}

        {!editor.ready ? (
          <PanelNote pad>
            No questionnaire row for this building — run <code>sql/questionnaire_setup.sql</code>.
          </PanelNote>
        ) : model.length === 0 ? (
          <PanelNote pad>
            This building has no sections in the catalog yet. The questionnaire follows the tree — build it on the Tree
            tab first.
          </PanelNote>
        ) : null}

        <TreeLayer>
          {model.map((section) => (
            <Branch key={section.id} endpoint="caret" expanded padTop={GAP} head={GAP + ROW / 2}>
              <Row
                level="section"
                label={section.name}
                selected={selectedId === section.id}
                onSelect={() => onSelect(section.id)}
                right={<Marks text={section.groups.length === 0 ? 'no groups' : null} />}
              />

              {section.groups.map((group) => (
                <Branch key={group.id} endpoint="caret" expanded padTop={GAP} head={GAP + ROW / 2}>
                  <Row
                    level="group"
                    label={group.name}
                    selected={selectedId === group.id}
                    onSelect={() => onSelect(group.id)}
                    // The gate is the group's one question, so it is stated on
                    // the group's own row rather than drawn as a child — a
                    // level that always holds exactly one thing is not a level.
                    right={<Marks text={group.gate?.prompt ? `“${group.gate.prompt}”` : 'no question yet'} />}
                  />

                  {group.departments.map((department) => {
                    const supporting = department.role === SUPPORTING
                    return (
                      <Branch
                        key={department.id}
                        endpoint={supporting && !department.connections.some((c) => c.compiled.authored) ? 'dot' : 'caret'}
                        expanded={!supporting || department.connections.some((c) => c.compiled.authored)}
                        padTop={GAP}
                        head={GAP + ROW / 2}
                      >
                        <Row
                          level="department"
                          label={department.name}
                          selected={selectedId === department.id}
                          onSelect={() => onSelect(department.id)}
                          right={
                            <>
                              <Marks
                                text={
                                  supporting
                                    ? supportingMarks(department)
                                    : department.questions.length === 0
                                      ? 'no questions yet'
                                      : null
                                }
                              />
                              {supporting && <RoleChip />}
                            </>
                          }
                        />

                        {/* A supporting department carries no questions and no
                            + — its rooms are sized directly, by the rules it
                            holds, which are authored in side. */}
                        {/* ONLY THE ROOMS THAT HAVE A RULE. Every room it places
                            is a row in SIDE, because that is where they are
                            written; twenty unruled ones out here would bury the
                            few that say something, and the mark on the row above
                            already counts them. */}
                        {supporting &&
                          department.connections
                            .filter((c) => c.compiled.authored)
                            .map((connection) => (
                              <ConnectionBranch
                                key={connection.instance_id}
                                connection={connection}
                                onSelect={() => onSelect(department.id)}
                              />
                            ))}

                        {!supporting && (
                          <>
                            {department.questions.map((q) => (
                              <QuestionBranch
                                key={q.id}
                                node={q}
                                canEdit={canEdit}
                                selectedId={selectedId}
                                onSelect={onSelect}
                                onRemove={setPendingRemove}
                              />
                            ))}

                            {canEdit && (
                              <Branch endpoint="add" head={GAP + ADD_ENDPOINT / 2} padTop={GAP}>
                                <AddButton
                                  size={ADD_ENDPOINT}
                                  title={`Add a question to ${department.name}`}
                                  onClick={() =>
                                    addAnd(editor.addQuestion(department.sectionId, department.groupId, department.deptId))
                                  }
                                />
                              </Branch>
                            )}
                          </>
                        )}
                      </Branch>
                    )
                  })}
                </Branch>
              ))}
            </Branch>
          ))}
        </TreeLayer>
      </div>

      {pendingRemove && (
        <ConfirmModal
          title="Remove this question?"
          onConfirm={() => {
            editor.deleteQuestion(
              pendingRemove.sectionId,
              pendingRemove.groupId,
              pendingRemove.deptId,
              pendingRemove.id
            )
            setPendingRemove(null)
          }}
          onCancel={() => setPendingRemove(null)}
        >
          <strong>{pendingRemove.question.prompt || 'Untitled question'}</strong> goes, with its comment and the rooms
          it counts. The rooms stay in the catalog, and a supporting department driven by one of them keeps its rule.
        </ConfirmModal>
      )}
    </div>
  )
}
