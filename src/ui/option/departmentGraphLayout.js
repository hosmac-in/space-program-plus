// Option-canvas specifics: mirrors the catalog tree, marking each
// department either "real" (in this option) or "ghost" (available to add).
//
// The box geometry itself is shared with the Tree tab — see
// ui/canvas/canvasLayout.js. A padding fix once landed on that side only and
// the two tabs inset their cards differently for weeks; keep it shared.

import { functionColours } from '../../data/functions.js'
import { buildingAreaSqft } from '../../data/optionData.js'
import {
  BUILDING_GAP,
  BUILDING_LABEL_HEIGHT,
  layoutGroupBox,
  layoutRowBox,
  layoutSectionBox,
} from '../canvas/canvasLayout.js'

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

// The same rule one level further down, for the phase strips inside a
// department card — a nesting level that only exists once an option is phased.
//
//   on a real card    the card is filled with the department's own pale wash, so
//                     the ink is the colour that wash was paired with
//   on a ghost card   the card paints nothing; the strips sit on whatever is
//                     behind IT, which is the answer ghostInkFor already gave
//
// Reading the group's ink on a real card is what this exists to prevent: the
// card is painted over the group, so the group's colour is no longer the one
// behind the strip.
function phaseGhostInkFor(entry, deptGhostInk) {
  return entry.isReal ? entry.colours.inverted.color : deptGhostInk
}

