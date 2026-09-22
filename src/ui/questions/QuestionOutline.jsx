// THE QUESTIONNAIRE DESIGNER, in main: the catalog with the questions hung off
// it.
//
// It is the SAME TREE the side panels draw — TreeLayer and Branch out of
// ui/panel/PanelTree.jsx — because it is the same information at a different
// level: what sits inside what. Two trees with two ideas of what an indent is
// are two trees, so nothing here restates a number.
//
// ONE DRAWING PER SECTION, not one over the whole outline: a section is a BOX in
// its own hue with its name as the title card, and its card is the root its
// groups hang from. See SectionCard.
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
import { functionColours } from '../../data/functions.js'
import { Band, BandRow } from '../primitives/Band.jsx'
import AddButton from '../primitives/AddButton.jsx'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import TabButton from '../primitives/TabButton.jsx'
import { PanelNote } from '../panel/panelParts.jsx'
import { removeHint } from '../primitives/RemoveButton.jsx'
import { Branch, BranchRoot, TreeLayer } from '../panel/PanelTree.jsx'
import { ADD_ENDPOINT } from '../canvas/canvasLayout.js'
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'
import { buildModel, connectionRuled, SUPPORTING } from './questionModel.js'
import { ROOM_GROUP } from '../../data/questionnaire.js'

// One row height for every level, so the tree's elbows land on a regular pitch
// and a section reads as the same kind of thing as a question, one step up.
const ROW = 26
const GAP = 4

