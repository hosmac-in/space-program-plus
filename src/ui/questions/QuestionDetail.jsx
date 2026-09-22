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

import { useEffect, useRef, useState } from 'react'
import {
  connectionsWithFormula,
  connectionsWithObjectFormula,
  connectionHasObjectRules,
  connectionObjects,
  newConnection,
  questionWithObjectFormula,
  questionWithConnection,
  questionWithFormula,
  questionWithoutConnection,
  ROOM,
  ROOM_GROUP,
} from '../../data/questionnaire.js'
import { compileFormula, FORMULA_FUNCTIONS } from '../../data/formula.js'
import { SearchAddPicker } from '../primitives/SearchAddPicker.jsx'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import { removeHint } from '../primitives/RemoveButton.jsx'
import Toggle from '../primitives/Toggle.jsx'
import { CountField, PanelNote } from '../panel/panelParts.jsx'
import {
  Branch,
  BranchRoot,
  TreeLayer,
  useRootAnchor,
  BRANCH_CONTENT,
  BRANCH_ORIGIN_CONTENT,
} from '../panel/PanelTree.jsx'
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'
import { buildModel, connectionValue, locate, FUNCTIONING, SUPPORTING } from './questionModel.js'
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

// A GROUP'S PANEL IS THE ROLE SWITCHES AND NOTHING ELSE.
//
// >>> THE GATE'S FIELDS WERE HERE AND ARE GONE — its wording, its comment, and
// >>> the number it could go on to ask. The wording is the group's own name in
// >>> all but a handful of cases, which the run already falls back to; the
// >>> number was authored, answered and read by nobody (see the closing note in
// >>> data/questionnaire.js); and the comment was a second place to explain a
// >>> question that is one word long. All three keys are LEFT IN THE DOCUMENT,
// >>> unread, never deleted — the precedent `driver` and the old root-level
// >>> `groups` array set — so a gate already written still asks what it said.
//
// What is left is the one thing that cannot be said anywhere else: which of this
// group's departments are supporting. It is a fact about a department's place in
// its group, and the group is where you see them together.
function GroupFace({ group, canEdit, editor }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Caption>Department group</Caption>
      <Where>{group.name}</Where>

      {/* THE PLACE THE TWO KINDS ARE DEFINED. Absence means functioning, so the
          switch writes only the departure — see data/questionnaire.js. */}
      <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 10 }}>
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

function DepartmentFace({ department, group, canEdit, editor, general }) {
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

  return <SupportingFace department={department} group={group} canEdit={canEdit} editor={editor} general={general} />
}

// ONE NAME A RULE MAY USE: what it is, and what it is called in the language.
//
// THE NAME IS CALLED, THE VARIABLE SITS NEXT TO IT. A fixed name column and the
// identifier straight after it, so the pair reads as one phrase — "Consultation
// is `consultation`" — and the identifiers still line up as a column to scan
// down. Pushed to the panel's right edge they were a column of their own, a
// hand's width from the names they belong to, with nothing in between.
//
// EVERY ROW IS THE SAME ROW, including the group's total: it is one of the names
// a rule may use, and drawing it bold, unindented and with a summary under it
// made it a heading over the list rather than the first member of it.
const VAR_NAME = 150
const VAR_BOX = 130

function VariableRow({ name, variable, detail, detailColour = '#999', colour = '#222' }) {
  return (
    <div
      className="spp-row"
      style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingBlock: 4, minWidth: 0 }}
    >
      <span style={{ flexShrink: 0, width: VAR_NAME, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: colour,
          }}
        >
          {name}
        </span>
        {/* Kept for the one thing you cannot work out: why a name cannot be
            read. Everything else that was here has gone. */}
        {detail && <span style={{ display: 'block', fontSize: 11, color: detailColour }}>{detail}</span>}
      </span>
      {/* A BOX, BUT NOT A FIELD. It is the same shape as the expression boxes
          beside it, because it is the same kind of thing — a piece of the
          language — but it is GREY and it is not an input: the name is the
          department's own, slugged, and there is nothing to type. A white box
          here would read as editable, and a disabled input reads as editable and
          broken. */}
      <code
        style={{
          flexShrink: 0,
          width: VAR_BOX,
          boxSizing: 'border-box',
          padding: '3px 6px',
          borderRadius: 4,
          border: '1px solid #e6e6e6',
          background: '#f4f4f5',
          fontSize: 12,
          color: '#555',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {variable}
      </code>
      <span style={{ flex: 1, minWidth: 0 }} />
    </div>
  )
}

