// The Tree tab (admin only): drag groups and departments from the
// carousels into the section boxes to build the shared catalog tree.
//
// This file is wiring only — layout maths live in treeLayout.js, card
// markup in treeNodes.jsx, and every tree edit in useTreeEditor.jsx —
// which the rooms panel shares, so both columns feed one undo stack.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import ReactFlow, { Background, ReactFlowProvider, useNodesState, useReactFlow } from 'reactflow'
import CanvasFrame, { useCanvasInput } from '../canvas/CanvasFrame.jsx'
import 'reactflow/dist/style.css'
import { useCatalog } from '../../data/catalog.jsx'
import { buildTreeLayout, NODE_HEIGHT, NODE_WIDTH } from './treeLayout.js'
import { GAP } from '../canvas/canvasLayout.js'
import { CANVAS_STYLE, CarouselRow, nodeTypes } from './treeNodes.jsx'
import { useTreeEditorContext } from './useTreeEditor.jsx'
import { Band } from '../primitives/Band.jsx'

// Stable identity so React Flow doesn't see a new edge array every render. The
// tree draws containment by nesting boxes, so it has no edges at all.
const NO_EDGES = []

// Above every resting node (sections 0, groups 10, departments 20) while a drag
// is in flight.
const DRAG_Z = 1000

function byName(a, b) {
  return a.name.localeCompare(b.name)
}

