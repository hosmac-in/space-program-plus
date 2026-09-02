// Option-canvas specifics: mirrors the catalog tree, marking each
// department either "real" (in this option) or "ghost" (available to add).
//
// The box geometry itself is shared with the Tree tab — see
// ui/canvas/canvasLayout.js. A padding fix once landed on that side only and
// the two tabs inset their cards differently for weeks; keep it shared.

import { functionColours } from '../../data/functions.js'
import { GAP, layoutGroupBox, layoutSectionBox, NODE_WIDTH } from '../canvas/canvasLayout.js'

export { NODE_WIDTH } from '../canvas/canvasLayout.js'

// Taller than the Tree tab's cards: these also carry an area figure.
export const NODE_HEIGHT = 90
const TOP_GAP = 60

// Real first, then smallest to largest, then alphabetical.
function compareDeptEntries(a, b) {
  if (a.isReal !== b.isReal) return a.isReal ? -1 : 1
  const areaDiff = (a.areaSqft ?? 0) - (b.areaSqft ?? 0)
  return areaDiff !== 0 ? areaDiff : a.name.localeCompare(b.name)
}

// A ghost's dashed edge and label take their colour from the surface behind
// them, which is decided by what has been added above it:
//
//   inside a real group    the group's body is its full function colour, so use
//                          the text colour that colour was paired with
//   inside a ghost group   that group is only an outline on the section's pale
//                          tint, so use the dark version of the section's hue
//   inside a ghost section nothing above it is painted at all — plain grey,
//                          which is CanvasCard's own default
//
// A single fixed colour cannot do this: it was grey, which disappeared on a
// dark group; the group's text colour alone is white, which disappeared on the
// white of an unadded section.
function ghostInkFor({ sectionIsGhost, groupIsGhost, sectionColours, groupColours }) {
  if (sectionIsGhost) return undefined
  return groupIsGhost ? sectionColours.inverted.color : groupColours.color
}

