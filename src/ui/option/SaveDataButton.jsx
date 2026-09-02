// "Save Data" — the only thing in the app that writes an option.
//
// It sits on the option's title row, at the right — level with the heading and
// directly above the top-right corner of the department card it acts on.
//
// Rooms, objects and counts are edited in memory and go nowhere until this is
// pressed. It is disabled while the option matches what's stored, so its state
// is also the answer to "have I got unsaved work?" — greyed means no.
//
// It replaced an autosave. That is worth remembering before anyone adds a timer
// back: an option is written by overwriting its whole row, and every automatic
// trigger we had — debounce, flush on leaving, flush on tab-hide — turned out
// to be another way to write the wrong state over the right one.

export default function SaveDataButton({ dirty, saving, error, onSave }) {
  const label = saving ? 'Saving…' : error ? 'Retry save' : 'Save Data'

  return (
    <div
      className="nodrag nopan"
      style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
    >
      {error && (
        <span style={{ fontSize: 11, color: '#c0392b', maxWidth: 260 }} title={error}>
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || (!dirty && !error)}
        title={dirty || error ? 'Write these changes to the database' : 'No changes to save'}
        style={{
          padding: '5px 12px',
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 6,
          whiteSpace: 'nowrap',
          // Green while there is something to save, plain while there isn't —
          // the same green the footer uses for a write in progress.
          border: `1px solid ${dirty || error ? '#188038' : '#ccc'}`,
          background: dirty || error ? '#188038' : '#f4f4f4',
          color: dirty || error ? '#fff' : '#999',
          cursor: dirty || error ? 'pointer' : 'default',
        }}
      >
        {saving && <span className="spp-spinner" aria-hidden="true" style={{ marginRight: 6 }} />}
        {label}
      </button>
    </div>
  )
}