// A SUPPORTING DEPARTMENT: the departments it scales off, and a rule per room
// over their areas. It is the same shape as a question — names, then rules —
// with an area where a counted number would be.
function SupportingFace({ department, group, canEdit, editor, general }) {
  // The sample, not stored. m², because that is what a variable always holds.
  const [tryArea, setTryArea] = useState(1000)

  const variables = department.variables
  const connections = department.connections
  // The group's areas AND the facility's own answers — a supporting department's
  // rule may read either, and this field has to compile what the model compiled
  // or it calls a working rule broken as you type it.
  const names = [...variables.map((v) => v.name), ...general.map((g) => g.name)]
  const groupVar = variables.find((v) => v.kind === 'group') ?? null
  const departmentVars = variables.filter((v) => v.kind !== 'group')

  const where = { s: department.sectionId, g: department.groupId, d: department.deptId }
  const writeConnections = (next) => editor.setSupportingConnections(where.s, where.g, where.d, next)

  // >>> A VARIABLE'S NAME IS NOT AUTHORED ANY MORE. It is the department's own
  // >>> name, slugged, and the group's total is `a` — both fixed, neither
  // >>> editable. Renaming them was one more thing to do before a single rule
  // >>> could be written, and the name a rule wants is the name of the thing it
  // >>> is about. A document that already holds an override is still read with
  // >>> it (questionModel.js), so no rule written against an old name breaks;
  // >>> nothing writes a new one.

  // THE SAMPLE IS `a` ITSELF — the whole group — and each department gets an
  // even share of it. The row says "Try a =", so that is what the number has to
  // be: it used to be each department's own area, with `a` coming out as that
  // times however many there were, and a box labelled `a` showing 1,000 while
  // every rule over `a` computed on 3,000 is a preview that lies.
  const scope = {
    // The facility's answers preview at 1 — see generalPreview.
    ...generalPreview(general),
    ...Object.fromEntries(
      departmentVars.map((v) => [v.name, departmentVars.length === 0 ? 0 : tryArea / departmentVars.length])
    ),
    ...(groupVar ? { [groupVar.name]: tryArea } : {}),
  }

  // EVERY ROOM IS ALREADY HERE — there is no picker, because a supporting
  // department sizes all of what it places and choosing which would be choosing
  // which rooms it has. Writing a rule is the whole edit; clearing one takes the
  // entry back out of the document.
  const writeFormula = (connection, formula) =>
    writeConnections(connectionsWithFormula(connections.map(stripped), connection, formula))

  const writeObjectFormula = (connection, objectId, formula) =>
    writeConnections(connectionsWithObjectFormula(connections.map(stripped), connection, objectId, formula))

  return (
    <div style={{ minWidth: 0 }}>
      {/* >>> NOTHING ABOVE THE FIRST VARIABLE. A caption, the path, and two
          paragraphs explaining what a supporting department is stood between
          opening this panel and reading the one thing on it — the names a rule
          can use. They said what the RoleChip in the outline already says, and
          they said it every time. The rows below carry their own detail line,
          which is where an explanation belongs: on the thing it explains. */}
      <div style={{ minWidth: 0 }}>
        {/* THE TOTAL FIRST — it is what most rules are written against, and the
            names under it are the same figure broken up for the rule that has to
            weight them. Its name is in the SAME COLUMN as theirs: it is one of
            the names a rule may use, and putting it alone at the top right read
            as a heading over the list rather than as a member of it. */}
        {groupVar && (
          <VariableRow
            name={`All of ${group.name}`}
            variable={groupVar.name}
            // The only thing left on this row, and only when it means something:
            // an empty group really does read 0.
            detail={departmentVars.length === 0 ? 'Nothing in it yet, so this is 0' : null}
          />
        )}

        {departmentVars.map((variable) => (
          <VariableRow
            key={variable.instance_id}
            name={variable.liveName || 'Unnamed department'}
            variable={variable.name}
            colour={variable.missing ? '#b3261e' : '#222'}
            // >>> THE PATH IS GONE — "Ambulatory Care → OPD" under every row,
            // >>> the same two words repeated down the list, since a group's
            // >>> functioning departments are nearly always in one section. What
            // >>> is left is only the detail you cannot work out: why a name
            // >>> cannot be read.
            detail={
              variable.missing
                ? 'No longer in this building — rules using it read as unresolved'
                : variable.unsupported
                  ? 'Supporting, so its area is not known here — this reads 0'
                  : variable.orphaned
                    ? `No longer in ${group.name} — kept because a rule may still name it`
                    : null
            }
            detailColour={variable.orphaned ? '#8a6d1f' : '#999'}
          />
        ))}
      </div>

      <div style={{ marginTop: 18, borderTop: '1px solid #eee', paddingTop: 10 }}>
        {/* ONE DRAWING over the whole list — the same tree the side panels and
            the Questions outline draw, because it is the same information: what
            sits inside what. Objects flow from rooms. */}
        <RuleTree>
          {connections.length === 0 && (
            <PanelNote>This department places no rooms in the catalog yet — add them on the Tree tab.</PanelNote>
          )}

          {connections.length > 0 && (
            <TryBar
              label={`Try ${groupVar?.name ?? 'a'} =`}
              value={tryArea}
              onChange={setTryArea}
              suffix={departmentVars.length > 1 ? 'm², shared evenly' : 'm²'}
              vars={names}
              subject={`each the net room area of that department, in m²${
                general.length > 0 ? '. The General answers are in scope too, and preview at 1' : ''
              }`}
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
              onObjectFormula={(objectId, formula) => writeObjectFormula(connection, objectId, formula)}
            />
          ))}
        </RuleTree>
      </div>

    </div>
  )
}