// The type ladder, shallowest first. Nothing here is set in caps — the section
// title card is, and it is the only thing that should be: caps on a row inside
// the box would compete with the card naming it.
const LEVEL = {
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
//
// `warn` IS FOR A RULE NOBODY HAS WRITTEN and nothing else. It is the one thing
// on these rows that is not a reading but a job outstanding — a question whose
// rooms are still unruled builds nothing when the run reaches it — and quiet
// grey among the other marks is exactly how it went unnoticed. Everything else
// here stays grey, or a row of red says nothing.
function Marks({ text, warn = false }) {
  if (!text) return null
  return (
    <span
      style={{
        fontSize: 11,
        // The colour carries it alone. Bold as well made a mark louder than the
        // room name it sits beside, and the row reads name-first.
        color: warn ? '#b3261e' : '#999',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {text}
    </span>
  )
}

// The quiet half then the loud one, so the thing outstanding ends the row and
// sits nearest the edge every row is scanned down.
function MarkPair({ marks }) {
  if (!marks) return null
  return (
    <>
      <Marks text={marks.quiet} />
      <Marks text={marks.warn} warn />
    </>
  )
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
function Rule({ compiled, implied = false }) {
  if (!compiled.authored) {
    // A room with no rule of its own but sized objects inside it is not
    // outstanding — it is one room, by that default. See connectionValue.
    if (implied) return <span style={{ fontSize: 11, color: '#999', flexShrink: 0, fontStyle: 'italic' }}>1</span>
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

// What a question does, in one line. The rooms are NOT drawn under it — see
// QuestionBranch — so this is all the outline says about them, and it says what
// is missing: a question connecting to nothing, or rules never written.
// Split in two, because the two halves are drawn in different ink: what is
// MISSING, and what is merely true of the row.
function questionMarks(question, connections) {
  // Ruled, not "has its own rule": a room whose objects are sized and itself is
  // not counts as one, because it is — see connectionValue.
  const unruled = connections.filter((c) => !connectionRuled(c)).length
  return {
    warn:
      connections.length === 0
        ? 'no rooms yet'
        : unruled > 0
          ? `${unruled} without a rule`
          : null,
    quiet: question.comment ? 'commented' : null,
  }
}

// HOW MUCH OF IT IS WRITTEN, and nothing else.
//
// >>> THE VARIABLE NAMES WERE HERE AND ARE GONE — "a · consultation ·
// >>> diagnostics · cafeteria" on the department's own row. They are every
// >>> functioning department in the group, which the group above already lists,
// >>> so the row restated its own siblings and grew with each one; and a name is
// >>> only of use where a rule is typed, which is side.
function supportingMarks(department) {
  const ruled = department.connections.filter(connectionRuled).length
  const all = department.connections.length
  return {
    quiet: null,
    // Only while some room is still unruled. `12/12 sized` is a reading, not a
    // job, and red on a finished department is a false alarm.
    warn: all > 0 && ruled < all ? `${ruled}/${all} sized` : null,
  }
}

// A QUESTION IS A LEAF HERE. It draws nothing under it — not the rooms it
// connects to, not the objects in them.
//
// >>> THE ROOM/OBJECT TREE WAS HERE AND IS GONE. The outline is the catalog's
// >>> structure with the questions hung off it, read to find the thing you want
// >>> to author; the rules ARE the authoring, and they are in side, where each
// >>> has a box you can type in. Out here they were a second, read-only copy of
// >>> that column — the same names and the same formulas, with no way to change
// >>> either — and one department of ten questions buried every heading the
// >>> outline is scanned by. What is left of them is the mark on the row: how
// >>> many rooms are still without a rule.
function QuestionBranch({ node, canEdit, selectedId, onSelect, onRemove }) {
  return (
    <Branch
      endpoint="dot"
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
        right={<MarkPair marks={questionMarks(node.question, node.connections)} />}
      />
    </Branch>
  )
}

// ONE CONNECTION AND ITS RULE, under a SUPPORTING department — the one place the
// outline still names a room, because a supporting department has no questions
// and its rules are the only thing it has to show. A group lists the rooms it
// brings, since "3 Tesla" alone does not say which three; neither lists the
// objects inside them, for QuestionBranch's reason above.
function ConnectionBranch({ connection, onSelect }) {
  const group = connection.kind === ROOM_GROUP

  return (
    <Branch endpoint={group ? 'caret' : 'dot'} expanded={group} head={ROW / 2}>
      <Row
        level="connection"
        label={connection.name}
        muted={connection.missing}
        onSelect={onSelect}
        right={<Rule compiled={connection.compiled} implied={connectionRuled(connection)} />}
      />

      {group &&
        connection.rooms.map((room) => (
          <Branch key={room.instance_id} endpoint="dot" head={ROW / 2}>
            <Row level="room" label={room.label} onSelect={onSelect} />
          </Branch>
        ))}
    </Branch>
  )
}

// A SECTION IS A BOX IN ITS OWN HUE, with its name as the title card across the
// top and everything under it inside — the same picture the canvases draw, where
// a section is a container and not a row in a list. It was one more row on one
// long tree, at the same pitch as the questions six levels below it, and the
// only thing saying it was a section was the caps.
//
// The card is SOLID and the body a WASH of the same hue: a title has to carry
// its own ground, as everything function-coloured here does, and a body at full
// strength would leave the rows inside fighting it. The tree starts at the
// card's lower edge — BranchRoot's `head` — so no hairline is drawn across the
// solid colour.
const TITLE_H = 34

function SectionCard({ section, colours, selected, onSelect, mark = null, children }) {
  return (
    <TreeLayer>
      <div
        style={{
          marginBottom: 12,
          borderRadius: 8,
          border: `1px solid ${selected ? colours.border : colours.tint(0.35)}`,
          boxShadow: selected ? `0 0 0 2px ${colours.ring}` : undefined,
          background: colours.wash(0.93),
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <BranchRoot head={TITLE_H}>
          <div
            onClick={onSelect}
            title={section.name}
            style={{
              height: TITLE_H,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingInline: 12,
              cursor: 'pointer',
              background: colours.background,
              color: colours.color,
              minWidth: 0,
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}
            >
              {section.name}
            </span>
            {mark && <span style={{ flexShrink: 0, fontSize: 11, opacity: 0.8 }}>{mark}</span>}
          </div>

          <div style={{ padding: '2px 12px 10px', minWidth: 0 }}>{children}</div>
        </BranchRoot>
      </div>
    </TreeLayer>
  )
}

export default function QuestionOutline({ buildingId, onSelectBuilding, selectedId, onSelect, canEdit, onLeave }) {
  const { buildings, sections, groups, departments, rooms, objects, functions } = useCatalog()
  const editor = useQuestionnaireEditorContext()
  // What a right-click on a question's branch is asking to remove. The caller
  // ALWAYS prompts — see Branch's onRemove.
  const [pendingRemove, setPendingRemove] = useState(null)

  const model = buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects })

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

        {/* ONE BOX AND ONE TREE PER SECTION, rather than one tree over the lot:
            a section is a container here, as it is on both canvases. Its own
            card is the root the trunk hangs from. */}
        {model.map((section) => {
          const colours = functionColours(functions, section.functionId)

          // GENERAL IS A SECTION WITH NO GROUPS AND NO DEPARTMENTS — it asks
          // about the facility, so its questions hang off its own card. It is
          // drawn in the same box as every other section because it is read as
          // one; what differs is only how deep its questions sit.
          if (section.kind === 'general') {
            return (
              <SectionCard
                key={section.id}
                section={section}
                colours={colours}
                selected={selectedId === section.id}
                onSelect={() => onSelect(section.id)}
                mark="about the whole facility"
              >
                {/* NO + AND NO RIGHT-CLICK. The list is the app's — see GENERAL
                    in data/questionnaire.js — and the only thing authored about
                    one is how it is worded. */}
                {section.questions.map((q) => (
                  <Branch key={q.id} endpoint="dot" padTop={GAP} head={GAP + ROW / 2}>
                    <Row
                      level="question"
                      label={q.question.prompt || 'Untitled question'}
                      muted={!q.question.prompt}
                      selected={selectedId === q.id}
                      onSelect={() => onSelect(q.id)}
                      // THE VARIABLE IS THE MARK. Every rule in the building may
                      // name it, so it is the one thing about a general question
                      // worth reading from the outline.
                      right={<Marks text={q.variable} />}
                    />
                  </Branch>
                ))}
              </SectionCard>
            )
          }

          return (
            <SectionCard
              key={section.id}
              section={section}
              colours={colours}
              selected={selectedId === section.id}
              onSelect={() => onSelect(section.id)}
            >
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
                        endpoint={supporting && !department.connections.some(connectionRuled) ? 'dot' : 'caret'}
                        expanded={!supporting || department.connections.some(connectionRuled)}
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
                              {supporting ? (
                                <MarkPair marks={supportingMarks(department)} />
                              ) : (
                                // A department nobody has asked anything about
                                // yet is the same kind of outstanding job as a
                                // room with no rule, and reads in the same ink.
                                <Marks text={department.questions.length === 0 ? 'no questions yet' : null} warn />
                              )}
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
                            .filter(connectionRuled)
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
            </SectionCard>
          )
        })}
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
