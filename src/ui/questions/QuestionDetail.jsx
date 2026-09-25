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
import { createPortal } from 'react-dom'
import {
  connectionsWithFormula,
  connectionsWithObjectFormula,
  connectionsWithRoomFormula,
  questionWithRoomFormula,
  connectionHasObjectRules,
  connectionObjects,
  newConnection,
  questionWithObjectFormula,
  questionWithConnection,
  questionWithFormula,
  questionWithoutConnection,
  questionWithVariable,
  ROOM,
  ROOM_GROUP,
  DERIVED_GENERAL,
  PLOT_AREA_VAR,
  VENT_VAR,
  CLINICAL_VAR,
} from '../../data/questionnaire.js'
import { compileFormula, FORMULA_FUNCTIONS } from '../../data/formula.js'
import { SearchAddPicker } from '../primitives/SearchAddPicker.jsx'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import DisclosureCaret from '../primitives/DisclosureCaret.jsx'
import CompletionList, { completionsFor, tokenAt } from '../primitives/CompletionList.jsx'
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

// THE HEADING THE TEST RUN PRINTS over this department's chips. Blank shows the
// department's own name, greyed as the placeholder; typing that name back, or
// clearing it, stores nothing. Commits on leaving the field or Enter — every
// edit here is a whole-document write — and Escape abandons.
function TitleField({ department, canEdit, editor }) {
  const stored = department.title ?? ''
  const [draft, setDraft] = useState(stored)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setDraft(stored)
  }, [stored, focused])

  const commit = () => {
    setFocused(false)
    if (draft.trim() === stored.trim()) return
    editor.setTitle(department.sectionId, department.groupId, department.deptId, draft, department.name)
  }

  return (
    <label style={{ display: 'block', margin: '10px 0', fontSize: 12, color: '#555' }}>
      Title in the test run
      <input
        type="text"
        value={draft}
        disabled={!canEdit}
        placeholder={department.name}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            setDraft(stored)
            setFocused(false)
            e.currentTarget.blur()
          }
        }}
        style={{
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          marginTop: 4,
          padding: '6px 8px',
          fontSize: 14,
          fontFamily: 'inherit',
          borderRadius: 4,
          border: '1px solid #ccc',
        }}
      />
    </label>
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
        <TitleField department={department} canEdit={canEdit} editor={editor} />
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

function VariableRow({ name, variable, detail, detailColour = '#999', colour = '#222' }) {
  return (
    // STACKED, AND NOTHING IS CUT: the name over its variable, each the panel's
    // full width and wrapping. Side by side, both halves were ellipsed, and the
    // tail is exactly what tells `…diagnostics_ct` from `…diagnostics_mri`.
    <div className="spp-row" style={{ paddingBlock: 5, minWidth: 0 }}>
      <span style={{ display: 'block', minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, lineHeight: 1.35, color: colour }}>
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
          display: 'inline-block',
          maxWidth: '100%',
          marginTop: 3,
          boxSizing: 'border-box',
          padding: '3px 6px',
          borderRadius: 4,
          border: '1px solid #e6e6e6',
          background: '#f4f4f5',
          fontSize: 12,
          color: '#555',
          // A slug has no spaces; break at the dots and underscores' neighbours
          // rather than running off the panel.
          overflowWrap: 'anywhere',
        }}
      >
        {variable}
      </code>
    </div>
  )
}