// The model hangs `compiled`, `name`, `rooms` and `missing` off a connection for
// drawing; only the stored keys may go back into the document. `objects` is
// carried through untouched — it is stored, and dropping it here would wipe every
// object rule on the next edit of the room's own.
function stripped(connection) {
  const out = {
    kind: connection.kind,
    instance_id: connection.instance_id,
    label: connection.label ?? '',
    formula: connection.formula ?? '',
  }
  if (connectionHasObjectRules(connection)) out.objects = { ...connectionObjects(connection) }
  return out
}

// THE RULE ITSELF. Monospace, because it is read character by character rather
// than as a phrase, and committed on blur like every field here — a write per
// keystroke would be a write of the whole jsonb column per keystroke.
//
// AN INVALID RULE IS STORED ANYWAY. A half-typed rule is work, and refusing it
// at the field throws it away the moment focus moves; it is drawn as broken
// instead, which is the honest reading and a recoverable one.
// AN OBJECT'S BOX IS TINTED, a room's is white. The two read the same variable
// and do the same thing, so the tree is what says which level a row is on — but
// a column of identical boxes gave that no help at all, and the indent alone is
// 38px against a 225px box. A wash rather than a border or a second type: it
// changes nothing about the field and is still legible under the red a broken
// rule brings, which takes precedence.
const OBJECT_TINT = '#fffbe8'

// A NOTE IS GREY, WHEREVER A RULE IS DRAWN. `//` to the end of the line is
// stripped by the tokeniser (data/formula.js) and computes nothing, so it must
// not read with the same weight as the part that does.
const COMMENT_INK = '#a0a0a8'

