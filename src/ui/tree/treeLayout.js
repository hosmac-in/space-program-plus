// Tree-canvas specifics: how a section's tree becomes React Flow nodes.
//
// The box geometry itself is shared with the option Canvas tab — see
// ui/canvas/canvasLayout.js. Only what's unique to this tab lives here.

import { functionColours } from '../../data/functions.js'
import { GAP, layoutGroupBox, layoutSectionBox, NODE_WIDTH, PADDING } from '../canvas/canvasLayout.js'

export { LABEL_HEIGHT, NODE_WIDTH, PADDING } from '../canvas/canvasLayout.js'

// Shorter than the option canvas's cards, which also carry an area figure.
export const NODE_HEIGHT = 60

export function describeMove(entityName, fromName, toName) {
  if (!fromName && toName) return `Added ${entityName} to ${toName}`
  if (fromName && !toName) return `Removed ${entityName} from ${fromName}`
  if (fromName && toName) return `Moved ${entityName} from ${fromName} to ${toName}`
  return `Updated ${entityName}`
}

// Only sections are standalone canvas nodes. A group exists only as a node
// inside some section's tree.groups[]; a department only inside a group's
// departments[].
//
// Every React Flow node id here IS the tree node's instance_id — one specific
// placement. There is no derived id scheme, and nothing is keyed by a
// definition id, which is what keeps two placements of the same duplicable
// department independent on the canvas (see data/tree.js).
export function buildTreeLayout(
  { sections, groups, departments, functions, canEdit },
  selectedDeptInstanceId,
  cb,
  stableSectionWidths
) {
  const groupById = new Map(groups.map((g) => [g.id, g]))
  const deptById = new Map(departments.map((d) => [d.id, d]))
  const nodes = []

  const items = [...sections]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((section) => {
      const groupLayouts = (section.tree?.groups || [])
        .map((groupNode) => ({ groupNode, groupDef: groupById.get(groupNode.group_def_id) }))
        .filter((e) => e.groupDef)
        .sort((a, b) => a.groupDef.name.localeCompare(b.groupDef.name))
        .map(({ groupNode, groupDef }) => {
          const deptEntries = (groupNode.departments || [])
            .map((deptNode) => ({ deptNode, deptDef: deptById.get(deptNode.department_def_id) }))
            .filter((e) => e.deptDef)
            .sort((a, b) => a.deptDef.name.localeCompare(b.deptDef.name))
          return { groupNode, groupDef, ...layoutGroupBox(deptEntries, NODE_HEIGHT) }
        })
      return { section, sectionLayout: layoutSectionBox(groupLayouts) }
    })

  // Sections never move once placed: y is a fixed row, and x only ever grows,
  // because the caller floors each width at its historical maximum. Without
  // that floor, removing a department would narrow a section and slide every
  // section to its right.
  const sectionWidths = new Map()
  let runningX = 0
  const sectionY = PADDING

  items.forEach(({ section, sectionLayout }) => {
    const width = Math.max(sectionLayout.width, stableSectionWidths?.get(section.id) ?? 0)
    sectionWidths.set(section.id, sectionLayout.width)

    nodes.push({
      id: `sectionbox-${section.id}`,
      type: 'tSectionBox',
      position: { x: runningX, y: sectionY },
      width,
      height: sectionLayout.height,
      style: { width, height: sectionLayout.height },
      zIndex: 0,
      draggable: false,
      selectable: false,
      data: {
        sectionId: section.id,
        name: section.name,
        isEmpty: sectionLayout.isEmpty,
        canEdit,
        colours: functionColours(functions, section.function_id),
      },
    })

    sectionLayout.placed.forEach((gb) => {
      const groupBoxId = gb.groupNode.instance_id
      nodes.push({
        id: groupBoxId,
        type: 'tGroupBox',
        position: { x: runningX + gb.x, y: sectionY + gb.y },
        width: gb.width,
        height: gb.height,
        style: { width: gb.width, height: gb.height },
        zIndex: 10,
        draggable: canEdit,
        dragHandle: '.group-drag-handle',
        selectable: false,
        data: {
          groupDefId: gb.groupDef.id,
          name: gb.groupDef.name,
          isEmpty: gb.isEmpty,
          sectionId: section.id,
          canEdit,
          colours: functionColours(functions, gb.groupDef.function_id),
          onRemove: canEdit ? () => cb.onRemoveGroup(groupBoxId) : null,
        },
      })

      gb.childPositions.forEach(({ entry, x, y }) => {
        const nodeId = entry.deptNode.instance_id
        nodes.push({
          id: nodeId,
          type: 'tDepartment',
          // A real React Flow child of its group box, so `position` is relative
          // to the parent and dragging a group carries its departments along.
          // Deliberately no `extent: 'parent'` — a department must be draggable
          // out past its group's bounds to reach another group.
          position: { x, y },
          parentNode: groupBoxId,
          parentId: groupBoxId,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          zIndex: 20,
          draggable: canEdit,
          selectable: false,
          data: {
            defId: entry.deptDef.id,
            name: entry.deptDef.name,
            groupInstanceId: groupBoxId,
            canEdit,
            colours: functionColours(functions, entry.deptDef.function_id),
            isHighlighted: nodeId === selectedDeptInstanceId,
            // Selecting stays available to everyone — that's how a read-only
            // viewer browses a department's rooms.
            onSelect: () => cb.onSelectDepartment(entry.deptDef.id, nodeId),
            onRemove: canEdit ? () => cb.onRemoveDepartment(nodeId) : null,
          },
        })
      })
    })

    runningX += width + GAP
  })

  return { nodes, sectionWidths }
}