// EVERY COUNT A RULE MAY NAME, shut. One row per room, room group and object of
// every department in scope, which is hundreds — the completion list in the rule
// field is how one is actually reached, and this is where you look to see what
// there is. Grouped under the department each belongs to, because that is what
// the first half of every name says.
function MemberList({ members }) {
  const [open, setOpen] = useState(false)
  const byDept = []
  members.forEach((m) => {
    const last = byDept[byDept.length - 1]
    if (last && last.id === m.deptInstanceId) last.rows.push(m)
    else byDept.push({ id: m.deptInstanceId, label: m.deptLabel, rows: [m] })
  })

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          font: 'inherit',
          fontSize: 11,
          color: '#666',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <DisclosureCaret expanded={open} />
        {members.length} count{members.length === 1 ? '' : 's'} you can name inside these — type to complete one
      </button>
      {open &&
        byDept.map((dept) => (
          <div key={dept.id} style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>{dept.label}</div>
            {dept.rows.map((m) => (
              <VariableRow key={`${m.deptInstanceId}:${m.targetId}`} name={m.label} variable={m.name} />
            ))}
          </div>
        ))}
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
  // ONE LEVEL IN: `patient_care.operating_room`, a count rather than an area. A
  // duplicate is left out of what compiles, so a rule naming one reads as
  // unresolved — see memberVariables in questionModel.js.
  const members = department.members ?? []
  const usableMembers = members.filter((m) => !m.duplicate)
  const clashes = members.filter((m) => m.duplicate)
  const names = [...variables.map((v) => v.name), ...usableMembers.map((m) => m.name), ...general.map((g) => g.name), VENT_VAR]
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
    [VENT_VAR]: tryArea,
    // A COUNT PREVIEWS AT 1, the identity — the same call the General answers
    // make, and for the same reason: `ceil(a/750) * patient_care.operating_room`
    // should preview as the part being written rather than as 0 and looking
    // broken. There is no sample box for them; twenty rooms would be twenty
    // boxes above a rule that names one.
    ...Object.fromEntries(usableMembers.map((m) => [m.name, 1])),
  }

  // EVERY ROOM IS ALREADY HERE — there is no picker, because a supporting
  // department sizes all of what it places and choosing which would be choosing
  // which rooms it has. Writing a rule is the whole edit; clearing one takes the
  // entry back out of the document.
  const writeFormula = (connection, formula) =>
    writeConnections(connectionsWithFormula(connections.map(stripped), connection, formula))

  const writeRoomFormula = (connection, roomId, formula) =>
    writeConnections(connectionsWithRoomFormula(connections.map(stripped), connection, roomId, formula))

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
            name="Sum of functioning departments"
            variable={groupVar.name}
            // The only thing left on this row, and only when it means something:
            // an empty group really does read 0.
            detail={departmentVars.length === 0 ? 'Nothing in it yet, so this is 0' : null}
          />
        )}

        {/* The whole group less its AHU Rooms — for an AHU Room's rule only. See
            pass 3 in useTestRun.jsx. */}
        <VariableRow
          name="Area to ventilate"
          variable={VENT_VAR}
          detail="Whole group less its AHU Rooms — read only by an AHU Room's rule"
        />

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

        {/* A COLLISION IS AN ERROR AND IS ALWAYS ON SCREEN — it is the one thing
            here that needs doing rather than knowing, and the fix is a rename on
            another tab. Both sides are listed: saying "operating_room is
            ambiguous" without saying which two things are called it leaves you
            hunting a department for a pair you cannot see. */}
        {clashes.map((member) => (
          <VariableRow
            key={`${member.deptInstanceId}:${member.targetId}`}
            name={`${member.deptLabel} → ${member.label}`}
            variable={member.name}
            colour="#b3261e"
            detail="Two things here are called this, so no rule can name either — rename one on the Tree tab"
            detailColour="#b3261e"
          />
        ))}

        {/* SHUT, AND THE COMPLETION IS WHY. This list is every room, group and
            object of every department in scope — hundreds of rows against the
            handful above them — and the way you reach one is to start typing its
            name in a rule. It is here to be browsed once, not read. */}
        {usableMembers.length > 0 && (
          <MemberList members={usableMembers} />
        )}
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
              step={100}
              suffix={departmentVars.length > 1 ? 'm², shared evenly' : 'm²'}
              // THE AREA NAMES ONLY. The counts one level in are hundreds of
              // names and listing them here would bury the handful of lines this
              // help exists to say; the sentence below points at them and the
              // field completes them, which is how one is actually reached.
              vars={[...variables.map((v) => v.name), ...general.map((g) => g.name)]}
              subject={`each the net room area of that department, in m²${
                usableMembers.length > 0
                  ? `. A room, room group or object inside one of them is a COUNT, written ${usableMembers[0].name} — start typing and the box completes it`
                  : ''
              }${general.length > 0 ? '. The General answers are in scope too, and preview at 1' : ''}`}
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
              onRoomFormula={(roomId, formula) => writeRoomFormula(connection, roomId, formula)}
              onObjectFormula={(objectId, formula) => writeObjectFormula(connection, objectId, formula)}
            />
          ))}
        </RuleTree>
      </div>

    </div>
  )
}