// The rule and its note. The split is the tokeniser's own — first `//` wins, and
// everything after it is the note — so the colour and the language cannot
// disagree about where one ends.
function splitComment(text) {
  const at = String(text ?? '').indexOf('//')
  return at < 0 ? [text ?? '', ''] : [text.slice(0, at), text.slice(at)]
}

function FormulaField({ value, allowedVars, canEdit, onCommit, tint = null }) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])

  const mirror = useRef(null)
  const follow = (e) => {
    if (mirror.current) mirror.current.scrollLeft = e.currentTarget.scrollLeft
  }

  // Parsed as typed, so the message answers the keystroke that caused it.
  const compiled = compileFormula(draft, allowedVars)
  const broken = compiled.authored && !compiled.ok

  const common = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 12,
  }

  if (!canEdit) {
    const [rule, note] = splitComment(value ?? '')
    return (
      <span style={{ ...common, color: compiled.authored ? '#444' : '#bbb' }}>
        {compiled.authored ? (
          <>
            {rule}
            <span style={{ color: COMMENT_INK }}>{note}</span>
          </>
        ) : (
          'no rule yet'
        )}
      </span>
    )
  }

  // THE COMMENT IS GREY, AND AN INPUT CANNOT COLOUR HALF ITS OWN TEXT. So the
  // text is painted by a MIRROR behind the field and the input's own ink is made
  // transparent, leaving it the caret, the selection and every key it always
  // had. The two are laid out by the same box — same font, same padding, same
  // border width — because a mirror a pixel out is a caret in the wrong place.
  //
  // Monospace is what makes this exact rather than approximate, and the rule was
  // already monospace for its own reason above.
  //
  // `scrollLeft` is mirrored on every event that can move it: a rule wider than
  // its box scrolls under the caret, and a mirror that did not follow would
  // silently disagree with the text from the first overflow on.
  const [rule, note] = splitComment(draft)
  const box = {
    ...common,
    width: '100%',
    boxSizing: 'border-box',
    padding: '4px 6px',
    border: '1px solid transparent',
    borderRadius: 4,
    lineHeight: '17px',
    whiteSpace: 'pre',
  }

  return (
    <span style={{ position: 'relative', display: 'block', minWidth: 0 }}>
      <input
        type="text"
        value={draft}
        placeholder="no rule yet"
        title={broken ? compiled.message : 'How many of this one answer buys'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== (value ?? '') && onCommit(draft)}
        onScroll={follow}
        onSelect={follow}
        onKeyUp={follow}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(value ?? '')
        }}
        style={{
          ...box,
          position: 'relative',
          display: 'block',
          border: `1px solid ${broken ? '#e6a9a2' : '#ddd'}`,
          background: broken ? '#fdf6f5' : (tint ?? '#fff'),
          // The mirror is what you read. The caret keeps its own colour, or the
          // field would look like somewhere you cannot type.
          color: 'transparent',
          caretColor: '#222',
        }}
      />

      {/* OVER the field, not behind it: the input carries the background, and a
          mirror underneath would be painted over by it. The input's own text is
          transparent, so what shows through is this — and the selection band,
          which is drawn on the input's own ground beneath. */}
      <span
        ref={mirror}
        aria-hidden="true"
        style={{
          ...box,
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          color: '#222',
        }}
      >
        {rule}
        <span style={{ color: COMMENT_INK }}>{note}</span>
      </span>
    </span>
  )
}

