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
  const { departments, groups, sections, functions } = useCatalog()
  const editor = useTreeEditorContext()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const { getIntersectingNodes, screenToFlowPosition } = useReactFlow()

  const hoveredIdRef = useRef(null)
  const draggingCarouselRef = useRef(null)
  const nodesRef = useRef([])
  const computedRef = useRef(null)
  // Section widths only ever grow. Without this floor, removing a department
  // would shrink its section and slide every section to the right of it.
  const stableSectionWidthsRef = useRef(new Map())

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const onCardRemoveDept = useCallback((id) => editor.removeDept(id), [editor.removeDept])
  const onCardRemoveGroup = useCallback((id) => editor.removeGroup(id), [editor.removeGroup])

  const computed = useMemo(
    () =>
      buildTreeLayout(
        { sections, groups, departments, functions, canEdit },
        selectedDeptInstanceId,
        { onSelectDepartment, onRemoveDepartment: onCardRemoveDept, onRemoveGroup: onCardRemoveGroup },
        stableSectionWidthsRef.current
      ),
    [
      sections,
      groups,
      departments,
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
    setNodes(computed.nodes)
    computedRef.current = computed
  }, [computed, setNodes])

  // --- Carousels ------------------------------------------------------------
  //
  // A non-duplicable item disappears from its carousel once placed, since it
  // can only exist in one spot. Duplicable items can be placed any number of
  // times, so they get their own always-visible rows.

  const placedGroupDefIds = useMemo(() => {
    const ids = new Set()
    sections.forEach((s) => (s.tree?.groups || []).forEach((g) => ids.add(g.group_def_id)))
    return ids
  }, [sections])

  const placedDeptDefIds = useMemo(() => {
    const ids = new Set()
    sections.forEach((s) =>
      (s.tree?.groups || []).forEach((g) => (g.departments || []).forEach((d) => ids.add(d.department_def_id)))
    )
    return ids
  }, [sections])

  const unplacedGroups = useMemo(
    () => groups.filter((g) => g.is_duplicable === false && !placedGroupDefIds.has(g.id)).sort(byName),
    [groups, placedGroupDefIds]
  )
  const unplacedDepts = useMemo(
    () => departments.filter((d) => d.is_duplicable === false && !placedDeptDefIds.has(d.id)).sort(byName),
    [departments, placedDeptDefIds]
  )
  const duplicableGroups = useMemo(() => groups.filter((g) => g.is_duplicable !== false).sort(byName), [groups])
  const duplicableDepts = useMemo(
    () => departments.filter((d) => d.is_duplicable !== false).sort(byName),
    [departments]
  )

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
          the canvas without them. */}
      {/* The carousels are bands of their own, above and below the canvas —
          bounded so it's clear where each ends and the canvas begins. */}
      {canEdit && (
        <Band edge="bottom">
          <CarouselRow title="Groups" items={unplacedGroups} kind="group" {...carouselProps} />
          <CarouselRow title="Departments" items={unplacedDepts} kind="department" last {...carouselProps} />
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

      {canEdit && (
        <Band edge="top">
          <CarouselRow title="Dup. Groups" items={duplicableGroups} kind="group" {...carouselProps} />
          <CarouselRow title="Dup. Departments" items={duplicableDepts} kind="department" last {...carouselProps} />
        </Band>
      )}
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
