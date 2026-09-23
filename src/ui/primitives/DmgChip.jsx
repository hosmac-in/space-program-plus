import { useCatalog } from '../../data/catalog.jsx'

// A GROUP'S DISEASE MANAGEMENT GROUP, as a chip — see data/dmg.js. Nothing for an
// untagged group (or one tagged `default`, which the catalog folds to untagged).
// It brings its own ground: it sits on function-coloured headers of any hue.
export default function DmgChip({ dmgId }) {
  const { dmgs } = useCatalog()
  if (!dmgId) return null
  return (
    <span
      title="Offered only when this disease management group is targeted"
      style={{
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.4,
        color: '#1a5c8a',
        background: '#e3f0fa',
        borderRadius: 4,
        padding: '1px 5px',
        whiteSpace: 'nowrap',
      }}
    >
      {dmgs.find((d) => d.id === dmgId)?.name ?? 'DMG'}
    </span>
  )
}