// What a rule works out to at the sample number, or why it does not. The four
// states are told apart here and nowhere else in this panel.
//
// `evaluate` is what an OBJECT's row passes, since an object has only its own
// rule; a CONNECTION passes `connectionValue`, which is the same call plus the
// one-room default for a room whose objects are ruled and itself is not.
function Result({ evaluate, scope }) {
  const { value, state, message, implied } = evaluate(scope)

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
      // A figure nobody wrote a rule for reads quieter than one somebody did,
      // and says why on hover — otherwise a 1 appearing beside an empty box is
      // the app having done something unexplained.
      title={implied ? 'One, because the objects in it are sized and it is not' : undefined}
      style={{
        flexShrink: 0,
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        color: implied ? '#999' : value > 0 ? '#222' : '#bbb',
        fontStyle: implied ? 'italic' : undefined,
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

// THE THREE COLUMNS EVERY RULE IS READ IN — the name, the expression, the value
// it works out to — and they hold at every depth of the tree.
//
// THE NAME COLUMN IS A FIXED WIDTH THAT GIVES WAY TO THE INDENT, so the boxes
// begin on one column whatever level they are on. Left as a flexible column it
// was sized by the LONGEST name in the department, and every short one then sat
// a hand's width from its own box with nothing in between. A name too long for
// its column WRAPS, which costs a line of a row nobody reads twice; ellipsis
// there hid the one word telling two rooms apart.
// A rule is read character by character and some of them are long —
// `clamp(ceil(x/10), 1, 4)` — so the box is the widest column of the three. The
// name gives way for it, because a name that runs out of room WRAPS and a rule
// that runs out of room scrolls sideways under the caret.
const NAME_COL = 120
const RULE_FIELD = 225
// The first line of a row, and where a branch meets it. FIXED: a wrapped name
// makes its row taller, and a head measured from the middle of the whole box
// then lands below the row it points at — which is how the carets came to sit
// on the row underneath their own.
const RULE_LINE = 26
const RULE_HEAD = RULE_LINE / 2

// ONE ROW: a name, its expression box and the preview. A room, a room group and
// an object are all this row — what changes is the type, and how far in the tree
// has put it.
function RuleRow({ name, detail, title, depth = 0, weight = 400, size = 13, colour = '#222', field, result, onContextMenu }) {
  return (
    <div
      className="spp-row"
      title={title}
      onContextMenu={onContextMenu}
      // FROM THE TOP, not centred: everything sits on the first line, so a name
      // that wraps grows downwards and the box beside it does not drift.
      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}
    >
      <span
        style={{
          flexShrink: 0,
          // The floor is low on purpose: it is never reached at the depths this
          // tree actually goes to, and a floor that DID bite would push that
          // row's box out of the column every other box is read down.
          width: Math.max(40, NAME_COL - depth * BRANCH_CONTENT),
          overflowWrap: 'anywhere',
          fontSize: size,
          fontWeight: weight,
          lineHeight: `${RULE_LINE}px`,
          color: colour,
        }}
      >
        {name}
        {detail}
      </span>
      {/* Blank for a row that carries no rule of its own — a room inside a
          group — so the column still holds and its objects' boxes line up with
          everything else's. */}
      <span style={{ flexShrink: 0, width: RULE_FIELD, minHeight: RULE_LINE, display: 'flex', alignItems: 'center' }}>
        {field}
      </span>
      <span style={{ flexShrink: 0, minHeight: RULE_LINE, display: 'flex', alignItems: 'center' }}>{result}</span>
    </div>
  )
}

// ONE OBJECT INSIDE A ROOM, hanging off that room's branch. Its rule reads the
// SAME names the room's does — see OBJECTS in data/questionnaire.js — so there
// is no second help text and nothing here explains a new variable, because
// there isn't one.
//
// The catalog's own count rides along as a title rather than a column: it says
// what one of that room holds today, which is context for writing the rule and
// not a figure the rule produces.
function ObjectBranch({ object, depth, canEdit, allowedVars, scope, onFormula }) {
  return (
    <Branch endpoint="dot" head={RULE_HEAD}>
      <RuleRow
        name={object.name}
        title={`${object.name} — ${object.count} in one of this room, in the catalog`}
        depth={depth}
        size={12}
        colour="#666"
        field={
          <FormulaField
            value={object.formula ?? ''}
            allowedVars={allowedVars}
            canEdit={canEdit}
            tint={OBJECT_TINT}
            onCommit={onFormula}
          />
        }
        result={<Result evaluate={(s) => object.compiled.evaluate(s)} scope={scope} />}
      />
    </Branch>
  )
}

// OBJECTS FLOW FROM ROOMS, so they hang off the room that holds them and not off
// the connection: one flat list could not say which room a monitor stood in.
function objectBranches(room, depth, { canEdit, allowedVars, scope, onObjectFormula }) {
  return room.objects.map((object) => (
    <ObjectBranch
      key={object.instance_id}
      object={object}
      depth={depth}
      canEdit={canEdit}
      allowedVars={allowedVars}
      scope={scope}
      onFormula={(formula) => onObjectFormula(object.instance_id, formula)}
    />
  ))
}

// ONE CONNECTION: a catalog room group or a single room, its rule, the value at
// the sample number — and what stands in it, a branch each.
//
// A GROUP LISTS ITS ROOMS, read live off the tree: the membership is the Tree
// tab's to state and nothing here can change it, so a room's own row is a
// reading with no rule of its own, and its objects hang off it. A SINGLE ROOM is
// the connection's own row — naming it again one line down would say its name
// twice — so its objects hang straight off that.
function ConnectionBlock({ connection, canEdit, allowedVars, scope, onFormula, onObjectFormula, onRemove }) {
  const group = connection.kind === ROOM_GROUP
  const compiled = connection.compiled
  // A supporting department's rows are the catalog's and cannot be taken away —
  // clearing the rule is the whole of it — so there is no remove gesture there.
  const removable = canEdit && !!onRemove
  const under = { canEdit, allowedVars, scope, onObjectFormula }
  const own = group ? [] : (connection.rooms[0]?.objects ?? [])
  const children = group ? connection.rooms.length > 0 : own.length > 0

  return (
    <Branch endpoint={children ? 'caret' : 'dot'} expanded={children} padTop={4} head={4 + RULE_HEAD}>
      <RuleRow
        name={connection.name}
        detail={connection.missing && <span style={{ fontSize: 11 }}> — no longer in this department</span>}
        title={removable ? removeHint(group ? 'this group' : 'this room') : undefined}
        weight={group ? 600 : 400}
        colour={connection.missing ? '#b3261e' : '#222'}
        onContextMenu={
          removable
            ? (e) => {
                e.preventDefault()
                onRemove()
              }
            : undefined
        }
        field={
          <FormulaField
            value={connection.formula ?? ''}
            allowedVars={allowedVars}
            canEdit={canEdit}
            onCommit={onFormula}
          />
        }
        result={<Result evaluate={(s) => connectionValue(connection, s)} scope={scope} />}
      />

      {/* The rule's own complaint, on the row that owns it: not a child, so it
          gets no branch and the trunk runs past it. */}
      {compiled.authored && !compiled.ok && (
        <div style={{ fontSize: 11, color: '#b3261e', paddingBottom: 2 }}>{compiled.message}</div>
      )}

      {!group && objectBranches(connection.rooms[0] ?? { objects: [] }, 1, under)}

      {group &&
        connection.rooms.map((room) => (
          <Branch
            key={room.instance_id}
            endpoint={room.objects.length > 0 ? 'caret' : 'dot'}
            expanded={room.objects.length > 0}
            head={RULE_HEAD}
          >
            <RuleRow name={room.label} depth={1} size={12} colour="#666" />
            {objectBranches(room, 2, under)}
          </Branch>
        ))}
    </Branch>
  )
}

// THE WHOLE LIST IS ONE TREE, AND ITS TRUNK STARTS AT THE HEADING THAT NAMES IT
// — the same shape a department panel has, where the heading is the root and the
// rooms hang off it. Without a root each connection was a tree of its own and
// the column of them joined to nothing; the Try row sits under the heading and
// the trunk simply runs past it, as a room's own rows do.
function RuleTree({ caption, children }) {
  return (
    <TreeLayer>
      <BranchRoot>
        <RootCaption>{caption}</RootCaption>
        {children}
      </BranchRoot>
    </TreeLayer>
  )
}

function RootCaption({ children }) {
  const anchor = useRootAnchor()
  // NO CAPTION, AND THE TREE STILL NEEDS A ROOT: a zero-height anchor at the top
  // of the list, so the trunk starts there instead of at a heading. A caption
  // saying what the rows under it plainly are — "its rooms, one rule each" over
  // a list of rooms with a rule each — is a line spent on nothing.
  if (!children) return <div ref={anchor} style={{ height: 0 }} />

  return (
    <div
      ref={anchor}
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: '#888',
        paddingLeft: BRANCH_ORIGIN_CONTENT,
      }}
    >
      {children}
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
      {/* Beside the trunk, not across it: the Try row is the tree's own row —
          like a room's parameter band — so it is inset to where everything the
          line runs PAST starts, and gets no branch of its own. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
          paddingLeft: BRANCH_ORIGIN_CONTENT,
        }}
      >
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
        {/* THE SAMPLE SITS IN THE SENTENCE — "Try x = 10 beds" is one phrase and
            reads as one. It used to end on the right edge, in the column the
            results are read down, which put the number being TRIED among the
            numbers that came OUT of it. And it is typed, never nudged: a sample
            is picked, not arrived at a step at a time. */}
        <span style={{ flexShrink: 0, fontSize: 12, color: '#777' }}>{label}</span>
        <CountField value={value} min={0} step={1} prefix="" boxed digits={5} steppers={false} onChange={onChange} />
        {suffix && <span style={{ flexShrink: 0, fontSize: 11, color: '#999' }}>{suffix}</span>}
        <span style={{ flex: 1, minWidth: 0 }} />
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
        <Code>//</Code> starts a note, to the end of the rule — <Code>ceil({vars[0] ?? 'x'}/4) // one per four beds</Code>
        . A rule that is nothing but a note counts as unwritten.
      </HelpLine>

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

// THE GENERAL NAMES, AS THE PREVIEW READS THEM. They are answered in the Test
// run and nowhere here, so the designer has no value for one — and it still has
// to preview a rule that names one.
//
// EVERY ONE PREVIEWS AT 1, the identity: `ceil(x/4) * floors` then previews as
// `ceil(x/4)`, so the sample still says what the rule does to x rather than
// reading 0 and looking broken.
function generalPreview(general) {
  return Object.fromEntries(general.filter((g) => g.numeric).map((g) => [g.name, 1]))
}

function QuestionFace({ node, department, group, canEdit, editor, general }) {
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
        <RuleTree caption="Connects to, one rule each">
        {connections.length === 0 && (
          <PanelNote>Nothing yet. Add a room group or a single room from this department.</PanelNote>
        )}

        {connections.length > 0 && (
          <TryBar
            label="Try x ="
            value={tryX}
            onChange={setTryX}
            suffix={node.unit || null}
            // The general names are in scope here too, and the help is what
            // says which names a rule may use — it lists what is actually
            // allowed, or it is a second, wrong answer to that question.
            vars={['x', ...general.map((g) => g.name)]}
            subject={`what this question asks${node.unit ? `, in ${node.unit}` : ''}${
              general.length > 0 ? '. The rest are the General answers, which preview at 1' : ''
            }`}
          />
        )}

        {connections.map((connection) => (
          <ConnectionBlock
            key={connection.instance_id}
            connection={connection}
            canEdit={canEdit}
            allowedVars={['x', ...general.map((g) => g.name)]}
            scope={{ ...generalPreview(general), x: tryX }}
            onFormula={(formula) => edit((q) => questionWithFormula(q, connection.instance_id, formula))}
            onObjectFormula={(objectId, formula) =>
              edit((q) => questionWithObjectFormula(q, connection.instance_id, objectId, formula))
            }
            onRemove={() => setPendingRemove(connection)}
          />
        ))}
        </RuleTree>

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

// GENERAL: THE SECTION ITSELF. It has no groups and nothing to author on it, so
// this says what the section is FOR and lists the names its questions have put
// in scope — which is the one thing you come here to check before writing a rule
// somewhere else.
function GeneralFace({ section }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Caption>General</Caption>
      <PanelNote>
        Asked first, about the facility rather than about any one department. Every answer here is a{' '}
        <strong>variable every rule in the building can read</strong>, beside <code>x</code> and <code>a</code>.
      </PanelNote>

      <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 10 }}>
        <Caption>In scope everywhere</Caption>
        {section.questions.map((q) => (
          <VariableRow key={q.id} name={q.question.prompt} variable={q.variable} />
        ))}
      </div>

      <PanelNote>
        The list is the app&apos;s and cannot be added to here — a variable name that could be typed is one that could
        be renamed, which moves every rule using it onto a different answer without saying so. Only the wording is
        yours.
      </PanelNote>
    </div>
  )
}

