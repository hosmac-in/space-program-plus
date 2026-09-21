// Side, on the Questions tab: whichever node the outline last selected.
//
// Four faces, one per level, and what each CAN be asked is the whole design:
//
//   section      nothing to author. It is the catalog's divider.
//   group        its one question — the gate — and THE PLACE THE TWO KINDS OF
//                DEPARTMENT ARE DEFINED: every department in the group, each
//                with one switch. Asked here rather than on each department
//                because the split is a statement about the group.
//   department   functioning: it holds the questions, which are added in the
//                outline. Supporting: its RULE — one driver times a coefficient.
//   question     the prompt, a comment, and WHAT IT CONNECTS TO — the catalog's
//                room groups and rooms in its own department, nothing wider.
//                Those ARE the follow-up: a yes opens them and each takes a
//                counter, so a question asks no number of its own.
//
// Every field writes when you leave it, not on every keystroke: each write is a
// whole-document write of a jsonb column (see data/questionnaire.js), and a
// write per character would be a write per character.

import { useEffect, useState } from 'react'
import {
  connectionsWithFormula,
  newConnection,
  newNumber,
  newVariable,
  questionWithConnection,
  questionWithFormula,
  questionWithoutConnection,
  slugVariable,
  uniqueVariableName,
  ROOM,
  ROOM_GROUP,
} from '../../data/questionnaire.js'
import { compileFormula, FORMULA_FUNCTIONS } from '../../data/formula.js'
import { SearchAddPicker } from '../primitives/SearchAddPicker.jsx'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import { removeHint } from '../primitives/RemoveButton.jsx'
import Toggle from '../primitives/Toggle.jsx'
import { CountField, PanelNote } from '../panel/panelParts.jsx'
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'
import { buildModel, locate, FUNCTIONING, SUPPORTING } from './questionModel.js'
import { useCatalog } from '../../data/catalog.jsx'

function Caption({ children }) {
  return (
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888' }}>{children}</div>
  )
}

function Where({ children }) {
  return <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, overflowWrap: 'anywhere' }}>{children}</div>
}

// A text field that reports when you leave it, seeded from the stored value and
// re-seeded whenever that changes underneath — a reload, or an edit made in
// another window.
function Field({ label, value, placeholder, canEdit, multiline = false, onCommit }) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])

  if (!canEdit) {
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: '#777', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value || '—'}</div>
      </div>
    )
  }

  const common = {
    value: draft,
    placeholder,
    onChange: (e) => setDraft(e.target.value),
    onBlur: () => draft !== (value ?? '') && onCommit(draft),
    style: { width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 13, fontFamily: 'inherit' },
  }

  return (
    <label style={{ display: 'block', marginTop: 10 }}>
      <span style={{ display: 'block', fontSize: 11, color: '#777', marginBottom: 2 }}>{label}</span>
      {multiline ? (
        <textarea rows={3} {...common} style={{ ...common.style, resize: 'vertical' }} />
      ) : (
        <input
          type="text"
          {...common}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setDraft(value ?? '')
          }}
        />
      )}
    </label>
  )
}

// A switch with its question beside it — the one place on these panels where a
// Toggle carries a label, because this is a form of questions rather than a
// column of values.
function SwitchRow({ label, detail, checked, disabled, onChange }) {
  return (
    <div className="spp-row" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBlock: 6, minWidth: 0 }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
        {label}
        {detail && <span style={{ display: 'block', fontSize: 11, color: '#999' }}>{detail}</span>}
      </span>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} title={label} />
    </div>
  )
}

// --- Faces -------------------------------------------------------------------

