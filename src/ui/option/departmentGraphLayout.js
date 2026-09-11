// Option-canvas specifics: mirrors the catalog tree, marking each
// department either "real" (in this option) or "ghost" (available to add).
//
// The box geometry itself is shared with the Tree tab — see
// ui/canvas/canvasLayout.js. A padding fix once landed on that side only and
// the two tabs inset their cards differently for weeks; keep it shared.

import { functionColours } from '../../data/functions.js'
import { buildingAreaSqft } from '../../data/optionData.js'
import { compareSections } from '../../data/tree.js'
import {
  BUILDING_GAP,
  BUILDING_LABEL_HEIGHT,
  CORE_GAP,
  layoutGroupBox,
  layoutRowBox,
  layoutSectionBox,
  PADDING,
} from '../canvas/canvasLayout.js'

export { NODE_WIDTH } from '../canvas/canvasLayout.js'

// Taller than the Tree tab's cards: these also carry an area figure.
export const NODE_HEIGHT = 90

// A GHOST IS SHORTER. It carries a name and nothing else — no area, no phase
// strips — so at the full height it was mostly empty space, and a group of them
// pushed everything below it down the canvas for nothing.
//
// THE HEIGHT IS THE + AND ITS INSET, NOTHING ELSE: 1px border, 4px, the 18px
// button, 4px, 1px. The button sits at the same top-right inset the × has on a
// real card, so squaring the bottom inset to match is what makes it read as
// centred — centring it by hand instead would put it off that shared grid.
export const GHOST_NODE_HEIGHT = 28
const TOP_GAP = 60

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