export function buildLayout({
  optionName,
  departmentDefs,
  departments,
  perDepartment,
  groups,
  sections,
  // The section ids this option holds. A section is in the option because it
  // was added, never because something inside it was — that's what lets an
  // option keep a section it has emptied, or one the catalog leaves empty.
  sectionIds = [],
  functions,
  selectedDeptInstanceId,
  onClick,
  onSelectContainer,
  selection,
  onAdd,
  onAddSection,
  onRequestRemoveSection,
  onRequestRemove,
}) {
  // Keyed by tree node, never by definition id. That is what lets one
  // department definition placed twice in the catalog appear as two
  // independently addable, removable and highlightable cards.
  const realByNode = new Map()
  departments.forEach((d, i) => {
    if (d.treeNodeId) realByNode.set(d.treeNodeId, { ...perDepartment[i], instanceId: d.instanceId })
  })

  function makeEntry(def, treeNodeId) {
    const real = realByNode.get(treeNodeId)
    return {
      defId: def.id,
      treeNodeId,
      name: def.name,
      colours: functionColours(functions, def.function_id),
      isReal: !!real,
      instanceId: real?.instanceId,
      roomCount: real?.roomCount ?? 0,
      objectCount: real?.objectCount ?? 0,
      areaSqft: real?.areaSqft ?? 0,
    }
  }

  // Only sections may be ghosts. A group or department with no parent isn't
  // drawn at all — this view can't place one (that's the Tree tab's job).
  // Every section is drawn even when empty, so the full set is always visible.
  const items = [...sections]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((section) => {
      const groupLayouts = (section.tree?.groups || [])
        .map((groupNode) => {
          const group = groups.find((g) => g.id === groupNode.group_def_id)
          if (!group) return null
          const entries = (groupNode.departments || [])
            .map((deptNode) => {
              const def = departmentDefs.find((d) => d.id === deptNode.department_def_id)
              return def ? makeEntry(def, deptNode.instance_id) : null
            })
            .filter(Boolean)
            .sort(compareDeptEntries)
          return { groupNode, group, entries, ...layoutGroupBox(entries, NODE_HEIGHT) }
        })
        .filter(Boolean)

      const entries = groupLayouts.flatMap((gb) => gb.entries)
      return {
        section,
        groupLayouts,
        sectionLayout: layoutSectionBox(groupLayouts),
        inOption: sectionIds.includes(section.id),
        hasReal: entries.some((e) => e.isReal),
      }
    })

  // Sections in this option stack first; the rest trail after. A stable sort
  // keeps each partition alphabetical.
  items.sort((a, b) => (a.inOption === b.inOption ? 0 : a.inOption ? -1 : 1))

  const nodes = []
  const edges = []
  const totalWidth = items.reduce((sum, item) => sum + item.sectionLayout.width + GAP, -GAP) || NODE_WIDTH

  nodes.push({
    id: 'root',
    type: 'root',
    position: { x: Math.max(0, (totalWidth - NODE_WIDTH) / 2), y: 0 },
    data: { name: optionName || 'Program' },
    draggable: false,
    selectable: false,
  })

  const ghostsOf = (entries) =>
    entries.filter((e) => !e.isReal).map((e) => ({ defId: e.defId, treeNodeId: e.treeNodeId }))
  const realAreaOf = (entries) => entries.reduce((sum, e) => sum + (e.isReal ? e.areaSqft : 0), 0)

  let runningX = 0
  const topY = NODE_HEIGHT + TOP_GAP
  let deptIdCounter = 0

  items.forEach((item) => {
    const sectionNodeId = `sectionbox-${item.section.id}`
    const entries = item.groupLayouts.flatMap((gb) => gb.entries)
    const sectionColours = functionColours(functions, item.section.function_id)
    const sectionIsGhost = !item.inOption

    nodes.push({
      id: sectionNodeId,
      type: 'sectionBox',
      position: { x: runningX, y: topY },
      width: item.sectionLayout.width,
      height: item.sectionLayout.height,
      style: { width: item.sectionLayout.width, height: item.sectionLayout.height },
      zIndex: 0,
      draggable: false,
      selectable: false,
      data: {
        name: item.section.name,
        colours: sectionColours,
        isGhost: sectionIsGhost,
        isSelected: selection?.kind === 'section' && selection.id === item.section.id,
        onSelect: () => onSelectContainer({ kind: 'section', id: item.section.id, name: item.section.name }),
        totalAreaSqft: realAreaOf(entries),
        // Added as a section, then filled in by hand — so the add button is
        // gone the moment it's in, and a × takes its place.
        onAdd: sectionIsGhost ? () => onAddSection(item.section.id) : null,
        onRemove: sectionIsGhost
          ? null
          : () => onRequestRemoveSection(item.section.id, item.section.name, entries.filter((e) => e.isReal).length),
      },
    })
    edges.push({ id: `root-${sectionNodeId}`, source: 'root', target: sectionNodeId, type: 'smoothstep' })

    item.sectionLayout.placed.forEach((gb) => {
      const groupGhosts = ghostsOf(gb.entries)
      const groupX = runningX + gb.x
      const groupY = topY + gb.y
      const groupColours = functionColours(functions, gb.group.function_id)
      const groupIsGhost = groupGhosts.length === gb.entries.length
      const deptGhostInk = ghostInkFor({ sectionIsGhost, groupIsGhost, sectionColours, groupColours })

      nodes.push({
        // The group DEF id can repeat across sections, so the node id is keyed
        // by the group's placement instance instead.
        id: `groupbox-${gb.groupNode.instance_id}`,
        type: 'groupBox',
        position: { x: groupX, y: groupY },
        width: gb.width,
        height: gb.height,
        style: { width: gb.width, height: gb.height },
        zIndex: 10,
        draggable: false,
        selectable: false,
        data: {
          name: gb.group.name,
          colours: groupColours,
          isGhost: groupIsGhost,
          isSelected: selection?.kind === 'group' && selection.id === gb.groupNode.instance_id,
          onSelect: () =>
            onSelectContainer({ kind: 'group', id: gb.groupNode.instance_id, name: gb.group.name }),
          // A group with nothing added is a ghost on the section's tint, so it
          // takes the same treatment its own ghost departments do.
          ghostInk: sectionIsGhost ? undefined : sectionColours.inverted.color,
          totalAreaSqft: realAreaOf(gb.entries),
          // No add-all on a group: its cards are all visible at once, so the
          // button earned nothing. Sections keep theirs — see the section node
          // above, and the note at the top of DepartmentGraph.jsx.
        },
      })

      gb.childPositions.forEach(({ entry, x, y }) => {
        deptIdCounter += 1
        nodes.push({
          id: `dept-${deptIdCounter}`,
          type: 'department',
          position: { x: groupX + x, y: groupY + y },
          zIndex: 20,
          draggable: false,
          data: {
            ...entry,
            ghostInk: deptGhostInk,
            isHighlighted: !!entry.treeNodeId && entry.treeNodeId === selectedDeptInstanceId,
            onClick,
            onAdd,
            onRequestRemove,
          },
        })
      })
    })

    runningX += item.sectionLayout.width + GAP
  })

  return { nodes, edges }
}