function GroupFace({ group, canEdit, editor }) {
  const gate = group.gate
  const setGate = (next) => editor.setGroupGate(group.sectionId, group.groupId, next)
  // A gate written for the first time is seeded from the group's own name, so
  // the common case — "Diagnostics?" — is one keystroke rather than a blank.
  const edit = (patch) => setGate({ ...(gate ?? { prompt: group.name, number: null, comment: '' }), ...patch })

  return (
    <div style={{ minWidth: 0 }}>
      <Caption>Department group</Caption>
      <Where>{group.name}</Where>

      <Field
        label="Asked as"
        value={gate?.prompt ?? ''}
        placeholder={`${group.name}?`}
        canEdit={canEdit}
        onCommit={(prompt) => edit({ prompt })}
      />
      <PanelNote>
        The group's one question. Yes opens the departments under it and adds nothing itself — the departments are what
        carry the program.
      </PanelNote>

      <SwitchRow
        label="Asks a number"
        detail="A headline figure for the brief. A gate sizes nothing of its own."
        checked={!!gate?.number}
        disabled={!canEdit}
        onChange={(on) => edit({ number: on ? newNumber('How many in total?') : null })}
      />
      {gate?.number && (
        <Field
          label="Number asked as"
          value={gate.number.label}
          placeholder="How many in total?"
          canEdit={canEdit}
          onCommit={(label) => edit({ number: { ...gate.number, label } })}
        />
      )}

      <Field
        label="Comment"
        value={gate?.comment ?? ''}
        placeholder="Anything the person answering should know"
        canEdit={canEdit}
        multiline
        onCommit={(comment) => edit({ comment })}
      />

      {/* THE PLACE THE TWO KINDS ARE DEFINED. Absence means functioning, so the
          switch writes only the departure — see data/questionnaire.js. */}
      <div style={{ marginTop: 18, borderTop: '1px solid #eee', paddingTop: 10 }}>
        <Caption>Supporting departments</Caption>
        <PanelNote>
          A functioning department is programmed by asking about it. A supporting one carries no questions and is sized
          by a rule instead.
        </PanelNote>
        {group.departments.length === 0 ? (
          <PanelNote>This group has no departments in the catalog yet.</PanelNote>
        ) : (
          group.departments.map((d) => (
            <SwitchRow
              key={d.id}
              label={d.name}
              checked={d.role === SUPPORTING}
              disabled={!canEdit}
              onChange={(on) =>
                editor.setRole(d.sectionId, d.groupId, d.deptId, on ? SUPPORTING : FUNCTIONING)
              }
            />
          ))
        )}
      </div>
    </div>
  )
}

function DepartmentFace({ department, group, canEdit, editor }) {
  const supporting = department.role === SUPPORTING

  if (!supporting) {
    return (
      <div style={{ minWidth: 0 }}>
        <Caption>Functioning department</Caption>
        <Where>
          {group.name} → {department.name}
        </Where>
        <PanelNote>
          {department.questions.length === 0
            ? 'No questions yet. Add one on the branch under this department.'
            : `${department.questions.length} question${department.questions.length === 1 ? '' : 's'}. Pick one on the left to edit it.`}
        </PanelNote>
        <PanelNote>Make it a supporting department on the group above, if it is sized by a rule instead.</PanelNote>
      </div>
    )
  }

  return <SupportingFace department={department} group={group} canEdit={canEdit} editor={editor} />
}