// The model hangs `compiled`, `name`, `rooms` and `missing` off a connection for
// drawing; only the stored keys may go back into the document. `objects` and the
// room rules are carried through untouched — both are stored, and dropping
// either here would wipe every rule under the row on the next edit of one.
//
// The room rules come from `roomRules`, not from `rooms`: the model replaces
// that key with the drawn list. See resolveConnection.
function stripped(connection) {
  const out = {
    kind: connection.kind,
    instance_id: connection.instance_id,
    label: connection.label ?? '',
    formula: connection.formula ?? '',
  }
  const rooms = connection.roomRules ?? {}
  if (Object.keys(rooms).length > 0) out.rooms = { ...rooms }
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

// One character of the rule field, in px — 12px in the monospace stack above.
// Only the completion list reads it, to put itself under the caret rather than
// under the box, and being a pixel out there costs nothing. The MIRROR needs no
// such number: it is the same text in the same font, laid out by the browser.
const CHAR_WIDTH = 7.23

// The rule and its note. The split is the tokeniser's own — first `//` wins, and
// everything after it is the note — so the colour and the language cannot
// disagree about where one ends.
function splitComment(text) {
  const at = String(text ?? '').indexOf('//')
  return at < 0 ? [text ?? '', ''] : [text.slice(0, at), text.slice(at)]
}

// A RULE IS A ONE-LINE FIELD IN A NARROW PANEL, AND SOME RULES ARE NOT.
// `emergency.patient_care.theatre_set.scrub_bay` is 44 characters before any
// arithmetic, so a rule worth commenting cannot be read in the box it is typed
// in. Double-click opens it at a size it can be read at.
//
// >>> IT IS A TEXTAREA, AND MULTI-LINE RULES ALREADY PARSED. The tokeniser has
// >>> counted \n as whitespace since it was written, and a comment already ran to
// >>> the end of ITS line — so a rule laid out over four lines with a note on
// >>> each needed nothing added to the language. See data/formula.js.
// `times` / `none` are Result's, so the full-size reading and the row's agree.
function FormulaLightbox({ label, value, allowedVars, scope, times = 1, none = false, onSave, onClose }) {
  const [draft, setDraft] = useState(value ?? '')
  const area = useRef(null)
  const mirror = useRef(null)
  const [suggesting, setSuggesting] = useState(null)
  const [active, setActive] = useState(0)
  const suggestions = suggesting ? completionsFor(allowedVars ?? [], suggesting.text) : []

  const compiled = compileFormula(draft, allowedVars)
  const broken = compiled.authored && !compiled.ok
  const result = scope && compiled.ok ? compiled.evaluate(scope) : null

  // UNDER THE BOX, NOT UNDER THE CARET — the one place this differs from the
  // inline field. A caret in a textarea is a line and a column, and finding its
  // pixel needs a second mirror measured per keystroke; the box here is large and
  // a list along its bottom edge points at it unmistakably.
  const openCompletion = (el) => {
    const { start, text } = tokenAt(el.value, el.selectionStart ?? 0)
    if (!text) return setSuggesting(null)
    const rect = el.getBoundingClientRect()
    setSuggesting({ start, text, at: { left: rect.left, top: rect.top, bottom: rect.bottom } })
    setActive(0)
  }

  const pick = (name) => {
    if (!suggesting) return
    const before = draft.slice(0, suggesting.start)
    const after = draft.slice(suggesting.start + suggesting.text.length)
    setDraft(`${before}${name}${after}`)
    setSuggesting(null)
    const caret = before.length + name.length
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(caret, caret)
    })
  }

  const save = () => {
    onSave(draft)
    onClose()
  }

  const [rule, note] = splitComment(draft)
  const box = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 14,
    lineHeight: '22px',
    width: '100%',
    height: 180,
    boxSizing: 'border-box',
    padding: '10px 12px',
    border: '1px solid transparent',
    borderRadius: 6,
    // The mirror wraps exactly as the textarea does, or the two disagree from
    // the first line long enough to wrap.
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    margin: 0,
  }

  return createPortal(
    <div
      // A CLICK OUTSIDE CLOSES WITHOUT SAVING, like every other dismissible
      // surface here. The edit is not lost silently: there is a Save beside it
      // and ⌘↵ does the same thing.
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(760px, 100%)',
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          padding: 18,
          minWidth: 0,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 2 }}>{label || 'Rule'}</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>
          Enter starts a new line — a rule may be laid out over several, and <code>//</code> comments each one.
        </div>

        <div style={{ position: 'relative' }}>
          <textarea
            ref={area}
            autoFocus
            value={draft}
            spellCheck={false}
            onChange={(e) => {
              setDraft(e.target.value)
              openCompletion(e.target)
            }}
            onScroll={(e) => {
              if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop
            }}
            onKeyDown={(e) => {
              if (suggestions.length > 0) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
                  return
                }
                if (e.key === 'Tab') {
                  e.preventDefault()
                  pick(suggestions[active])
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setSuggesting(null)
                  return
                }
              }
              // ⌘/Ctrl+Enter SAVES, and a bare Enter is a new line — the opposite
              // of the inline field, where Enter is the only way out of a
              // one-line box. A surface this size is one somebody types into.
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                save()
              }
              if (e.key === 'Escape') onClose()
            }}
            style={{
              ...box,
              position: 'relative',
              display: 'block',
              resize: 'vertical',
              border: `1px solid ${broken ? '#e6a9a2' : '#ddd'}`,
              background: broken ? '#fdf6f5' : '#fff',
              color: 'transparent',
              caretColor: '#222',
              outline: 'none',
            }}
          />
          {/* The same mirror the inline field uses, and for the same reason: a
              textarea cannot colour half its own text either. */}
          <div
            ref={mirror}
            aria-hidden="true"
            style={{
              ...box,
              position: 'absolute',
              inset: 0,
              height: 'auto',
              overflow: 'hidden',
              pointerEvents: 'none',
              color: '#222',
              border: '1px solid transparent',
            }}
          >
            {rule}
            <span style={{ color: COMMENT_INK }}>{note}</span>
          </div>
        </div>

        {/* WHAT IT COMES TO, OR WHY IT DOES NOT — the thing the inline row shows
            in one character, said in full where there is room for it. */}
        <div style={{ minHeight: 18, marginTop: 8, fontSize: 12 }}>
          {broken ? (
            <span style={{ color: '#b3261e' }}>{compiled.message}</span>
          ) : none && compiled.authored ? (
            <span style={{ color: '#666' }}>
              The sample is 0, which builds nothing — this comes to <strong style={{ color: '#222' }}>0</strong>
            </span>
          ) : result && times == null ? (
            <span style={{ color: '#b3261e' }}>The group&apos;s own rule is broken, so nothing in it can be counted</span>
          ) : result && result.state === 'ok' ? (
            <span style={{ color: '#666' }}>
              At the sample above this comes to <strong style={{ color: '#222' }}>{result.value * times}</strong>
              {times !== 1 && ` (${result.value} in one set × ${times} sets)`}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ flex: 1, fontSize: 11, color: '#aaa' }}>⌘↵ to save · Esc to close</span>
          <button type="button" onClick={onClose} style={LIGHTBOX_BUTTON}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            style={{ ...LIGHTBOX_BUTTON, background: '#1a73e8', borderColor: '#1a73e8', color: '#fff' }}
          >
            Save
          </button>
        </div>

        <CompletionList options={suggestions} active={active} at={suggesting?.at ?? null} onPick={pick} />
      </div>
    </div>,
    document.body
  )
}