// ONE CARD TRAVELS, THE REST STEP ASIDE AS IT REACHES THEM.
//
// Adding a department makes it real, which moves it out of the ghosts and up
// its group; removing one sends it down. Sliding every affected card at once
// said "the list is different now"; this says "this card went there", which is
// the only question being asked.
//
// The card that changed rank by more than one slot is the traveller. Everything
// else in that same container moves by exactly one, and each starts as the
// traveller draws level with it — so the gap opens ahead of it, one card at a
// time, instead of all at once.
//
// Pure: takes the nodes and the two arrangements, returns nodes carrying their
// own transition plus how long the whole thing runs.
export function applyMotion(nodes, order, previous, { step = 110, base = 240 } = {}) {
  if (!previous || !order) return { nodes, duration: 0 }

  const moved = new Map()
  order.forEach((rank, key) => {
    const was = previous.get(key)
    if (was != null && was !== rank) moved.set(key, { was, now: rank })
  })
  if (moved.size === 0) return { nodes, duration: 0 }

  const containerOf = (key) => key.slice(0, key.lastIndexOf(':'))
  const timing = new Map()
  let duration = 0
  const at = (key, delay, span) => {
    const existing = timing.get(key)
    // A card can be passed by only one traveller; if two claim it, the earlier
    // is the one that reaches it first.
    if (!existing || delay < existing.delay) timing.set(key, { delay, duration: span })
    duration = Math.max(duration, delay + span)
  }

  moved.forEach(({ was, now }, key) => {
    if (Math.abs(now - was) <= 1) return
    const span = Math.abs(now - was)
    at(key, 0, span * step + base)

    const up = now < was
    moved.forEach(({ was: theirs }, other) => {
      if (other === key || containerOf(other) !== containerOf(key)) return
      // How far the traveller has gone when it draws level with this card.
      const reached = up ? was - 1 - theirs : theirs - was - 1
      if (reached >= 0) at(other, reached * step, base)
    })
  })

  // A card nothing explains — an arrangement that shifted for some other reason
  // — simply moves. Never touches one already timed above.
  moved.forEach((_, key) => {
    if (!timing.has(key)) at(key, 0, base)
  })

  return {
    nodes: nodes.map((n) => {
      const t = n.orderKey && timing.get(n.orderKey)
      if (!t) return n
      return {
        ...n,
        style: {
          ...n.style,
          // Inline, so it beats .spp-option-canvas's blanket transition — which
          // stays the default for everything this leaves alone.
          transition: `transform ${t.duration}ms cubic-bezier(0.2, 0.8, 0.2, 1) ${t.delay}ms`,
        },
      }
    }),
    duration,
  }
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
  // THE ARRANGEMENT TO HOLD, or null for the real one. An add or a remove
  // changes what is a ghost, and a ghost is partitioned to the end — so the card
  // that changed would grow and move in the same frame, and the move is the part
  // that has to be watched. DepartmentGraph hands back the order that is
  // currently on screen, the card changes height where it stands, and only then
  // is this dropped and everything slides. See REORDER_DELAY_MS there.
  frozenOrder = null,
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
  // THE CATALOG'S ORDER, WITH THE GHOSTS PUSHED TO THE END. Sections by
  // sp_section.sort_order, groups and departments in the order their arrays
  // hold them — all three arranged on the Tree tab and never here. What is IN
  // the option keeps that order among itself; what is not trails it, out of the
  // way of the thing being read.
  //
  // Sections run across a building, so their ghosts go to the RIGHT; groups and
  // departments stack down, so theirs go to the BOTTOM. Same rule, two axes.
  //
  // Every sort here is a stable partition — a two-way comparison and nothing
  // else — so the authored order survives inside each half. Anything that
  // compares further (this canvas once sorted departments by area) reorders
  // cards as an option is filled in, and the same building then reads
  // differently on the two tabs.
  const ghostsLast = (a, b) => (a === b ? 0 : a ? -1 : 1)
  const heightOfEntry = (entry) => (entry.isReal || phaseCount > 1 ? NODE_HEIGHT : GHOST_NODE_HEIGHT)

  // One list, sorted either by where the ghosts belong or by where the cards
  // currently are. Both are stable, so the catalog's order holds underneath.
  // Anything the frozen order has never seen sorts last, which is where a
  // newly-placed card would have gone anyway.
  // Keys must match the ones `order` records below, or a held arrangement holds
  // nothing.
  const sectionKey = (section) => `sec:${section.building_id}:${section.id}`
  const groupKey = (section, gb) => `grp:${section.id}:${gb.groupNode.instance_id}`
  const deptKey = (groupNode, entry) => `dep:${groupNode.instance_id}:${entry.treeNodeId}`

  const arrange = (list, keyOf, isRealOf) =>
    frozenOrder
      ? [...list].sort((a, b) => (frozenOrder.get(keyOf(a)) ?? Infinity) - (frozenOrder.get(keyOf(b)) ?? Infinity))
      : [...list].sort((a, b) => ghostsLast(isRealOf(a), isRealOf(b)))

  const itemsInCatalogOrder = [...sections]
    .sort(compareSections)
    .map((section) => {
      const groupLayoutsInCatalogOrder = (section.tree?.groups || [])
        .map((groupNode) => {
          const group = groups.find((g) => g.id === groupNode.group_def_id)
          if (!group) return null
          const entries = (groupNode.departments || [])
            .map((deptNode) => {
              const def = departmentDefs.find((d) => d.id === deptNode.department_def_id)
              return def ? makeEntry(def, deptNode.instance_id) : null
            })
            .filter(Boolean)
          const ordered = arrange(entries, (e) => deptKey(groupNode, e), (e) => e.isReal)
          return { groupNode, group, entries: ordered, ...layoutGroupBox(ordered, heightOfEntry) }
        })
        .filter(Boolean)
      // A group is a ghost when nothing in it has been added.
      const groupLayouts = arrange(
        groupLayoutsInCatalogOrder,
        (gb) => groupKey(section, gb),
        (gb) => gb.entries.some((e) => e.isReal)
      )

      const entries = groupLayouts.flatMap((gb) => gb.entries)
      return {
        section,
        groupLayouts,
        sectionLayout: layoutSectionBox(groupLayouts),
        inOption: sectionIds.includes(section.id),
        hasReal: entries.some((e) => e.isReal),
      }
    })

  // Sections in the option first, the ghosts trailing to the right — the same
  // rule, one level up. Stable, so sort_order holds inside each half.
  const items = arrange(itemsInCatalogOrder, (item) => sectionKey(item.section), (item) => item.inOption)

  // What is on screen once this layout is drawn: every card's rank among its
  // SIBLINGS, keyed by container then by itself. The container is in the key
  // because the stagger (applyMotion) has to know which cards a travelling one
  // actually passes — two groups shifting at once are unrelated events.
  const order = new Map()
  items.forEach((item, si) => {
    order.set(`sec:${item.section.building_id}:${item.section.id}`, si)
    item.groupLayouts.forEach((gb, gi) => {
      order.set(`grp:${item.section.id}:${gb.groupNode.instance_id}`, gi)
      gb.entries.forEach((e, ei) => order.set(`dep:${gb.groupNode.instance_id}:${e.treeNodeId}`, ei))
    })
  })

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
  //
  // The core section (sp_section.is_core) is drawn in a gutter to the LEFT of
  // the band, outside it — see the same split in ui/tree/treeLayout.js. It is
  // what a building always has, not one of the sections someone added to it.
  const buildingItems = buildings
    .filter((building) => buildingIds.includes(building.id))
    .map((building) => {
      const mine = items.filter((item) => item.section.building_id === building.id)
      const core = mine.find((item) => item.section.is_core) || null
      const own = mine.filter((item) => item !== core)
      return {
        building,
        core,
        items: own,
        buildingLayout: layoutRowBox(own.map((item) => item.sectionLayout), BUILDING_LABEL_HEIGHT),
        entries: own.concat(core || []).flatMap(entriesOf),
      }
    })

  // One gutter width for the whole canvas, so every band starts at the same x.
  // Cores are right-aligned in it, which keeps the gap to the band constant.
  const coreWidth = Math.max(0, ...buildingItems.map((b) => b.core?.sectionLayout.width || 0))
  const gutter = coreWidth ? coreWidth + CORE_GAP : 0
  const CONTENT_TOP = BUILDING_LABEL_HEIGHT + PADDING

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
    position: { x: gutter, y: 0 },
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

  buildingItems.forEach((bItem) => {
    // The building DEF id is the node id, unlike groups below — a building
    // appears at most once in an option, so there is no placement to
    // disambiguate. See the note in data/optionData.js on why that holds.
    const buildingNodeId = `buildingbox-${bItem.building.id}`
    const buildingColours = functionColours(functions, bItem.building.function_id)
    // Every band starts past the gutter, so their headers line up down the page.
    const buildingX = gutter
    const buildingY = runningY
    // A core taller than every section in the row still has to fit inside the
    // band's advance, or the next building climbs over it.
    const bandHeight = Math.max(
      bItem.buildingLayout.height,
      bItem.core ? CONTENT_TOP + bItem.core.sectionLayout.height : 0
    )

    nodes.push({
      id: buildingNodeId,
      type: 'buildingBox',
      position: { x: buildingX, y: buildingY },
      width: bandWidth,
      height: bandHeight,
      style: { width: bandWidth, height: bandHeight },
      zIndex: 0,
      draggable: false,
      selectable: false,
      data: {
        name: bItem.building.name,
        colours: buildingColours,
        gutter,
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
    // The core and the band's sections are emitted by the same code — only
    // where they sit differs.
    const emitSection = (item, sectionX, sectionY) => {
      const sectionNodeId = `sectionbox-${item.section.id}`
      const entries = entriesOf(item)
      const sectionColours = functionColours(functions, item.section.function_id)
      const sectionIsGhost = !item.inOption

      nodes.push({
        id: sectionNodeId,
        // Its place in `order`, so applyMotion can time this node without
        // parsing its id back apart.
        orderKey: sectionKey(item.section),
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
          orderKey: groupKey(item.section, gb),
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

        gb.childPositions.forEach(({ entry, x, y, height }) => {
          nodes.push({
            // KEYED BY THE PLACEMENT, not by where it happens to sit. These ids
            // were a running counter, which meant a card's id changed the moment
            // anything above it moved — React Flow then reused that DOM node for
            // a different department, and the slide in index.css animated
            // nothing while the contents swapped underneath it.
            //
            // tree_node_id is the catalog placement this card is drawn from, and
            // one card is drawn per placement — see data/tree.js on identity.
            id: `dept-${entry.treeNodeId}`,
            orderKey: deptKey(gb.groupNode, entry),
            type: 'department',
            position: { x: groupX + x, y: groupY + y },
            zIndex: 30,
            draggable: false,
            data: {
              ...entry,
              // The slot the layout gave it — the card must draw at exactly that
              // height or the stack below it no longer lines up.
              height,
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
    }

    bItem.buildingLayout.placed.forEach((sb, sIdx) =>
      emitSection(bItem.items[sIdx], buildingX + sb.x, buildingY + sb.y)
    )
    if (bItem.core) {
      emitSection(
        bItem.core,
        gutter - CORE_GAP - bItem.core.sectionLayout.width,
        buildingY + CONTENT_TOP
      )
    }

    runningY += bandHeight + BUILDING_GAP
  })

  return { nodes, order }
}