// A SUPPORTING DEPARTMENT: the departments it scales off, and a rule per room
// over their areas. It is the same shape as a question — names, then rules —
// with an area where a counted number would be.
function SupportingFace({ department, group, canEdit, editor }) {
  // The sample, not stored. m², because that is what a variable always holds.
  const [tryArea, setTryArea] = useState(1000)

  const variables = department.variables
  const connections = department.connections
  const names = variables.map((v) => v.name)
  const groupVar = variables.find((v) => v.kind === 'group') ?? null
  const departmentVars = variables.filter((v) => v.kind !== 'group')

  const where = { s: department.sectionId, g: department.groupId, d: department.deptId }
  const writeConnections = (next) => editor.setSupportingConnections(where.s, where.g, where.d, next)

  // THE ONLY THING AUTHORED ABOUT A VARIABLE IS ITS NAME — the list is the
  // group's, so the document stores an override per department and nothing else.
  const renameVariable = (variable, raw) => {
    const name = uniqueVariableName(
      slugVariable(raw),
      names.filter((n) => n !== variable.name)
    )
    if (name === variable.name) return
    // Only the departments are ever written — `area` is derived and belongs to
    // nobody's document.
    const rest = departmentVars
      .filter((v) => v.instance_id !== variable.instance_id)
      .map((v) => newVariable(v.name, v.instance_id, v.liveName ?? v.label))
    editor.setVariables(where.s, where.g, where.d, [
      ...rest,
      newVariable(name, variable.instance_id, variable.liveName ?? variable.label),
    ])
  }

  // The sample: every department at the same area, so `area` is that times how
  // many there are — the same arithmetic the run does, or the preview would
  // answer a different question from the thing it is previewing.
  const scope = {
    ...Object.fromEntries(departmentVars.map((v) => [v.name, tryArea])),
    ...(groupVar ? { [groupVar.name]: tryArea * departmentVars.length } : {}),
  }

  // EVERY ROOM IS ALREADY HERE — there is no picker, because a supporting
  // department sizes all of what it places and choosing which would be choosing
  // which rooms it has. Writing a rule is the whole edit; clearing one takes the
  // entry back out of the document.
  const writeFormula = (connection, formula) =>
    writeConnections(connectionsWithFormula(connections.map(stripped), connection, formula))

  return (
    <div style={{ minWidth: 0 }}>
      <Caption>Supporting department</Caption>
      <Where>
        {group.name} → {department.name}
      </Where>

      <PanelNote>
        Sized by how big other departments turned out, not by a question. Name them below, then give each of this
        department's rooms a rule over those areas.
      </PanelNote>

      <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 10 }}>
        <Caption>Scales off</Caption>
        <PanelNote>
          Every functioning department in {group.name}, automatically — each its <strong>net room area in m²</strong>,
          the rooms as counted, no grossing factors, and always m² whatever unit you are reading the app in.
        </PanelNote>

        {departmentVars.length === 0 && (
          <PanelNote>This group has no functioning departments yet, so there is nothing to scale off.</PanelNote>
        )}

        {/* THE TOTAL FIRST, and set apart: it is what most rules are written
            against, and the names under it are the same figure broken up for
            the rule that has to weight them. */}
        {groupVar && (
          <div
            className="spp-row"
            style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBlock: 6, minWidth: 0 }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>All of {group.name}</span>
              <span style={{ display: 'block', fontSize: 11, color: '#999' }}>
                {departmentVars.length === 0
                  ? 'Nothing in it yet, so this is 0'
                  : `${departmentVars.length} department${departmentVars.length === 1 ? '' : 's'}, summed`}
              </span>
            </span>
            <code style={{ fontSize: 12, color: '#555', flexShrink: 0 }}>{groupVar.name}</code>
          </div>
        )}

        {departmentVars.map((variable) => (
          <div
            key={variable.instance_id}
            className="spp-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingBlock: 4,
              minWidth: 0,
              // Stepped in: these are what the total above is made of.
              paddingLeft: 10,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: variable.missing ? '#b3261e' : '#222',
                }}
              >
                {variable.liveName || 'Unnamed department'}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: variable.orphaned ? '#8a6d1f' : '#999' }}>
                {variable.missing
                  ? 'No longer in this building — rules using it read as unresolved'
                  : variable.unsupported
                    ? 'Supporting, so its area is not known here — this reads 0'
                    : variable.orphaned
                      ? `No longer in ${group.name} — kept because a rule may still name it`
                      : variable.path}
              </span>
            </span>
            {canEdit ? (
              <NameField value={variable.name} onCommit={(raw) => renameVariable(variable, raw)} />
            ) : (
              <code style={{ fontSize: 12, color: '#555' }}>{variable.name}</code>
            )}
          </div>
        ))}

      </div>

      <div style={{ marginTop: 18, borderTop: '1px solid #eee', paddingTop: 10 }}>
        <Caption>Its rooms, one rule each</Caption>
        {connections.length === 0 && (
          <PanelNote>This department places no rooms in the catalog yet — add them on the Tree tab.</PanelNote>
        )}

        {connections.length > 0 && (
          <TryBar
            label="Try every area ="
            value={tryArea}
            onChange={setTryArea}
            suffix="m² each"
            vars={names}
            subject="each the net room area of that department, in m²"
          />
        )}

        {connections.map((connection) => (
          <ConnectionBlock
            key={connection.instance_id}
            connection={connection}
            canEdit={canEdit}
            allowedVars={names}
            scope={scope}
            onFormula={(formula) => writeFormula(connection, formula)}
          />
        ))}
      </div>

    </div>
  )
}

