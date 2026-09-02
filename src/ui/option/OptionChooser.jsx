// What the Canvas tab shows before an option is open — which, since picking a
// project lands you here, is the first thing you see on entering a project.
//
// It replaced a line of grey text telling you to select an option, with the
// list to select from sitting in a strip at the top of the screen. The choice
// is the only thing to make on this screen, so it is the screen: the options
// full size in the middle, or, in a project that has none, one large + and
// nothing else to mistake for the way forward.

import { useCallback, useState } from 'react'
import OptionList from './OptionList.jsx'

export default function OptionChooser({ projectId, refreshKey, onSelectOption }) {
  // Null until the list has loaded, so neither caption flashes before it's
  // known which one is true.
  const [count, setCount] = useState(null)
  const onCount = useCallback((n) => setCount(n), [])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        boxSizing: 'border-box',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 15, color: '#666', textAlign: 'center', minHeight: 20 }}>
        {count == null ? '' : count > 0 ? 'Open an option, or start a new one.' : 'This project has no options yet.'}
      </div>

      {/* One row: the options, then the + at the right end of them. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          maxWidth: 720,
          minWidth: 0,
        }}
      >
        <OptionList
          variant="large"
          projectId={projectId}
          refreshKey={refreshKey}
          selectedOptionId={null}
          onSelectOption={onSelectOption}
          onCount={onCount}
        />
      </div>
    </div>
  )
}