export function buildLayout({
  optionName,
  departmentDefs,
  departments,
  perDepartment,
  // How many phases this option has. A department card is divided into this
  // many strips, each independently in or out — see DepartmentGraph. 1 is the
  // unstaged option, and draws the card it always drew.
  phaseCount = 1,
  groups,
  sections,
  // The section ids this option holds. A section is in the option because it
  // was added, never because something inside it was — that's what lets an
  // option keep a section it has emptied, or one the catalog leaves empty.
  sectionIds = [],
  // The same argument one level up, and the same for buildings.
  buildings = [],
  buildingIds = [],
  // This option's per-building factor overrides. Only the FLOOR-area factor is
  // used here, on a building band's own total — the built-area one is already
  // inside every department figure that reaches this file (see
  // data/optionData.js).
  buildingFactors = {},
  functions,
  selectedDeptInstanceId,
  // Which phase strip of that placement is open in side. Together they
  // highlight exactly one strip; on a one-phase card the node id alone decides.
  selectedPhase,
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
  //
  // Then by phase within it: one placement holds up to one entry per phase, and
  // each is its own programmed thing with its own rooms. A card is one node; its
  // strips are the phases.
  const realByNode = new Map()
  departments.forEach((d, i) => {
    if (!d.treeNodeId) return
    const byPhase = realByNode.get(d.treeNodeId) ?? new Map()
    byPhase.set(d.phase, { ...perDepartment[i], instanceId: d.instanceId })
    realByNode.set(d.treeNodeId, byPhase)
  })

  function makeEntry(def, treeNodeId) {
    const byPhase = realByNode.get(treeNodeId)

    // One per declared phase, always — a strip is drawn whether or not anything
    // is in it, since an empty one is what you press to stage this department
    // there.
    const phases = Array.from({ length: phaseCount }, (_, i) => {
      const real = byPhase?.get(i + 1)
      return {
        phase: i + 1,
        isReal: !!real,
        instanceId: real?.instanceId,
        roomCount: real?.roomCount ?? 0,
        objectCount: real?.objectCount ?? 0,
        areaSqft: real?.areaSqft ?? 0,
      }
    })

    const real = phases.filter((p) => p.isReal)
    return {
      defId: def.id,
      treeNodeId,
      name: def.name,
      colours: functionColours(functions, def.function_id),
      phases,
      // The card as a whole: real if ANY phase of it is, and totalled across
      // them. That is what every figure above a department reads — the group,
      // section and building areas, the sort, and the remove confirmations —
      // and it stays the honest answer to "what does this department program".
      isReal: real.length > 0,
      instanceId: real[0]?.instanceId,
      roomCount: real.reduce((sum, p) => sum + p.roomCount, 0),
      objectCount: real.reduce((sum, p) => sum + p.objectCount, 0),
      areaSqft: real.reduce((sum, p) => sum + p.areaSqft, 0),
    }
  }

  // Only buildings and sections may be ghosts — those are the two things this
  // view adds. A group or department with no parent isn't drawn at all, since
  // this view can't place one (that's the Tree tab's job). Every section is
  // drawn even when empty, so the full set is always visible.
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

  const ghostsOf = (entries) =>
    entries.filter((e) => !e.isReal).map((e) => ({ defId: e.defId, treeNodeId: e.treeNodeId }))
  const realAreaOf = (entries) => entries.reduce((sum, e) => sum + (e.isReal ? e.areaSqft : 0), 0)
  const entriesOf = (item) => item.groupLayouts.flatMap((gb) => gb.entries)

  // Sections are grouped under their building, and the building is the only
  // thing that partitions the catalog — see sp_section.building_id.
  //
  // ONLY the buildings this option contains are drawn. Unlike sections, a
  // building is never a ghost here: which buildings an option has is chosen
  // when the option is created and edited in a dialog off the option chip (see
  // OptionList), not on the canvas. Drawing the rest as ghosts would offer an
  // add this canvas no longer performs.
  //
  // Driven off the `buildings` list, in its sort_order, rather than off distinct
  // building_ids in `sections` — so a building the option holds but has put
  // nothing in still draws, as the empty shell you fill in as you go.
  const buildingItems = buildings
    .filter((building) => buildingIds.includes(building.id))
    .map((building) => {
      const own = items.filter((item) => item.section.building_id === building.id)
      return {
        building,
        items: own,
        buildingLayout: layoutRowBox(own.map((item) => item.sectionLayout), BUILDING_LABEL_HEIGHT),
        entries: own.flatMap(entriesOf),
      }
    })

  const nodes = []

  // Buildings stack DOWN the canvas; sections run across inside each one. A
  // building is therefore a full-width band, and reading top to bottom is
  // reading building by building.
  //
  // The root sits at x 0, on the same line as every building heading below it,
  // so the whole canvas reads as one left-aligned column: the option's name,
  // then a building, then a building.
  //
  // No edges. They ran from the root to each section when sections fanned out
  // across the canvas and the picture was a tree. Stacked, every edge would
  // have to cut down through the bands above its target, crossing content to
  // say something the stacking already says.
  nodes.push({
    id: 'root',
    type: 'root',
    position: { x: 0, y: 0 },
    data: { name: optionName || 'Program' },
    draggable: false,
    selectable: false,
  })

  // Every band is drawn at the width of the widest, so every building's rule is
  // the same length. They are stacked in a column and the rule is the only edge
  // a building has: ragged ones read as a measurement of the building rather
  // than as the heading they are, and a short one crops its own title.
  //
  // Only the drawn width is shared. Each band's sections keep their own
  // positions, so a narrow building simply has empty space to its right.
  const bandWidth = buildingItems.length
    ? Math.max(...buildingItems.map((b) => b.buildingLayout.width))
    : 0

  let runningY = NODE_HEIGHT + TOP_GAP
  let deptIdCounter = 0

  buildingItems.forEach((bItem) => {
    // The building DEF id is the node id, unlike groups below — a building
    // appears at most once in an option, so there is no placement to
    // disambiguate. See the note in data/optionData.js on why that holds.
    const buildingNodeId = `buildingbox-${bItem.building.id}`
    const buildingColours = functionColours(functions, bItem.building.function_id)
    // Every band starts at the left edge, so their headers line up down the page.
    const buildingX = 0
    const buildingY = runningY

    nodes.push({
      id: buildingNodeId,
      type: 'buildingBox',
      position: { x: buildingX, y: buildingY },
      width: bandWidth,
      height: bItem.buildingLayout.height,
      style: { width: bandWidth, height: bItem.buildingLayout.height },
      zIndex: 0,
      draggable: false,
      selectable: false,
      data: {
        name: bItem.building.name,
        colours: buildingColours,
        isSelected: selection?.kind === 'building' && selection.id === bItem.building.id,
        onSelect: () =>
          onSelectContainer({ kind: 'building', id: bItem.building.id, name: bItem.building.name }),
        // The building's departments, then its floor-area factor once. Section
        // and group bands do not get it: it is a fact about a whole building,
        // and applying it to a part of one reports a figure nothing adds up to.
        totalAreaSqft: buildingAreaSqft(
          realAreaOf(bItem.entries),
          bItem.building,
          buildingFactors[bItem.building.id]
        ),
      },
    })
    bItem.buildingLayout.placed.forEach((sb, sIdx) => {
      const item = bItem.items[sIdx]
      const sectionNodeId = `sectionbox-${item.section.id}`
      const entries = entriesOf(item)
      const sectionColours = functionColours(functions, item.section.function_id)
      const sectionIsGhost = !item.inOption
      const sectionX = buildingX + sb.x
      const sectionY = buildingY + sb.y

      nodes.push({
        id: sectionNodeId,
        type: 'sectionBox',
        position: { x: sectionX, y: sectionY },
        width: item.sectionLayout.width,
        height: item.sectionLayout.height,
        style: { width: item.sectionLayout.width, height: item.sectionLayout.height },
        zIndex: 10,
        draggable: false,
        selectable: false,
        data: {
          name: item.section.name,
          colours: sectionColours,
          isGhost: sectionIsGhost,
          isSelected: selection?.kind === 'section' && selection.id === item.section.id,
          onSelect: () => onSelectContainer({ kind: 'section', id: item.section.id, name: item.section.name }),
          totalAreaSqft: realAreaOf(entries),
          // No ghostInk: a building paints nothing behind its sections — it is
          // a heading over a rule, not a box — so a ghost section always sits on
          // bare canvas and takes CanvasContainer's own grey. This is the same
          // rule ghostInkFor applies further down, at the top of the chain.
          //
          // Added as a section, then filled in by hand — so the add button is
          // gone the moment it's in, and a × takes its place. Adding it brings
          // its building too, which is why this works on a ghost building.
          onAdd: sectionIsGhost ? () => onAddSection(item.section.id) : null,
          onRemove: sectionIsGhost
            ? null
            : () =>
                onRequestRemoveSection(item.section.id, item.section.name, entries.filter((e) => e.isReal).length),
        },
      })

      item.sectionLayout.placed.forEach((gb) => {
        const groupGhosts = ghostsOf(gb.entries)
        const groupX = sectionX + gb.x
        const groupY = sectionY + gb.y
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
          zIndex: 20,
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
            zIndex: 30,
            draggable: false,
            data: {
              ...entry,
              phaseCount,
              selectedPhase,
              ghostInk: deptGhostInk,
              phaseGhostInk: phaseGhostInkFor(entry, deptGhostInk),
              // A department may only be added once its section is in the
              // option — addDepartments would otherwise drag the section in
              // behind it, which is the one direction this canvas should not
              // work in. The section's + is the only way into a ghost section.
              canAdd: !sectionIsGhost,
              isHighlighted: !!entry.treeNodeId && entry.treeNodeId === selectedDeptInstanceId,
              onClick,
              onAdd,
              onRequestRemove,
            },
          })
        })
      })
    })

    runningY += bItem.buildingLayout.height + BUILDING_GAP
  })

  return { nodes }
}
