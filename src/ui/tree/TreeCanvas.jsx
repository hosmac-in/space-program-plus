// The Tree tab (admin only): drag groups and departments from the
// carousels into the section boxes to build the shared catalog tree.
//
// This file is wiring only — layout maths live in treeLayout.js, card
// markup in treeNodes.jsx, and every tree edit in useTreeEditor.jsx —
// which the rooms panel shares, so both columns feed one undo stack.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import ReactFlow, { Background, ReactFlowProvider, useNodesState, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import { useCatalog } from '../../data/catalog.jsx'
import { buildTreeLayout, NODE_HEIGHT, NODE_WIDTH } from './treeLayout.js'
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

function TreeCanvasInner({ onSelectDepartment, selectedDeptInstanceId, canEdit }) {
  const { departments, groups, sections, functions, buildings } = useCatalog()
  const editor = useTreeEditorContext()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const { getIntersectingNodes, screenToFlowPosition } = useReactFlow()

  const hoveredIdRef = useRef(null)
  const draggingCarouselRef = useRef(null)
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
        { onSelectDepartment, onRemoveDepartment: onCardRemoveDept, onRemoveGroup: onCardRemoveGroup },
        stableSectionWidthsRef.current,
        stableBuildingHeightsRef.current
      ),
    [
      sections,
      groups,
      departments,
      buildings,
      functions,
      canEdit,
      selectedDeptInstanceId,
      onSelectDepartment,
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

  // Returns a card to its computed slot. Used both when a drop lands nowhere
  // valid and when a move is rejected. Dragging a card onto empty canvas
  // deliberately does NOT remove it — that's what the × button is for.
  const snapBack = useCallback(
    (nodeId) => {
      const fresh = computedRef.current?.nodes.find((n) => n.id === nodeId)
      if (!fresh) return
      setNodes((current) => current.map((n) => (n.id === nodeId ? { ...n, position: fresh.position } : n)))
    },
    [setNodes]
  )

  // React Flow renders child nodes as DOM siblings of their parent rather than
  // inside it, so stacking is global: lifting a dragged group above the rest of
  // the canvas also lifts it above the departments travelling inside it, which
  // then disappear behind it. Raise the whole family together, children one
  // step higher.
  const onNodeDragStart = useCallback(
    (event, node) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === node.id) return { ...n, zIndex: DRAG_Z }
          if (n.parentNode === node.id) return { ...n, zIndex: DRAG_Z + 1, className: 'tree-follow' }
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
  const endDragStyling = useCallback(
    (nodeId) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId && n.parentNode !== nodeId) return n
          const fresh = computedRef.current?.nodes.find((f) => f.id === n.id)
          return fresh ? { ...n, zIndex: fresh.zIndex, className: undefined } : { ...n, className: undefined }
        })
      )
    },
    [setNodes]
  )

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

  // A department may only be dropped into a group; a group only into a section.
  const findTarget = useCallback(
    (node) => {
      const wantType = node.type === 'tDepartment' ? 'tGroupBox' : node.type === 'tGroupBox' ? 'tSectionBox' : null
      if (!wantType) return null
      return getIntersectingNodes(node).filter((n) => n.type === wantType && n.id !== node.id)[0] ?? null
    },
    [getIntersectingNodes]
  )

  const onNodeDrag = useCallback(
    (event, node) => setDropTarget(findTarget(node)?.id ?? null),
    [findTarget, setDropTarget]
  )

  const onNodeDragStop = useCallback(
    async (event, node) => {
      const target = findTarget(node)
      setDropTarget(null)
      endDragStyling(node.id)

      const isDept = node.type === 'tDepartment'
      const from = isDept ? node.data.groupInstanceId : node.data.sectionId
      const to = isDept ? target?.id ?? null : target?.data.sectionId ?? null

      // Dropped nowhere valid, or back where it started (a small nudge): put it
      // straight back rather than leaving it visibly off its slot.
      if (!to || to === from) {
        snapBack(node.id)
        return
      }

      pulseTarget(target.id)
      const moved = isDept ? await editor.moveDept(node.id, from, to) : await editor.moveGroup(node.id, from, to)
      if (!moved) snapBack(node.id)
    },
    [findTarget, setDropTarget, pulseTarget, snapBack, endDragStyling, editor.moveDept, editor.moveGroup]
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
        >
          <Background />
        </ReactFlow>
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