// ONE GENERAL QUESTION, AND THE ONLY THING AUTHORED IS HOW IT IS PUT. Its name in
// the language, the kind of answer it takes and what it is counted in are the
// app's — see GENERAL in data/questionnaire.js — so they are stated here rather
// than offered as fields.
function GeneralQuestionFace({ node, canEdit, editor }) {
  const question = node.question

  return (
    <div style={{ minWidth: 0 }}>
      <Caption>General question</Caption>

      <Field
        label="Asked as"
        value={question.prompt}
        placeholder={question.prompt}
        canEdit={canEdit}
        onCommit={(prompt) => editor.setGeneralWording(node.id, prompt)}
      />

      <PanelNote>
        Answered with {question.kind === 'yesno' ? 'yes or no' : `a number${node.unit ? ` of ${node.unit}` : ''}`}, and
        any rule in the building may read <code>{node.variable}</code>
        {question.kind === 'yesno' ? ' — 1 for yes, 0 for no' : ''}. Until it is answered, a rule over it reads as
        unresolved rather than as 0.
      </PanelNote>

      {node.tally === 'beds' && (
        <PanelNote>
          The run adds up the beds its own answers place — every object marked <code>is_bed</code> in the catalog — and
          measures them against this figure, question by question.
        </PanelNote>
      )}

      <PanelNote>
        Clearing the wording puts the app&apos;s own question back. Nothing else about it is editable.
      </PanelNote>
    </div>
  )
}