// The model hangs `compiled`, `name`, `rooms` and `missing` off a connection for
// drawing; only the stored keys may go back into the document.
function stripped(connection) {
  return {
    kind: connection.kind,
    instance_id: connection.instance_id,
    label: connection.label ?? '',
    formula: connection.formula ?? '',
  }
}

// A variable's name, in the language's own type so it reads as what it is.
function NameField({ value, onCommit }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      type="text"
      value={draft}
      title="The name this department goes by in a rule"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(value)
      }}
      style={{
        flexShrink: 0,
        width: 110,
        padding: '3px 6px',
        borderRadius: 4,
        border: '1px solid #ddd',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
      }}
    />
  )
}

// THE RULE ITSELF. Monospace, because it is read character by character rather
// than as a phrase, and committed on blur like every field here — a write per
// keystroke would be a write of the whole jsonb column per keystroke.
//
// AN INVALID RULE IS STORED ANYWAY. A half-typed rule is work, and refusing it
// at the field throws it away the moment focus moves; it is drawn as broken
// instead, which is the honest reading and a recoverable one.
function FormulaField({ value, allowedVars, canEdit, onCommit }) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])

  // Parsed as typed, so the message answers the keystroke that caused it.
  const compiled = compileFormula(draft, allowedVars)
  const broken = compiled.authored && !compiled.ok

  const common = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 12,
  }

  if (!canEdit) {
    return (
      <span style={{ ...common, color: compiled.authored ? '#444' : '#bbb' }}>
        {compiled.authored ? value : 'no rule yet'}
      </span>
    )
  }

  return (
    <input
      type="text"
      value={draft}
      placeholder="no rule yet"
      title={broken ? compiled.message : 'How many of this one answer buys'}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== (value ?? '') && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(value ?? '')
      }}
      style={{
        ...common,
        width: '100%',
        boxSizing: 'border-box',
        padding: '4px 6px',
        borderRadius: 4,
        border: `1px solid ${broken ? '#e6a9a2' : '#ddd'}`,
        background: broken ? '#fdf6f5' : '#fff',
        color: '#222',
      }}
    />
  )
}

// What a rule works out to at the sample number, or why it does not. The four
// states are told apart here and nowhere else in this panel.
function Result({ compiled, scope }) {
  const { value, state, message } = compiled.evaluate(scope)

  if (state === 'unauthored') return <Muted>—</Muted>
  if (state !== 'ok') {
    return (
      <span title={message} style={{ flexShrink: 0, fontSize: 11, color: '#b3261e', fontWeight: 600 }}>
        !
      </span>
    )
  }
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        color: value > 0 ? '#222' : '#bbb',
        minWidth: 26,
        textAlign: 'right',
      }}
    >
      {value}
    </span>
  )
}

function Muted({ children }) {
  return <span style={{ flexShrink: 0, fontSize: 12, color: '#ccc', minWidth: 26, textAlign: 'right' }}>{children}</span>
}