const LIGHTBOX_BUTTON = {
  font: 'inherit',
  fontSize: 12,
  padding: '5px 12px',
  borderRadius: 5,
  border: '1px solid #ddd',
  background: '#fff',
  color: '#333',
  cursor: 'pointer',
}

function FormulaField({ value, allowedVars, canEdit, onCommit, tint = null, label = null, scope = null, times = 1, none = false }) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])

  const mirror = useRef(null)
  const field = useRef(null)
  const follow = (e) => {
    if (mirror.current) mirror.current.scrollLeft = e.currentTarget.scrollLeft
  }

  // Parsed as typed, so the message answers the keystroke that caused it.
  const compiled = compileFormula(draft, allowedVars)
  const broken = compiled.authored && !compiled.ok

  // COMPLETION. `suggesting` is what the caret is inside — where that name
  // starts, what has been typed of it, and the rectangle to hang the list off —
  // or null when there is nothing to offer. It is state rather than derived,
  // because Escape has to be able to put it away without changing the text.
  const [suggesting, setSuggesting] = useState(null)
  const [active, setActive] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const suggestions = suggesting ? completionsFor(allowedVars ?? [], suggesting.text) : []

  // The lightbox, and the one way into it. Double-click on an input normally
  // selects a word; here the row is one short expression and reading the whole
  // of it is worth more than selecting one term.
  const lightbox = expanded && (
    <FormulaLightbox
      label={label}
      value={draft}
      allowedVars={allowedVars}
      scope={scope}
      times={times}
      none={none}
      onSave={(next) => {
        setDraft(next)
        if (next !== (value ?? '')) onCommit(next)
      }}
      onClose={() => setExpanded(false)}
    />
  )

  // The list hangs off the CARET, not off the box: a rule is read character by
  // character and a list under the far left of a 300px field points at nothing.
  // Monospace is what makes the column arithmetic rather than measurement — the
  // same property the mirror above relies on.
  const openCompletion = (input) => {
    const { start, text } = tokenAt(input.value, input.selectionStart ?? 0)
    if (!text) return setSuggesting(null)
    const rect = input.getBoundingClientRect()
    const chars = start - (input.scrollLeft / CHAR_WIDTH)
    setSuggesting({
      start,
      text,
      at: { left: rect.left + 7 + chars * CHAR_WIDTH, top: rect.top, bottom: rect.bottom },
    })
    setActive(0)
  }

  // Replace the name being typed, and put the caret at its end — not at the end
  // of the rule, which is where a naive setState leaves it and is wrong the
  // moment a name is completed in the middle of an expression.
  const pick = (name) => {
    if (!suggesting) return
    const before = draft.slice(0, suggesting.start)
    const after = draft.slice(suggesting.start + suggesting.text.length)
    setDraft(`${before}${name}${after}`)
    setSuggesting(null)
    const caret = before.length + name.length
    requestAnimationFrame(() => {
      field.current?.focus()
      field.current?.setSelectionRange(caret, caret)
    })
  }

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

  // A RULE WRITTEN OVER SEVERAL LINES CANNOT LIVE IN A ONE-LINE INPUT — an
  // <input> drops newlines on the way in, so typing in this row would silently
  // flatten a layout somebody made in the lightbox. So the row becomes a
  // READING of it, and the lightbox is where it is edited. Its first line is
  // what shows, which is where a rule's subject is.
  if (draft.includes('\n')) {
    const [rule, note] = splitComment(draft.split('\n')[0])
    return (
      <span
        onDoubleClick={() => setExpanded(true)}
        title="Written over several lines — double-click to open it"
        style={{
          ...common,
          display: 'block',
          width: '100%',
          padding: '4px 6px',
          border: `1px dashed ${broken ? '#e6a9a2' : '#ddd'}`,
          borderRadius: 4,
          background: broken ? '#fdf6f5' : (tint ?? '#fff'),
          color: '#222',
          cursor: 'pointer',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {rule}
        <span style={{ color: COMMENT_INK }}>{note}</span>
        <span style={{ color: '#bbb' }}> …</span>
        {lightbox}
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
    // WIDTH 100%, and it is load-bearing: this sits in a flex row, so without it
    // the wrapper sizes to its own content and the input's own `width: 100%`
    // then resolves against that rather than against the column.
    <span style={{ position: 'relative', display: 'block', width: '100%', minWidth: 0 }}>
      <input
        ref={field}
        type="text"
        value={draft}
        placeholder="no rule yet"
        title={broken ? compiled.message : 'How many of this one answer buys'}
        onChange={(e) => {
          setDraft(e.target.value)
          openCompletion(e.target)
        }}
        onDoubleClick={() => setExpanded(true)}
        onBlur={() => {
          setSuggesting(null)
          if (draft !== (value ?? '')) onCommit(draft)
        }}
        onScroll={follow}
        onSelect={follow}
        onKeyUp={follow}
        onKeyDown={(e) => {
          // THE LIST TAKES THE KEYS FIRST, and only while it is up. Enter
          // completes a name rather than leaving the field, and Escape shuts the
          // list rather than abandoning the rule — one press per thing, so
          // nothing is dismissed twice over.
          if (suggestions.length > 0) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const step = e.key === 'ArrowDown' ? 1 : suggestions.length - 1
              setActive((i) => (i + step) % suggestions.length)
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              pick(suggestions[active])
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setSuggesting(null)
              return
            }
          }
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

      <CompletionList options={suggestions} active={active} at={suggesting?.at ?? null} onPick={pick} />
      {lightbox}
    </span>
  )
}

// What a rule works out to at the sample number, or why it does not. The four
// states are told apart here and nowhere else in this panel.
//
// `blank` is what an UNWRITTEN rule works out to, when that is a number rather
// than nothing — a room group's count, which is one set. Null everywhere else.
//
// `times` IS THE GROUP'S RULE AT THE SAME SAMPLE, for a room or object inside a
// room group — the run builds the two MULTIPLIED (evaluateConnection in
// useTestRun.jsx), so the preview must too, or `x` in both reads x here and x²
// in the run. Null when the group's rule is broken: nothing under it can be read.
//
// `none` is the run's "0 IS THE NO": a question answered 0 builds nothing and its
// rules are never read (evaluateRun), so a constant rule previews 0, not itself.
function Result({ compiled, scope, blank = null, times = 1, none = false }) {
  if (none) return <Muted>0</Muted>
  const { value: own, state, message } = compiled.evaluate(scope)

  if (state === 'unauthored') return <Muted>{blank ?? '—'}</Muted>
  if (state !== 'ok' || times == null) {
    return (
      <span
        title={state !== 'ok' ? message : "The group's own rule is broken, so nothing in it can be counted"}
        style={{ flexShrink: 0, fontSize: 11, color: '#b3261e', fontWeight: 600 }}
      >
        !
      </span>
    )
  }
  const value = own * times
  return (
    <span
      title={times !== 1 ? `${own} in one set × ${times} sets` : undefined}
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
// `clamp(ceil(x/10), 1, 4)` — so the box TAKES EVERYTHING LEFT between the two
// fixed columns. A fixed width for it left a strip of empty panel beside every
// rule and made long ones scroll under the caret while there was room going
// spare on the same row.
//
// It still lines up at every depth, which is the whole reason the other two are
// fixed: the indent comes out of the NAME column, so the box's left edge never
// moves, and its right edge is the panel's own.
// Wide enough that a room two levels in — inside a group, where the indent has
// already taken 76px — still gets a readable column. It was 120, which left
// "equipment object" broken across three lines the moment a group's rooms became
// rows that carry rules. The box gives nothing up for it: it takes whatever is
// left, and there is plenty.
const NAME_COL = 172
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
      <span style={{ flex: 1, minWidth: 0, minHeight: RULE_LINE, display: 'flex', alignItems: 'center' }}>
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
function ObjectBranch({ object, depth, canEdit, allowedVars, scope, times = 1, none = false, onFormula }) {
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
            label={object.name}
            scope={scope}
            times={times}
            none={none}
          />
        }
        result={<Result compiled={object.compiled} scope={scope} times={times} none={none} />}
      />
    </Branch>
  )
}

// OBJECTS FLOW FROM ROOMS, so they hang off the room that holds them and not off
// the connection: one flat list could not say which room a monitor stood in.
function objectBranches(room, depth, { canEdit, allowedVars, scope, none, onObjectFormula }, times = 1) {
  return room.objects.map((object) => (
    <ObjectBranch
      key={object.instance_id}
      object={object}
      depth={depth}
      canEdit={canEdit}
      allowedVars={allowedVars}
      scope={scope}
      times={times}
      none={none}
      onFormula={(formula) => onObjectFormula(object.instance_id, formula)}
    />
  ))
}

// ONE CONNECTION: a catalog room group or a single room, its rule, the value at
// the sample number — and what stands in it, a branch each.
//
// A GROUP LISTS ITS ROOMS, read live off the tree: the membership is the Tree
// tab's to state and nothing here can change it. **EACH ROOM CARRIES ITS OWN
// RULE** and the group carries none — see A ROOM GROUP'S ROOMS in
// data/questionnaire.js. A SINGLE ROOM is the connection's own row — naming it
// again one line down would say its name twice — so it keeps its rule on that
// row and its objects hang straight off it.
function ConnectionBlock({
  connection,
  canEdit,
  allowedVars,
  scope,
  // The sample is 0: the run reads none of these rules — see Result.
  none = false,
  onFormula,
  onRoomFormula,
  onObjectFormula,
  onRemove,
}) {
  const group = connection.kind === ROOM_GROUP
  const compiled = connection.compiled
  // A supporting department's rows are the catalog's and cannot be taken away —
  // clearing the rule is the whole of it — so there is no remove gesture there.
  const removable = canEdit && !!onRemove
  const under = { canEdit, allowedVars, scope, none, onObjectFormula }
  const own = group ? [] : (connection.rooms[0]?.objects ?? [])
  const children = group ? connection.rooms.length > 0 : own.length > 0
  // HOW MANY SETS AT THE SAMPLE, which every room and object figure under a
  // group is multiplied by — the run's connectionMultiplier, read the same way:
  // unwritten is 1, broken is null.
  const setCount = !group
    ? 1
    : (() => {
        const { value, state } = compiled.evaluate(scope)
        if (state === 'unauthored') return 1
        return state === 'ok' ? value : null
      })()

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
        // A GROUP'S BOX IS HOW MANY OF THE SET, and it multiplies every rule
        // under it; a single room's is how many of that room. Both are the
        // connection's own `formula` — the same key, one level apart.
        field={
          <FormulaField
            value={connection.formula ?? ''}
            allowedVars={allowedVars}
            canEdit={canEdit}
            onCommit={onFormula}
            label={connection.name}
            scope={scope}
            none={none}
          />
        }
        // A GROUP WITH NO RULE READS 1, NOT —. The em dash is "nothing here",
        // which is true of an unwritten room rule and false of this one: an
        // unwritten multiplier is one set, and the rooms below it are built. It
        // is drawn muted, because nobody typed it.
        result={<Result compiled={compiled} scope={scope} blank={group ? 1 : null} none={none} />}
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
            <RuleRow
              name={room.label}
              depth={1}
              size={12}
              colour="#666"
              field={
                <FormulaField
                  value={room.formula ?? ''}
                  allowedVars={allowedVars}
                  canEdit={canEdit}
                  onCommit={(formula) => onRoomFormula(room.instance_id, formula)}
                  label={`${connection.name} → ${room.label}`}
                  scope={scope}
                  times={setCount}
                  none={none}
                />
              }
              // Its own rule × the group's — what the run builds.
              result={<Result compiled={room.compiled} scope={scope} times={setCount} none={none} />}
            />
            {room.compiled.authored && !room.compiled.ok && (
              <div style={{ fontSize: 11, color: '#b3261e', paddingBottom: 2 }}>{room.compiled.message}</div>
            )}
            {objectBranches(room, 2, under, setCount)}
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
// `step` puts − / + on the sample; an area is swept in hundreds, x is typed.
function TryBar({ label, value, onChange, step, suffix, vars, subject }) {
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
        <CountField
          value={value}
          min={0}
          step={step ?? 1}
          prefix=""
          boxed
          digits={5}
          steppers={step != null}
          onChange={onChange}
        />
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
  const dummy = node.dummy === true
  // A dummy's rules see everything but x.
  const vars = dummy ? general.map((g) => g.name) : ['x', ...general.map((g) => g.name)]
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
      {/* The face's title, at the department panel's 22px. No path under it:
          the outline beside it already shows where the question sits. */}
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>Question</div>

      {/* A DUMMY: never asked, no x, sized off the other names in scope. Off
          deletes the key, so a real question stores what it always did. */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 13 }}>Dummy</span>
        <Toggle
          checked={dummy}
          disabled={!canEdit}
          title="A dummy is never asked and has no x — its rules read the other variables only"
          onChange={(on) =>
            edit((q) => {
              const next = { ...q }
              if (on) next.dummy = true
              else delete next.dummy
              return next
            })
          }
        />
      </div>
      {dummy && (
        <PanelNote>
          Never asked in the run and takes no <code>x</code>. Its rules are written over the General answers and the
          other questions&apos; variables, and build whenever its group is switched on.
        </PanelNote>
      )}

      <Field
        label="Asked as"
        value={question.prompt}
        placeholder="How many beds?"
        canEdit={canEdit}
        onCommit={(prompt) => edit((q) => ({ ...q, prompt }))}
      />
      <Field
        label="Units"
        value={node.unit}
        placeholder="beds"
        canEdit={canEdit}
        onCommit={(unit) => edit((q) => ({ ...q, unit }))}
      />

      {/* WHAT OTHER RULES CALL THIS x. No path — it is unique in the building,
          and a clash is shown here and left out of scope everywhere. */}
      {!dummy && (
      <Field
        label="Variable Name"
        value={node.variable ?? ''}
        canEdit={canEdit}
        onCommit={(name) => edit((q) => questionWithVariable(q, name))}
      />
      )}
      {dummy ? null : node.variableClash ? (
        <PanelNote>
          <span style={{ color: '#c62828' }}>
            {node.variableClash} — no rule can read it until it is renamed.
          </span>
        </PanelNote>
      ) : (
        node.variable && (
          <PanelNote>
            Every other rule in the building may read this answer as <code>{node.variable}</code>.
          </PanelNote>
        )
      )}

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
        <RuleTree caption="Ruleset">
        {connections.length === 0 && (
          <PanelNote>Nothing yet. Add a room group or a single room from this department.</PanelNote>
        )}

        {connections.length > 0 && !dummy && (
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
            allowedVars={vars}
            scope={dummy ? generalPreview(general) : { ...generalPreview(general), x: tryX }}
            none={!dummy && !(tryX > 0)}
            onFormula={(formula) => edit((q) => questionWithFormula(q, connection.instance_id, formula))}
            onRoomFormula={(roomId, formula) =>
              edit((q) => questionWithRoomFormula(q, connection.instance_id, roomId, formula))
            }
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

      <Field
        label="Caption"
        value={question.comment}
        placeholder="Printed under the question in the run"
        canEdit={canEdit}
        multiline
        onCommit={(comment) => editor.setGeneralCaption(node.id, comment)}
      />

      {question.kind === 'dmgs' ? (
        // A SCOPE, NOT A NUMBER: no rule reads it. See data/dmg.js.
        <PanelNote>
          Answered by switching on the disease management groups in sp_dmg. The run then asks only the department
          groups with no DMG and those tagged with one switched on; unanswered, it asks the untagged ones alone.
        </PanelNote>
      ) : !node.variable ? (
        // THE OPTION'S OWN SETTINGS — see OPTION_ANSWERS. No rule reads them.
        <PanelNote>
          A setting of the option the creator makes, written onto it when the run is finished. No rule reads it.
        </PanelNote>
      ) : (
        <PanelNote>
          Answered with {question.kind === 'yesno' ? 'yes or no' : question.kind === 'multiplier' ? `a slider from ${question.min}× to ${question.max}×` : `a number${node.unit ? ` of ${node.unit}` : ''}`}, and
          any rule in the building may read <code>{node.variable}</code>
          {question.kind === 'yesno' ? ' — 1 for yes, 0 for no' : ''}.{' '}
          {question.kind === 'multiplier'
            ? `Untouched, it reads as ${question.default ?? 1}.`
            : 'Until it is answered, a rule over it reads as unresolved rather than as 0.'}
        </PanelNote>
      )}

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
  const { sections, groups, departments, rooms, objects, equipment } = useCatalog()

  if (!editor.ready) {
    return (
      <PanelNote pad>
        No questionnaire for this building yet. Run <code>sql/questionnaire_setup.sql</code>.
      </PanelNote>
    )
  }

  const model = buildModel({ buildingId, definition: editor.definition, sections, groups, departments, rooms, objects, equipment })
  const found = locate(model, selectedId)

  if (!found) return <PanelNote pad>Pick a section, a group, a department or a question on the left.</PanelNote>

  const { node, section, group, department } = found

  // IN SCOPE EVERYWHERE, so it is read once here and handed to both faces that
  // hold a rule field. A field that did not know these names would call a
  // working rule broken as you typed it.
  const general = (model.find((s) => s.kind === 'general')?.questions ?? [])
    .filter((q) => q.variable)
    .map((q) => ({ name: q.variable, numeric: q.numeric }))
  // The names worked out from them — fsi_area, plinth — are in scope the same way.
  general.push({ name: PLOT_AREA_VAR, numeric: true })
  DERIVED_GENERAL.forEach((d) => general.push({ name: d.variable, numeric: true }))
  // Every question's named x rides along with them, previewing at 1 the same
  // way. A clashing one is left out, exactly as the model left it out of compile.
  // A CLINICAL section sees only clinical names; every other section sees them
  // all plus total_clinical_area — see CLINICAL_VAR.
  const clinicalScope = section?.clinical === true
  model.forEach((s) =>
    s.groups.forEach((g) =>
      g.departments.forEach((d) => {
        if (d.role === SUPPORTING) return
        if (clinicalScope && !s.clinical) return
        d.questions.forEach((q) => {
          if (q.variable && !q.variableClash) general.push({ name: q.variable, numeric: true })
        })
      })
    )
  )
  if (!clinicalScope && model.some((s) => s.clinical)) general.push({ name: CLINICAL_VAR, numeric: true })

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
        <SwitchRow
          label="Clinical"
          detail={`Built first; its area is ${CLINICAL_VAR} to every other section, and its rules read no other section's names`}
          checked={section.clinical === true}
          disabled={!canEdit}
          onChange={(on) => editor.setClinical(section.sectionId, on)}
        />
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