export default function QuestionDetail({ buildingId, selectedId, canEdit }) {
  const editor = useQuestionnaireEditorContext()
  // Both hooks before any early return: a hook called conditionally changes the
  // order between renders, which is the one thing React cannot survive.
  const { sections, groups, departments, rooms, objects } = useCatalog()

  if (!editor.ready) {
    return (
      <PanelNote pad>
        No questionnaire for this building yet. Run <code>sql/questionnaire_setup.sql</code>.
      </PanelNote>
    )
  }

  const model = buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects })
  const found = locate(model, selectedId)

  if (!found) return <PanelNote pad>Pick a section, a group, a department or a question on the left.</PanelNote>

  const { node, section, group, department } = found

  // IN SCOPE EVERYWHERE, so it is read once here and handed to both faces that
  // hold a rule field. A field that did not know these names would call a
  // working rule broken as you typed it.
  const general = (model.find((s) => s.kind === 'general')?.questions ?? [])
    .filter((q) => q.variable)
    .map((q) => ({ name: q.variable, numeric: q.numeric }))

  if (node.kind === 'general') return <GeneralFace section={section} />

  if (node.kind === 'general-question') {
    return <GeneralQuestionFace node={node} canEdit={canEdit} editor={editor} />
  }

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
      <DepartmentFace department={department} group={group} canEdit={canEdit} editor={editor} general={general} />
    )
  }

  return (
    <QuestionFace
      node={node}
      department={department}
      group={group}
      canEdit={canEdit}
      editor={editor}
      general={general}
    />
  )
}