// ONE CONNECTION: a catalog room group or a single room, its rule, and what that
// rule works out to at the sample number.
//
// A GROUP LISTS ITS ROOMS, read live off the tree — the membership is the Tree
// tab's to state and nothing here can change it, so the list is a reading rather
// than a control. A single room says its name once and draws nothing under it.
function ConnectionBlock({ connection, canEdit, allowedVars, scope, onFormula, onRemove }) {
  const group = connection.kind === ROOM_GROUP
  const compiled = connection.compiled
  // A supporting department's rows are the catalog's and cannot be taken away —
  // clearing the rule is the whole of it — so there is no remove gesture there.
  const removable = canEdit && !!onRemove

  return (
    <div style={{ marginTop: 10, borderLeft: '2px solid #eee', paddingLeft: 8, minWidth: 0 }}>
      <div
        className="spp-row"
        title={removable ? removeHint(group ? 'this group' : 'this room') : undefined}
        onContextMenu={
          removable
            ? (e) => {
                e.preventDefault()
                onRemove()
              }
            : undefined
        }
        style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBlock: 2, minWidth: 0 }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
            fontWeight: group ? 600 : 400,
            color: connection.missing ? '#b3261e' : '#222',
          }}
        >
          {connection.name}
          {connection.missing && <span style={{ fontSize: 11 }}> — no longer in this department</span>}
        </span>
        <Result compiled={compiled} scope={scope} />
      </div>

      <div style={{ marginTop: 2 }}>
        <FormulaField value={connection.formula ?? ''} allowedVars={allowedVars} canEdit={canEdit} onCommit={onFormula} />
      </div>
      {compiled.authored && !compiled.ok && (
        <div style={{ fontSize: 11, color: '#b3261e', marginTop: 2 }}>{compiled.message}</div>
      )}

      {group &&
        connection.rooms.map((room) => (
          <div
            key={room.instance_id}
            style={{
              fontSize: 12,
              color: '#666',
              paddingBlock: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {room.label}
          </div>
        ))}
    </div>
  )
}

// THE PREVIEW'S OWN NUMBER, which is not stored anywhere. A typed rule without
// something to read it back against is unusable — this is the part that makes a
// formula authorable at all. The `i` beside it is where the language is written
// down: shut by default, because it is read once and then never again, and a
// permanent paragraph above every rule is a paragraph nobody reads at all.
function TryBar({ label, value, onChange, suffix, vars, subject }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        {/* At the HEAD of the row, where every control on these panels lives —
            the × and the + are there too. The figures stay on the right. */}
        <button
          type="button"
          aria-expanded={open}
          title={open ? 'Hide how rules are written' : 'How rules are written'}
          onClick={() => setOpen((o) => !o)}
          style={{
            flexShrink: 0,
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: `1px solid ${open ? '#1a73e8' : '#ccc'}`,
            background: open ? '#1a73e8' : '#fff',
            color: open ? '#fff' : '#888',
            fontSize: 11,
            fontStyle: 'italic',
            fontWeight: 700,
            fontFamily: 'Georgia, serif',
            lineHeight: 1,
            padding: 0,
            cursor: 'pointer',
          }}
        >
          i
        </button>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#777' }}>{label}</span>
        {/* The unit goes BEFORE the figure so the figure ends on the panel's own
            right edge, in the column every result below it is read down. */}
        {suffix && <span style={{ flexShrink: 0, fontSize: 11, color: '#999' }}>{suffix}</span>}
        <CountField value={value} min={0} step={1} prefix="" width={90} onChange={onChange} />
      </div>
      {open && <FormulaHelp vars={vars} subject={subject} />}
    </>
  )
}

function Code({ children }) {
  return (
    <code
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 3,
        padding: '0 3px',
      }}
    >
      {children}
    </code>
  )
}

function HelpLine({ children }) {
  return <div style={{ marginTop: 6, lineHeight: 1.6 }}>{children}</div>
}

