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
  newConnection,
  newDriver,
  newNumber,
  questionWithConnection,
  questionWithoutConnection,
  ROOM,
  ROOM_GROUP,
} from '../../data/questionnaire.js'
import { SearchAddPicker } from '../primitives/SearchAddPicker.jsx'
import ValuePicker from '../primitives/ValuePicker.jsx'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import { removeHint } from '../primitives/RemoveButton.jsx'
import Toggle from '../primitives/Toggle.jsx'
import { CountField, PanelNote } from '../panel/panelParts.jsx'
import { useQuestionnaireEditorContext } from './useQuestionnaireEditor.jsx'
import { buildModel, driverOptions, locate, FUNCTIONING, SUPPORTING } from './questionModel.js'
import { Counter } from './Counter.jsx'
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

function DepartmentFace({ department, group, model, canEdit, editor }) {
  const supporting = department.role === SUPPORTING
  const driver = department.driver

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

  const options = driverOptions(model)
  const live = options.find((o) => o.id === driver?.source_id) ?? null
  const set = (patch) => editor.setDepartmentDriver(department.sectionId, department.groupId, department.deptId, {
    ...(driver ?? newDriver()),
    ...patch,
  })

  return (
    <div style={{ minWidth: 0 }}>
      <Caption>Supporting department</Caption>
      <Where>
        {group.name} → {department.name}
      </Where>

      <PanelNote>
        Sized by a rule rather than by questions: one driver — a figure this questionnaire will have — times a
        coefficient.
      </PanelNote>

      <div style={{ marginTop: 10 }}>
        <ValuePicker
          label="Driver"
          set={!!driver?.source_id}
          // The frozen label is what a driver whose source has been deleted
          // reads as — the same device sp_option.data.sp_path is.
          name={live?.name ?? driver?.source_label ?? 'Not in the questionnaire'}
          suffix={
            live && <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 11, color: '#888' }}>{live.kind}</span>
          }
          detail={live?.path ?? (driver?.source_id ? 'That figure is no longer asked for' : null)}
          detailTone={live || !driver?.source_id ? 'muted' : 'warn'}
          options={options}
          placeholder="Search rooms and totals..."
          chooseLabel="Choose a driver"
          emptyNote="Nothing is counted yet — connect a room to a question first."
          canEdit={canEdit}
          onPick={(o) => set({ source_kind: o.kind, source_id: o.id, source_label: o.name })}
          onClear={() => set({ source_kind: null, source_id: null, source_label: null })}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <span style={{ flex: 1, fontSize: 13 }}>Coefficient</span>
        <CountField
          value={driver?.coefficient ?? 1}
          canEdit={canEdit}
          min={0}
          step={0.1}
          decimals={2}
          prefix="× "
          title="How many of this per unit of the driver"
          onCommit={(coefficient) => set({ coefficient })}
        />
      </div>

      <PanelNote>
        Nothing reads this yet. What the product is — a count, an area, or a multiplier on the catalog's own figure — is
        the wizard's to settle.
      </PanelNote>
    </div>
  )
}

// ONE CONNECTION: a catalog room group or a single room, and the counter that
// will be its whole answer.
//
// A GROUP LISTS ITS ROOMS, read live off the tree — the membership is the Tree
// tab's to state and nothing here can change it, so the list is a reading rather
// than a control. A single room says its name once and draws nothing under it.
function ConnectionBlock({ connection, canEdit, onRemove }) {
  const group = connection.kind === ROOM_GROUP

  return (
    <div style={{ marginTop: 8, borderLeft: '2px solid #eee', paddingLeft: 8, minWidth: 0 }}>
      <div
        className="spp-row"
        title={canEdit ? removeHint(group ? 'this group' : 'this room') : undefined}
        onContextMenu={
          canEdit
            ? (e) => {
                e.preventDefault()
                onRemove()
              }
            : undefined
        }
        style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBlock: 4, minWidth: 0 }}
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
          {connection.missing && (
            <span style={{ fontSize: 11 }}> — no longer in this department</span>
          )}
        </span>
        <Counter />
      </div>

      {group &&
        connection.rooms.map((room) => (
          <div
            key={room.instance_id}
            style={{
              fontSize: 12,
              color: '#666',
              paddingBlock: 2,
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

function QuestionFace({ node, department, group, canEdit, editor }) {
  const question = node.question
  const edit = (updater) => editor.setQuestion(node.sectionId, node.groupId, node.deptId, node.id, updater)
  // Right-click disconnects, and it always prompts. Same gesture as the tree's
  // branches — there is no × on a row anywhere in this app.
  const [pendingRemove, setPendingRemove] = useState(null)

  const connections = node.connections

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
        placeholder="Is there an MRI?"
        canEdit={canEdit}
        onCommit={(prompt) => edit((q) => ({ ...q, prompt }))}
      />
      <PanelNote>Answered yes or no. Yes opens what it connects to below, each with its own counter.</PanelNote>

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
        <Caption>Connects to, one counter each</Caption>
        {connections.length === 0 ? (
          <PanelNote>Nothing yet. Add a room group or a single room from this department.</PanelNote>
        ) : (
          <PanelNote>A yes opens these. Each takes a count of its own, and 0 means that one was not chosen.</PanelNote>
        )}

        {connections.map((connection) => (
          <ConnectionBlock
            key={connection.instance_id}
            connection={connection}
            canEdit={canEdit}
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
      <DepartmentFace department={department} group={group} model={model} canEdit={canEdit} editor={editor} />
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
