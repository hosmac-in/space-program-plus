// Tree-canvas specifics: how a section's tree becomes React Flow nodes.
//
// The box geometry itself is shared with the option Canvas tab — see
// ui/canvas/canvasLayout.js. Only what's unique to this tab lives here.

import { functionColours } from '../../data/functions.js'
import {
  BUILDING_GAP,
  BUILDING_LABEL_HEIGHT,
  layoutGroupBox,
  layoutRowBox,
  layoutSectionBox,
  NODE_WIDTH,
  PADDING,
} from '../canvas/canvasLayout.js'

export { LABEL_HEIGHT, NODE_WIDTH, PADDING } from '../canvas/canvasLayout.js'

// Shorter than the option canvas's cards, which also carry an area figure.
export const NODE_HEIGHT = 60

export function describeMove(entityName, fromName, toName) {
  if (!fromName && toName) return `Added ${entityName} to ${toName}`
  if (fromName && !toName) return `Removed ${entityName} from ${fromName}`
  if (fromName && toName) return `Moved ${entityName} from ${fromName} to ${toName}`
  return `Updated ${entityName}`
}

// Buildings, sections and groups are standalone canvas nodes; a department
// exists only as a node inside a group's departments[].
//
// Buildings stack DOWN the canvas and their sections run across inside them, so
// each building is a full-width band and reading top to bottom is reading
// building by building. Building boxes are drawn from sp_building, not from
// anything in the tree — a building has no tree of its own, it is what a
// section belongs to (see data/tree.js).
//
// Every React Flow node id here IS the tree node's instance_id — one specific
// placement. There is no derived id scheme, and nothing is keyed by a
// definition id, which is what keeps two placements of the same duplicable
// department independent on the canvas (see data/tree.js). Buildings and
// sections are the exception, and may be: neither is ever duplicated, so its
// own row id already identifies exactly one of them.
export function buildTreeLayout(
  { sections, groups, departments, buildings = [], functions, canEdit },
  selectedDeptInstanceId,
  cb,
  stableSectionWidths,
  stableBuildingHeights,
  // Which building's band is selected, if any. Departments and buildings are
  // selected on this canvas but never both — see App. Last, so the existing
  // positional arguments keep their places.
  selectedBuildingId
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

  // Nothing moves once placed. Sections keep a fixed row inside their building
  // and their x only ever grows; buildings keep a fixed column and their y only
  // ever grows — the caller floors both at their historical maximum. Without
  // those floors, removing a department would narrow its section and slide
  // every section to its right, or shorten its building and drag every building
  // below it upwards.
  const sectionWidths = new Map()
  const buildingHeights = new Map()
  let runningY = PADDING

  // Sections are laid out per building, so a section's own width floor is
  // applied here, before the band around it is measured.
  const widthOf = (item) => Math.max(item.sectionLayout.width, stableSectionWidths?.get(item.section.id) ?? 0)

  // Measured before anything is emitted, because every band is drawn at the
  // width of the widest so that every building's rule is the same length. They
  // are stacked in a column and the rule is the only edge a building has:
  // ragged ones read as a measurement of the building rather than as the
  // heading they are, and a short one crops its own title.
  const bands = buildings.map((building) => {
    const own = items.filter((item) => item.section.building_id === building.id)
    return {
      building,
      own,
      band: layoutRowBox(
        own.map((item) => ({ ...item.sectionLayout, width: widthOf(item) })),
        BUILDING_LABEL_HEIGHT
      ),
    }
  })

  // Only the drawn width is shared. Each band's sections keep their own
  // positions, so a narrow building simply has empty space to its right.
  const bandWidth = bands.length ? Math.max(...bands.map((b) => b.band.width)) : 0

  bands.forEach(({ building, own, band }) => {
    const height = Math.max(band.height, stableBuildingHeights?.get(building.id) ?? 0)
    buildingHeights.set(building.id, band.height)

    const buildingX = 0
    const buildingY = runningY

    nodes.push({
      id: `buildingbox-${building.id}`,
      type: 'tBuildingBox',
      position: { x: buildingX, y: buildingY },
      width: bandWidth,
      height,
      style: { width: bandWidth, height },
      zIndex: 0,
      draggable: false,
      selectable: false,
      data: {
        buildingId: building.id,
        name: building.name,
        isEmpty: own.length === 0,
        canEdit,
        // A building band is selectable on this tab, unlike on the Project
        // canvas: it is the only way to reach its grossing factors, which live
        // on sp_building and are part of the catalog like everything else here.
        isSelected: selectedBuildingId === building.id,
        onSelect: () => cb.onSelectBuilding?.(building.id),
        colours: functionColours(functions, building.function_id),
      },
    })

    band.placed.forEach((sb, sIdx) => {
      const { section, sectionLayout } = own[sIdx]
      const width = widthOf(own[sIdx])
      sectionWidths.set(section.id, sectionLayout.width)

      const sectionX = buildingX + sb.x
      const sectionY = buildingY + sb.y

      nodes.push({
        id: `sectionbox-${section.id}`,
        type: 'tSectionBox',
        position: { x: sectionX, y: sectionY },
        width,
        height: sectionLayout.height,
        style: { width, height: sectionLayout.height },
        zIndex: 10,
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
          position: { x: sectionX + gb.x, y: sectionY + gb.y },
          width: gb.width,
          height: gb.height,
          style: { width: gb.width, height: gb.height },
          zIndex: 20,
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
            // A real React Flow child of its group box, so `position` is
            // relative to the parent and dragging a group carries its
            // departments along. Deliberately no `extent: 'parent'` — a
            // department must be draggable out past its group's bounds to
            // reach another group.
            position: { x, y },
            parentNode: groupBoxId,
            parentId: groupBoxId,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            zIndex: 30,
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
    })

    runningY += height + BUILDING_GAP
  })

  return { nodes, sectionWidths, buildingHeights }
}