// THE LANGUAGE, written where it is used. It is short enough to state in full,
// so it is stated in full rather than linked to — there is nowhere to link to.
function FormulaHelp({ vars, subject }) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: '10px 12px',
        borderRadius: 6,
        background: '#f7f8fa',
        border: '1px solid #e8e8ea',
        fontSize: 12,
        color: '#555',
        minWidth: 0,
      }}
    >
      <HelpLine>
        A rule is arithmetic over {vars.length === 0 ? <em>nothing yet</em> : vars.map((v, i) => (
          <span key={v}>
            {i > 0 && ', '}
            <Code>{v}</Code>
          </span>
        ))}
        {subject && <> — {subject}</>}.
      </HelpLine>

      <HelpLine>
        <Code>+</Code> <Code>-</Code> <Code>*</Code> <Code>/</Code> and brackets, in the usual order: <Code>*</Code> and{' '}
        <Code>/</Code> before <Code>+</Code> and <Code>-</Code>.
      </HelpLine>

      <HelpLine>
        {FORMULA_FUNCTIONS.map((f, i) => (
          <span key={f}>
            {i > 0 && ' '}
            <Code>{f}(…)</Code>
          </span>
        ))}
        {' — '}
        <Code>min</Code> and <Code>max</Code> take any number of terms, <Code>clamp(v, low, high)</Code> takes three.
      </HelpLine>

      <HelpLine>
        <strong>The answer is a whole number of rooms.</strong> It is never negative, and a fraction rounds — so{' '}
        <Code>{vars[0] ?? 'x'}/3</Code> at 10 is 3. Write <Code>ceil(…)</Code> when it must always go up.
      </HelpLine>

      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e8e8ea' }}>
        <Example rule={`ceil(${vars[0] ?? 'x'}/4)`}>one per four, rounded up</Example>
        <Example rule="2">always two, whatever the answer</Example>
        <Example rule={`max(1, ceil(${vars[0] ?? 'x'}/20))`}>one per twenty, but never none</Example>
        <Example rule={`clamp(ceil(${vars[0] ?? 'x'}/10), 1, 4)`}>one per ten, between one and four</Example>
      </div>

      <HelpLine>
        <span style={{ color: '#888' }}>Leave it empty and nothing is sized — an empty rule is not a zero.</span>
      </HelpLine>
    </div>
  )
}

function Example({ rule, children }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 4, minWidth: 0 }}>
      <Code>{rule}</Code>
      <span style={{ flex: 1, minWidth: 0, color: '#888' }}>{children}</span>
    </div>
  )
}

function QuestionFace({ node, department, group, canEdit, editor }) {
  const question = node.question
  const edit = (updater) => editor.setQuestion(node.sectionId, node.groupId, node.deptId, node.id, updater)
  // Right-click disconnects, and it always prompts. Same gesture as the tree's
  // branches — there is no × on a row anywhere in this app.
  const [pendingRemove, setPendingRemove] = useState(null)

  const connections = node.connections
  // Not stored: a sample to read the rules back at. 10 rather than 1, because a
  // ratio at 1 tells you almost nothing about whether you wrote it right.
  const [tryX, setTryX] = useState(10)

  const usedBy = (roomInstanceId) => {
    const used = department.usage.get(roomInstanceId)
    if (!used) return null
    return `Used by “${used.prompt}”${used.via ? ` → ${used.via}` : ''}`
  }

  // THE CATALOG'S GROUPS FIRST, THEN THE ROOMS — one list, because a question
  // names one thing and which kind it is is the catalog's business, not a choice
  // to make before searching. Anything already spoken for is drawn greyed with
  // the question that took it: filtering it out left you unable to tell a used
  // room from one that was never in the catalog.
  const targetOptions = () => [
    ...department.catalogGroups.map((g) => {
      const clash = g.rooms.map((r) => usedBy(r.instance_id)).find(Boolean)
      return {
        id: g.instance_id,
        name: g.name,
        path: `${g.rooms.length} room${g.rooms.length === 1 ? '' : 's'} — ${g.rooms.map((r) => r.label).join(' · ')}`,
        disabled: !!clash,
        reason: clash ?? undefined,
      }
    }),
    ...department.catalogRooms.map((r) => {
      const reason = usedBy(r.instance_id)
      return { id: r.instance_id, name: r.label, disabled: !!reason, reason: reason ?? undefined }
    }),
  ]

  const kindOf = (id) => (department.catalogGroups.some((g) => g.instance_id === id) ? ROOM_GROUP : ROOM)

  return (
    <div style={{ minWidth: 0 }}>
      <Caption>Question</Caption>
      <Where>
        {group.name} → {department.name}
      </Where>

      <Field
        label="Asked as"
        value={question.prompt}
        placeholder="How many beds?"
        canEdit={canEdit}
        onCommit={(prompt) => edit((q) => ({ ...q, prompt }))}
      />
      <Field
        label="Counted in"
        value={node.unit}
        placeholder="beds"
        canEdit={canEdit}
        onCommit={(unit) => edit((q) => ({ ...q, unit }))}
      />
      <PanelNote>
        Answered with one number. Every room below is a rule over it — <code>x</code> is what this question asks.
      </PanelNote>

      <Field
        label="Comment"
        value={question.comment ?? ''}
        placeholder="Anything the person answering should know"
        canEdit={canEdit}
        multiline
        onCommit={(comment) => edit((q) => ({ ...q, comment }))}
      />

      {/* WHAT IT CONNECTS TO — this department's room groups and rooms, from the
          catalog, and nothing wider. One counter per connection, so a 3 Tesla
          MRI is one number over the three rooms its group holds. */}
      <div style={{ marginTop: 18, borderTop: '1px solid #eee', paddingTop: 10 }}>
        <Caption>Connects to, one rule each</Caption>
        {connections.length === 0 && (
          <PanelNote>Nothing yet. Add a room group or a single room from this department.</PanelNote>
        )}

        {connections.length > 0 && (
          <TryBar
            label="Try x ="
            value={tryX}
            onChange={setTryX}
            suffix={node.unit || null}
            vars={['x']}
            subject={`what this question asks${node.unit ? `, in ${node.unit}` : ''}`}
          />
        )}

        {connections.map((connection) => (
          <ConnectionBlock
            key={connection.instance_id}
            connection={connection}
            canEdit={canEdit}
            allowedVars={['x']}
            scope={{ x: tryX }}
            onFormula={(formula) => edit((q) => questionWithFormula(q, connection.instance_id, formula))}
            onRemove={() => setPendingRemove(connection)}
          />
        ))}

        {canEdit && (
          <div style={{ marginTop: 6 }}>
            {department.catalogRooms.length === 0 ? (
              <PanelNote>This department places no rooms in the catalog yet — add them on the Tree tab.</PanelNote>
            ) : (
              <>
                <SearchAddPicker
                  options={targetOptions()}
                  placeholder="Search this department's groups and rooms..."
                  title="Connect a room group or a room"
                  label="Connect a room group or a room"
                  onAdd={(o) => edit((q) => questionWithConnection(q, newConnection(kindOf(o.id), o.id, o.name)))}
                />
                <PanelNote>
                  Room groups are the catalog's, authored on the Tree tab. Group the rooms there and they are one answer
                  here.
                </PanelNote>
              </>
            )}
          </div>
        )}
      </div>

      {pendingRemove && (
        <ConfirmModal
          title="Disconnect this?"
          confirmLabel="Yes, disconnect"
          onConfirm={() => {
            edit((q) => questionWithoutConnection(q, pendingRemove.instance_id))
            setPendingRemove(null)
          }}
          onCancel={() => setPendingRemove(null)}
        >
          <strong>{pendingRemove.name}</strong> stops being counted by this question and is free for another. It stays
          in the catalog.
        </ConfirmModal>
      )}
    </div>
  )
}