function TreeCanvasInner({
  onSelectDepartment,
  selectedDeptInstanceId,
  onSelectBuilding,
  selectedBuildingId,
  canEdit,
}) {
  const { departments, groups, sections, functions, buildings } = useCatalog()
  const editor = useTreeEditorContext()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const { getIntersectingNodes, screenToFlowPosition } = useReactFlow()
  const canvasInput = useCanvasInput()

  const hoveredIdRef = useRef(null)
  const draggingCarouselRef = useRef(null)
  // What is in flight: where it started, and what rides with it. Null between
  // drags.
  const dragRef = useRef(null)
  const nodesRef = useRef([])
  const computedRef = useRef(null)
  // Section widths and building heights only ever grow. Without these floors,
  // removing a department would shrink its section and slide every section to
  // the right of it, or shorten its building and drag every building below it
  // upwards.
  const stableSectionWidthsRef = useRef(new Map())
  const stableBuildingHeightsRef = useRef(new Map())

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const onCardRemoveDept = useCallback((id) => editor.removeDept(id), [editor.removeDept])
  const onCardRemoveGroup = useCallback((id) => editor.removeGroup(id), [editor.removeGroup])

  const computed = useMemo(
    () =>
      buildTreeLayout(
        { sections, groups, departments, buildings, functions, canEdit },
        selectedDeptInstanceId,
        {
          onSelectDepartment,
          onSelectBuilding,
          onRemoveDepartment: onCardRemoveDept,
          onRemoveGroup: onCardRemoveGroup,
        },
        stableSectionWidthsRef.current,
        stableBuildingHeightsRef.current,
        selectedBuildingId
      ),
    [
      sections,
      groups,
      departments,
      buildings,
      functions,
      canEdit,
      selectedDeptInstanceId,
      selectedBuildingId,
      onSelectDepartment,
      onSelectBuilding,
      onCardRemoveDept,
      onCardRemoveGroup,
    ]
  )

  // Every node is nested inside a section by construction, so there are no
  // free-floating positions to preserve: any real data change snaps everything
  // back to its computed slot.
  useEffect(() => {
    hoveredIdRef.current = null
    computed.sectionWidths.forEach((width, sectionId) => {
      if (width > (stableSectionWidthsRef.current.get(sectionId) ?? 0)) {
        stableSectionWidthsRef.current.set(sectionId, width)
      }
    })
    computed.buildingHeights.forEach((height, buildingIdKey) => {
      if (height > (stableBuildingHeightsRef.current.get(buildingIdKey) ?? 0)) {
        stableBuildingHeightsRef.current.set(buildingIdKey, height)
      }
    })
    setNodes(computed.nodes)
    computedRef.current = computed
  }, [computed, setNodes])

  // --- Carousels ------------------------------------------------------------
  //
  // EVERY DEFINITION, ALWAYS, ALPHABETICALLY. Nothing is hidden, nothing is
  // dimmed, nothing is disabled, and nothing is reordered by what you have
  // already done.
  //
  // It used to hide a non-duplicable item once it was placed anywhere, which
  // made is_duplicable a trap rather than a convenience: place Lobby in the
  // Hospital and it was gone from the Medical College too, permanently, with no
  // way back short of editing the column in the database. The flag never
  // enforced anything — instance_id already keeps every placement independent,
  // and the only real guard is placeDept's "not twice in the same group".
  //
  // It then dimmed instead, scoped to a chosen "working" building. That scope
  // was the only thing the building chip row still decided, and it was a whole
  // control to answer a question the canvas answers better: every building is
  // stacked on screen, so what is placed where is visible by looking.
  //
  //   >>> is_duplicable decides nothing in this UI. It is authored data the
  //   >>> canvas no longer reads. Reintroducing a filter on it — hiding,
  //   >>> dimming, sorting — recreates the dead end.

  const byNameAsc = (list) => [...list].sort(byName)

  const groupItems = useMemo(() => byNameAsc(groups), [groups])
  const deptItems = useMemo(() => byNameAsc(departments), [departments])

  // --- Drag and drop --------------------------------------------------------
  //
  // A drag SHOWS the result before it commits: the cards it would displace move
  // aside as it crosses them, so the gap under the pointer is the slot it will
  // land in. A drop that lands somewhere is then never a surprise, which is what
  // made reordering by drag workable at all — the index alone was invisible
  // until the write came back.
  //
  // Everything here is preview only. Nothing is written until the drop, and
  // every previewed position is thrown away by resetPositions or by the reload
  // that follows a successful move.

  // Returns every card to its computed slot — the preview above included, which
  // is why this is not "snap one node back". Dragging a card onto empty canvas
  // deliberately does NOT remove it; that's what the × button is for.
  const resetPositions = useCallback(() => {
    const fresh = computedRef.current?.nodes
    if (!fresh) return
    const byId = new Map(fresh.map((n) => [n.id, n]))
    setNodes((current) =>
      current.map((n) => {
        const f = byId.get(n.id)
        return f ? { ...n, position: f.position } : n
      })
    )
  }, [setNodes])

  // The children of one container, in slot order, as the LAYOUT placed them —
  // never the live nodes, one of which is under the pointer and nowhere near its
  // slot.
  //
  // Each kind is measured along the axis it stacks on: sections run ACROSS a
  // building, groups and departments run DOWN. A department's position is
  // relative to its group (it is a real React Flow child), so its coordinates
  // stay in that space — `absolute` lifts them only where a hit test needs it.
  const childrenOf = useCallback((node, containerId) => {
    const all = computedRef.current?.nodes || []
    if (node.type === 'tSectionBox') {
      return {
        axis: 'x',
        size: (n) => n.width ?? NODE_WIDTH,
        items: all
          .filter((n) => n.type === 'tSectionBox' && n.data.buildingId === containerId && !n.data.isCore)
          .sort((a, b) => a.position.x - b.position.x),
      }
    }
    if (node.type === 'tGroupBox') {
      return {
        axis: 'y',
        size: (n) => n.height ?? NODE_HEIGHT,
        items: all
          .filter((n) => n.type === 'tGroupBox' && n.data.sectionId === containerId)
          .sort((a, b) => a.position.y - b.position.y),
      }
    }
    return {
      axis: 'y',
      size: () => NODE_HEIGHT,
      items: all
        .filter((n) => n.type === 'tDepartment' && n.parentNode === containerId)
        .sort((a, b) => a.position.y - b.position.y),
      // Relative to the group box, so a hit test has to add the parent's origin.
      absolute: (n) => {
        const parent = all.find((p) => p.id === n.parentNode)
        return { x: n.position.x + (parent?.position.x ?? 0), y: n.position.y + (parent?.position.y ?? 0) }
      },
    }
  }, [])

  // Re-lays one container's slots with the dragged card taken out and a gap
  // opened at `index`, and hands back the positions. Sizes vary — sections are
  // as wide as their content, groups as tall as theirs — so the slots are walked
  // cumulatively from the first one's origin rather than stepping by a pitch.
  //
  // `index` null closes the gap instead: that is the home container of a card
  // now hovering somewhere else.
  const slotPositions = useCallback((node, containerId, index) => {
    const { axis, size, items } = childrenOf(node, containerId)
    if (items.length === 0) return []

    const origin = Math.min(...items.map((n) => n.position[axis]))
    const rest = items.filter((n) => n.id !== node.id)
    const order = index == null ? rest : [...rest.slice(0, index), node, ...rest.slice(index)]

    const out = []
    let at = origin
    order.forEach((n) => {
      if (n.id !== node.id) out.push({ id: n.id, axis, value: at })
      at += size(n) + GAP
    })
    return out
  }, [childrenOf])

  // React Flow renders child nodes as DOM siblings of their parent rather than
  // inside it, so stacking is global: lifting a dragged group above the rest of
  // the canvas also lifts it above the departments travelling inside it, which
  // then disappear behind it. Raise the whole family together, children one
  // step higher.
  const onNodeDragStart = useCallback(
    (event, node) => {
      const all = computedRef.current?.nodes || []
      // A SECTION CARRIES ITS CONTENTS. Its groups are not React Flow children
      // of it — every box is positioned absolutely — so nothing follows it
      // unless it is moved by hand. The departments do follow, being real
      // children of those groups.
      const carried =
        node.type === 'tSectionBox'
          ? all
              .filter((n) => n.type === 'tGroupBox' && n.data.sectionId === node.data.sectionId)
              .map((n) => ({ id: n.id, origin: { ...n.position } }))
          : []

      dragRef.current = {
        id: node.id,
        origin: { ...(all.find((n) => n.id === node.id)?.position ?? node.position) },
        carried,
      }

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === node.id) return { ...n, zIndex: DRAG_Z }
          if (n.parentNode === node.id) return { ...n, zIndex: DRAG_Z + 1, className: 'tree-follow' }
          // A carried group rides above the canvas too, with its own departments
          // one step higher again — same reason as a group's own children.
          if (carried.some((c) => c.id === n.id)) return { ...n, zIndex: DRAG_Z, className: 'tree-follow' }
          if (carried.some((c) => c.id === n.parentNode)) return { ...n, zIndex: DRAG_Z + 1, className: 'tree-follow' }
          return n
        })
      )
    },
    [setNodes]
  )

  // Drops the elevation and the tight-follow transition again. A successful
  // move reloads the catalog, which rebuilds every node from the layout
  // anyway; this is what cleans up after a drag that changed nothing (a nudge,
  // or a rejected move).
  // Drops the elevation and the tight-follow transition again, on every node
  // rather than on the dragged one: a section lifts its groups and their
  // departments too, and a class left behind on any of them makes the next
  // unrelated relayout snap instead of settle.
  const endDragStyling = useCallback(() => {
    const byId = new Map((computedRef.current?.nodes || []).map((n) => [n.id, n]))
    setNodes((nds) =>
      nds.map((n) => {
        if (!n.className && n.zIndex === byId.get(n.id)?.zIndex) return n
        return { ...n, zIndex: byId.get(n.id)?.zIndex ?? n.zIndex, className: undefined }
      })
    )
  }, [setNodes])

  const setDropTarget = useCallback(
    (nextId) => {
      const prevId = hoveredIdRef.current
      if (prevId === nextId) return
      hoveredIdRef.current = nextId
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nextId) return { ...n, data: { ...n.data, isDropTarget: true } }
          if (n.id === prevId) return { ...n, data: { ...n.data, isDropTarget: false } }
          return n
        })
      )
    },
    [setNodes]
  )

  const pulseTarget = useCallback(
    (targetId) => {
      const mark = (pulse) =>
        setNodes((nds) => nds.map((n) => (n.id === targetId ? { ...n, data: { ...n.data, pulse } } : n)))
      mark(true)
      setTimeout(() => mark(false), 450)
    },
    [setNodes]
  )

  // A department may only be dropped into a group; a group only into a section;
  // a section only into its own building's band, which reorders the row.
  const findTarget = useCallback(
    (node) => {
      if (node.type === 'tSectionBox') {
        const band = getIntersectingNodes(node).filter((n) => n.type === 'tBuildingBox')[0] ?? null
        // A section belongs to exactly one building (sp_section.building_id is
        // not null), so dropping it on another building's band is not a move
        // this canvas makes — it is refused rather than half-performed.
        return band && band.data.buildingId === node.data.buildingId ? band : null
      }
      const wantType = node.type === 'tDepartment' ? 'tGroupBox' : node.type === 'tGroupBox' ? 'tSectionBox' : null
      if (!wantType) return null
      return getIntersectingNodes(node).filter((n) => n.type === wantType && n.id !== node.id)[0] ?? null
    },
    [getIntersectingNodes]
  )

  // WHERE IN THE TARGET the drop lands, as an index into the list AS IT STANDS —
  // the dragged node included, which is the convention the editor's reorder
  // maths expects (see undoIndexFor).
  //
  // Measured from the POINTER against the laid-out slots, not from the dragged
  // node's own rectangle: the card follows the cursor, so its box says where it
  // is being held, and the cursor says where it is being put.
  const dropIndex = useCallback(
    (event, siblings, axis) => {
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const centre = (n) =>
        axis === 'x'
          ? n.position.x + (n.width ?? NODE_WIDTH) / 2
          : n.position.y + (n.height ?? NODE_HEIGHT) / 2
      return siblings.filter((n) => centre(n) < point[axis]).length
    },
    [screenToFlowPosition]
  )


  // One frame of a drag: lock a section to its row, carry whatever rides with
  // it, and shuffle the cards it would displace out of the way.
  const onNodeDrag = useCallback(
    (event, node) => {
      const drag = dragRef.current
      const target = findTarget(node)
      setDropTarget(target?.id ?? null)
      if (!drag) return

      // A SECTION IS LOCKED TO X. It only ever reorders its own building's row,
      // so the y axis says nothing — and a band it drifted out of stops being a
      // drop target, which made the gesture feel broken rather than constrained.
      const isSection = node.type === 'tSectionBox'
      const lockedY = isSection ? drag.origin.y : node.position.y
      const delta = { x: node.position.x - drag.origin.x, y: lockedY - drag.origin.y }

      const home = isSection
        ? node.data.buildingId
        : node.type === 'tGroupBox'
          ? node.data.sectionId
          : node.parentNode
      const over = !target
        ? null
        : isSection
          ? target.data.buildingId
          : node.type === 'tGroupBox'
            ? target.data.sectionId
            : target.id

      // Where it would land, in the list as it stands — then converted to an
      // index into that list WITHOUT the dragged card, which is what the preview
      // lays out. The editor does the same conversion at the drop.
      let preview = []
      if (over) {
        const { items, absolute, axis } = childrenOf(node, over)
        const raw = dropIndex(event, absolute ? items.map((n) => ({ ...n, position: absolute(n) })) : items, axis)
        const fromIndex = items.findIndex((n) => n.id === node.id)
        preview = slotPositions(node, over, fromIndex >= 0 && raw > fromIndex ? raw - 1 : raw)
      }
      // The slot it came from closes behind it while it is hovering elsewhere.
      if (home && home !== over) preview = [...preview, ...slotPositions(node, home, null)]

      // A section that shuffles aside takes its groups with it, for the same
      // reason the dragged one does — they are not its React Flow children.
      // Measured from the LAYOUT's positions, so a frame never compounds the
      // last one's offset.
      const all = computedRef.current?.nodes || []
      const expanded = []
      preview.forEach((p) => {
        expanded.push(p)
        if (p.axis !== 'x') return
        const section = all.find((n) => n.id === p.id)
        if (!section) return
        const shift = p.value - section.position.x
        all
          .filter((n) => n.type === 'tGroupBox' && n.data.sectionId === section.data.sectionId)
          .forEach((g) => expanded.push({ id: g.id, axis: 'x', value: g.position.x + shift }))
      })

      const moves = new Map(expanded.map((p) => [p.id, p]))
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === node.id) return isSection ? { ...n, position: { x: node.position.x, y: lockedY } } : n
          const carried = drag.carried.find((c) => c.id === n.id)
          if (carried) {
            return { ...n, position: { x: carried.origin.x + delta.x, y: carried.origin.y + delta.y } }
          }
          const move = moves.get(n.id)
          if (!move) return n
          if (n.position[move.axis] === move.value) return n
          return { ...n, position: { ...n.position, [move.axis]: move.value } }
        })
      )
    },
    [findTarget, setDropTarget, childrenOf, dropIndex, slotPositions, setNodes]
  )

  const onNodeDragStop = useCallback(
    async (event, node) => {
      const target = findTarget(node)
      setDropTarget(null)
      endDragStyling()
      dragRef.current = null

      if (!target) {
        // Dropped nowhere valid: everything goes back to its slot, the opened
        // gap included. Dragging to empty canvas never removes anything.
        resetPositions()
        return
      }

      // A section only ever reorders its building's row — sideways, so the
      // index comes from x. The core is excluded: it sits in the gutter, left of
      // everything, and would offset every index by one.
      if (node.type === 'tSectionBox') {
        const { items } = childrenOf(node, node.data.buildingId)
        const moved = await editor.moveSection(node.data.sectionId, dropIndex(event, items, 'x'))
        // A successful move reloads the catalog and re-lays the canvas; this is
        // for the drop that changed nothing.
        if (!moved) resetPositions()
        return
      }

      const isDept = node.type === 'tDepartment'
      const from = isDept ? node.data.groupInstanceId : node.data.sectionId
      const to = isDept ? target.id : target.data.sectionId

      // Groups stack down a section and departments down a group, so both read
      // their index from y — measured the same way the preview did, so what the
      // drop writes is the gap you were looking at.
      const { items, absolute, axis } = childrenOf(node, to)
      const index = dropIndex(event, absolute ? items.map((n) => ({ ...n, position: absolute(n) })) : items, axis)

      pulseTarget(target.id)
      const moved = isDept
        ? await editor.moveDept(node.id, from, to, { index })
        : await editor.moveGroup(node.id, from, to, { index })
      if (!moved) resetPositions()
    },
    [
      findTarget,
      setDropTarget,
      pulseTarget,
      resetPositions,
      endDragStyling,
      childrenOf,
      dropIndex,
      editor.moveDept,
      editor.moveGroup,
      editor.moveSection,
    ]
  )

  // Carousel drags are native HTML5 drags, not React Flow ones, so
  // getIntersectingNodes is unavailable and the hit test is done by hand
  // against the current node rectangles.
  const hitTestCarouselTarget = useCallback(
    (kind, clientX, clientY) => {
      const point = screenToFlowPosition({ x: clientX, y: clientY })
      const targetType = kind === 'group' ? 'tSectionBox' : 'tGroupBox'
      return nodesRef.current.find((n) => {
        if (n.type !== targetType) return false
        const w = n.width ?? NODE_WIDTH
        const h = n.height ?? NODE_HEIGHT
        return point.x >= n.position.x && point.x <= n.position.x + w && point.y >= n.position.y && point.y <= n.position.y + h
      })
    },
    [screenToFlowPosition]
  )

  const onCanvasDragOver = useCallback(
    (event) => {
      event.preventDefault()
      const dragging = draggingCarouselRef.current
      if (!dragging) {
        event.dataTransfer.dropEffect = 'move'
        return
      }
      const hit = hitTestCarouselTarget(dragging.kind, event.clientX, event.clientY)
      setDropTarget(hit?.id ?? null)
      // 'none' makes the browser draw its native not-allowed cursor — which is
      // how dragging a department straight onto a section (never valid, it must
      // land in a group) tells you so.
      event.dataTransfer.dropEffect = hit ? 'move' : 'none'
    },
    [hitTestCarouselTarget, setDropTarget]
  )

  const onCanvasDrop = useCallback(
    (event) => {
      event.preventDefault()
      setDropTarget(null)
      draggingCarouselRef.current = null

      const raw = event.dataTransfer.getData('application/json')
      if (!raw) return
      let payload
      try {
        payload = JSON.parse(raw)
      } catch {
        return
      }

      const hit = hitTestCarouselTarget(payload.kind, event.clientX, event.clientY)
      if (!hit) return

      if (payload.kind === 'group') editor.placeGroup(hit.data.sectionId, payload.id)
      else editor.placeDept(hit.id, payload.id)
    },
    [hitTestCarouselTarget, setDropTarget, editor.placeGroup, editor.placeDept]
  )

  const onItemDragStart = useCallback((kind, id) => {
    draggingCarouselRef.current = { kind, id }
  }, [])

  const onItemDragEnd = useCallback(() => {
    draggingCarouselRef.current = null
    setDropTarget(null)
  }, [setDropTarget])

  const carouselProps = { functions, onItemDragStart, onItemDragEnd }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <style>{CANVAS_STYLE}</style>

      {editor.error && (
        <div style={{ padding: '6px 12px', background: '#fff', borderBottom: '1px solid #e0e0e0', flexShrink: 0 }}>
          <span style={{ color: 'red', fontSize: 12 }}>{editor.error}</span>
        </div>
      )}

      {/* The carousels exist only to place things, so a read-only viewer gets
          the canvas without them.

          One band, above the canvas. Every definition is always listed, so the
          second band that used to sit below it holding the duplicable rows is
          gone — and so is the building chip row, since every building is drawn
          on the canvas and the carousels are no longer scoped to one. */}
      {canEdit && (
        <Band edge="bottom">
          <CarouselRow title="Groups" items={groupItems} kind="group" {...carouselProps} />
          <CarouselRow title="Departments" items={deptItems} kind="department" last {...carouselProps} />
        </Band>
      )}

      <div
        style={{ flex: 1, minHeight: 0, position: 'relative' }}
        onDragOver={canEdit ? onCanvasDragOver : undefined}
        onDragLeave={
          canEdit
            ? (e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null)
              }
            : undefined
        }
        onDrop={canEdit ? onCanvasDrop : undefined}
      >
        <CanvasFrame>
          <ReactFlow
            nodes={nodes}
            edges={NO_EDGES}
            onNodesChange={onNodesChange}
            onNodeDragStart={canEdit ? onNodeDragStart : undefined}
            onNodeDrag={canEdit ? onNodeDrag : undefined}
            onNodeDragStop={canEdit ? onNodeDragStop : undefined}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            {...canvasInput}
          >
            <Background />
          </ReactFlow>
        </CanvasFrame>
      </div>

    </div>
  )
}

export default function TreeCanvas(props) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