// --- The panel ----------------------------------------------------------------

export default function QuestionDetail({ buildingId, selectedId, canEdit }) {
  const editor = useQuestionnaireEditorContext()
  // Both hooks before any early return: a hook called conditionally changes the
  // order between renders, which is the one thing React cannot survive.
  const { sections, groups, departments, rooms } = useCatalog()

  if (!editor.ready) {
    return (
      <PanelNote pad>
        No questionnaire for this building yet. Run <code>sql/questionnaire_setup.sql</code>.
      </PanelNote>
    )
  }

  const model = buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms })
  const found = locate(model, selectedId)

  if (!found) return <PanelNote pad>Pick a section, a group, a department or a question on the left.</PanelNote>

  const { node, section, group, department } = found

  if (node.kind === 'section') {
    return (
      <div style={{ minWidth: 0 }}>
        <Caption>Section</Caption>
        <Where>{section.name}</Where>
        <PanelNote>
          A divider, straight from the catalog. Nothing is asked about a section — the questions hang off the groups
          under it.
        </PanelNote>
      </div>
    )
  }

  if (node.kind === 'group') return <GroupFace group={group} canEdit={canEdit} editor={editor} />

  if (node.kind === 'department') {
    return (
      <DepartmentFace department={department} group={group} canEdit={canEdit} editor={editor} />
    )
  }

  return (
    <QuestionFace
      node={node}
      department={department}
      group={group}
      canEdit={canEdit}
      editor={editor}
    />
  )
}
