// The Tree tab (admin only): drag groups and departments from the
// carousels into the section boxes to build the shared catalog tree.
//
// This file is wiring only — layout maths live in treeLayout.js, card
// markup in treeNodes.jsx, and every tree edit in useTreeEditor.jsx —
// which the rooms panel shares, so both columns feed one undo stack.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, ReactFlowProvider, useNodesState, useReactFlow } from 'reactflow'
import CanvasFrame, { GUTTER, useCanvasInput } from '../canvas/CanvasFrame.jsx'
import 'reactflow/dist/style.css'
import { useCatalog } from '../../data/catalog.jsx'
import { byName } from '../../data/tree.js'
import { buildTreeLayout, NODE_HEIGHT, NODE_WIDTH } from './treeLayout.js'
import { CARD_GAP, GAP } from '../canvas/canvasLayout.js'
import { CANVAS_STYLE, COLLAPSE_MS, CarouselRow, nodeTypes } from './treeNodes.jsx'
import { useTreeEditorContext } from './useTreeEditor.jsx'
import { Band } from '../primitives/Band.jsx'
import ConfirmModal from '../primitives/ConfirmModal.jsx'
import { useToast } from '../primitives/Toast.jsx'
import { Z } from '../primitives/zIndex.js'

// Stable identity so React Flow doesn't see a new edge array every render. The
// tree draws containment by nesting boxes, so it has no edges at all.
const NO_EDGES = []

// Above every resting node (sections 0, groups 10, departments 20) while a drag
// is in flight.
const DRAG_Z = 1000

// A stand-in for `expandedGroups`/`expandedRooms` that answers every `.has()`
// with true — buildTreeLayout never iterates either set, only tests
// membership, so this is enough to make it emit every department and every
// room row regardless of what is actually open on screen. Used ONLY to build
// the search index below: a search has to find something behind a shut group,
// which the real, current layout would simply not contain.
const ALWAYS_EXPANDED = { has: () => true }

// buildTreeLayout wants a full callback set; the index it builds is thrown
// away, so every one of these is a no-op.
const INDEX_CALLBACKS = {
  onSelectDepartment: () => {},
  onSelectBuilding: () => {},
  onRemoveDepartment: () => {},
  onRemoveGroup: () => {},
  onToggleRooms: () => {},
  onToggleGroup: () => {},
}

// THE SEARCH ICON'S OWN CORNER, absolutely positioned inside the canvas pane —
// not the gutter, which is a scrollbar and has no room for a control on it.
// Bottom-left because side and the carousels already own the right and the
// top; this is the one corner of the drawing nothing else has claimed.
function CanvasSearch({ onSearch }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <div
      // nodrag/nopan: without these, React Flow's own pointer handling on the
      // pane claims the click before it reaches the input or the button.
      className="nodrag nopan"
      style={{
        position: 'absolute',
        left: GUTTER + 12,
        bottom: GUTTER + 12,
        zIndex: Z.mapControls,
        display: 'flex',
        alignItems: 'center',
        background: '#fff',
        borderRadius: open ? 8 : '50%',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      {open ? (
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search a room, department, group…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch(query)
            else if (e.key === 'Escape') {
              setQuery('')
              setOpen(false)
            }
          }}
          // Closes itself once abandoned empty — a search box left open over
          // the canvas with nothing typed is a control nobody is using.
          onBlur={() => {
            if (!query) setOpen(false)
          }}
          style={{
            width: 220,
            boxSizing: 'border-box',
            padding: '8px 10px',
            fontSize: 13,
            border: 'none',
            outline: 'none',
            borderRadius: 8,
            background: 'transparent',
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Search for a room, department, group, room group or section"
          aria-label="Search the catalog"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          🔍
        </button>
      )}
    </div>
  )
}


function TreeCanvasInner({
  onSelectDepartment,
  selectedDeptInstanceId,
  onSelectBuilding,
  selectedBuildingId,
  canEdit,
}) {
  // `rooms` is the definition table, for the names a department card lists.
  const { departments, groups, rooms, sections, functions, buildings } = useCatalog()
  const editor = useTreeEditorContext()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const { getIntersectingNodes, screenToFlowPosition, setCenter, getZoom } = useReactFlow()
  const canvasInput = useCanvasInput()
  const onToast = useToast()

  const hoveredIdRef = useRef(null)
  const draggingCarouselRef = useRef(null)
  // What is in flight: where it started, and what rides with it. Null between
  // drags.
  const dragRef = useRef(null)
  const nodesRef = useRef([])
  const computedRef = useRef(null)
  // A search hit that needed a shut group or a shut room list opened first —
  // set on the way in, read and cleared the moment the layout that follows
  // lands, since only THAT layout has a position for the thing it names.
  const pendingSearchRef = useRef(null)
  // Section widths and building heights only ever grow. Without these floors,
  // removing a department would shrink its section and slide every section to
  // the right of it, or shorten its building and drag every building below it
  // upwards.
  const stableSectionWidthsRef = useRef(new Map())
  const stableBuildingHeightsRef = useRef(new Map())

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  // REMOVAL ALWAYS ASKS, and asks before anything is written. It used to go
  // straight through — there was a × to aim at, and the footer's undo was the
  // safety net. A right-click is easy to do by accident, and this edits the
  // SHARED catalog for everyone the moment it lands.
  const [confirmRemove, setConfirmRemove] = useState(null)
  const onCardRemoveDept = useCallback(
    (id, name, roomCount) => setConfirmRemove({ kind: 'department', id, name, count: roomCount }),
    []
  )
  const onCardRemoveGroup = useCallback(
    (id, name, deptCount) => setConfirmRemove({ kind: 'group', id, name, count: deptCount }),
    []
  )

  // WHICH CARDS HAVE THEIR ROOMS OPEN, by placement instance_id. Collapsed is the
  // resting state, and it lives here rather than in the card because the layout
  // stacks a group by each card's height — see buildTreeLayout.
  const [expandedRooms, setExpandedRooms] = useState(() => new Set())
  const onToggleRooms = useCallback((id) => {
    setExpandedRooms((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])

  // WHICH GROUPS ARE OPEN, by the group node's instance_id. SHUT IS THE RESTING
  // STATE — the whole catalog is on this canvas at once, and every group open is
  // a wall of cards rather than the shape of a building.
  const [expandedGroups, setExpandedGroups] = useState(() => new Set())

  // A COLLAPSE IS NOT A DROP, and must not be eased like one. The canvas settles
  // after a drag on an overshoot spring — a card released from the pointer sails
  // a little past its slot — and applied to a box that is changing SIZE, with
  // everything below it moving at once, that overshoot reads as a jerk. So the
  // wrapper wears this class for the length of the move and the nodes ease out
  // instead, the same curve the option canvas uses. Cleared afterwards so a drag
  // gets its spring back.
  const [collapsing, setCollapsing] = useState(false)

  // A CARD DROPPED INTO A SHUT GROUP OPENS IT. Shut is the resting state, so
  // without this every placement disappeared the instant it was made and the
  // canvas answered a drop by showing nothing — which is how this first shipped.
  // Placing something is also the one moment you certainly want to see what is
  // in there.
  const openForDrop = useCallback((groupInstanceId) => {
    setExpandedGroups((cur) => (cur.has(groupInstanceId) ? cur : new Set(cur).add(groupInstanceId)))
  }, [])

  const onToggleGroup = useCallback((id) => {
    setCollapsing(true)
    setExpandedGroups((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    if (!collapsing) return
    const t = setTimeout(() => setCollapsing(false), COLLAPSE_MS)
    return () => clearTimeout(t)
  }, [collapsing, expandedGroups])

  const computed = useMemo(
    () =>
      buildTreeLayout(
        {
          sections,
          groups,
          departments,
          rooms,
          buildings,
          functions,
          canEdit,
          expandedRooms,
          expandedGroups,
        },
        selectedDeptInstanceId,
        {
          onSelectDepartment,
          onSelectBuilding,
          onRemoveDepartment: onCardRemoveDept,
          onRemoveGroup: onCardRemoveGroup,
          onToggleRooms,
          onToggleGroup,
        },
        stableSectionWidthsRef.current,
        stableBuildingHeightsRef.current,
        selectedBuildingId
      ),
    [
      sections,
      groups,
      departments,
      rooms,
      buildings,
      functions,
      canEdit,
      expandedRooms,
      expandedGroups,
      onToggleGroup,
      selectedDeptInstanceId,
      selectedBuildingId,
      onSelectDepartment,
      onSelectBuilding,
      onCardRemoveDept,
      onCardRemoveGroup,
      onToggleRooms,
    ]
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

  // THE SAME IDEA, on one row of a department's own room list rather than on a
  // card — see CardRoomList's note. `deptId` is the card carrying the row;
  // there is no separate canvas node for a room or a room group to pulse.
  const pulseRoom = useCallback(
    (deptId, roomKey) => {
      const mark = (highlightRoomKey) =>
        setNodes((nds) => nds.map((n) => (n.id === deptId ? { ...n, data: { ...n.data, highlightRoomKey } } : n)))
      mark(roomKey)
      setTimeout(() => mark(null), 900)
    },
    [setNodes]
  )

  // --- Search ----------------------------------------------------------------
  //
  // EVERY ROOM, DEPARTMENT, GROUP, ROOM GROUP AND SECTION IN THE CATALOG, flat —
  // built from a layout where nothing is collapsed (ALWAYS_EXPANDED), because a
  // search has to find something behind a shut group exactly as well as
  // something already on screen. Only used to look a name up: the real
  // positions this canvas draws come from `computed`, below.
  const searchIndex = useMemo(() => {
    const layout = buildTreeLayout(
      {
        sections,
        groups,
        departments,
        rooms,
        buildings,
        functions,
        canEdit,
        expandedRooms: ALWAYS_EXPANDED,
        expandedGroups: ALWAYS_EXPANDED,
      },
      null,
      INDEX_CALLBACKS,
      new Map(),
      new Map(),
      null
    )
    const idx = []
    layout.nodes.forEach((n) => {
      if (n.type === 'tSectionBox') idx.push({ kind: 'section', name: n.data.name, id: n.id })
      else if (n.type === 'tGroupBox') idx.push({ kind: 'group', name: n.data.name, id: n.id, groupId: n.id })
      else if (n.type === 'tDepartment') {
        idx.push({ kind: 'department', name: n.data.name, id: n.id, deptId: n.id, groupId: n.data.groupInstanceId })
        ;(n.data.rooms || []).forEach((r) => {
          idx.push({
            kind: r.group ? 'roomGroup' : 'room',
            name: r.name,
            deptId: n.id,
            groupId: n.data.groupInstanceId,
            roomKey: r.key,
          })
        })
      }
    })
    return idx
  }, [sections, groups, departments, rooms, buildings, functions, canEdit])

  // Pan to whatever a search matched and pulse it — the card for a section,
  // group or department, the card plus its own row for a room or room group.
  // `nodesList` is passed explicitly right after a group or a room list has
  // just been opened for this, when the fresh layout is in hand but has not
  // necessarily reached `computedRef` yet.
  const focusHit = useCallback(
    (hit, nodesList) => {
      const list = nodesList ?? computedRef.current?.nodes ?? []
      const isRoom = hit.kind === 'room' || hit.kind === 'roomGroup'
      const targetId = isRoom ? hit.deptId : hit.id
      const node = list.find((n) => n.id === targetId)
      if (!node) return
      // A department's position is relative to its group box — see
      // childrenOf's own `absolute` helper, which does the same thing.
      const parent = node.parentNode ? list.find((n) => n.id === node.parentNode) : null
      const x = (parent?.position.x ?? 0) + node.position.x + (node.width ?? NODE_WIDTH) / 2
      const y = (parent?.position.y ?? 0) + node.position.y + (node.height ?? NODE_HEIGHT) / 2
      setCenter(x, y, { zoom: getZoom(), duration: 600 })
      pulseTarget(targetId)
      if (isRoom) pulseRoom(hit.deptId, hit.roomKey)
    },
    [setCenter, getZoom, pulseTarget, pulseRoom]
  )

  const runSearch = useCallback(
    (query) => {
      const q = query.trim().toLowerCase()
      if (!q) return
      const hit = searchIndex.find((e) => e.name?.toLowerCase().includes(q))
      if (!hit) {
        onToast(`Nothing in the catalog matches "${query.trim()}"`, 'error')
        return
      }
      // A group that's shut emits no department nodes at all, and a card whose
      // room list is shut lists nothing to pulse — either has to open before
      // there is anything to pan to. See ALWAYS_EXPANDED above for why the
      // index still found it.
      const needsGroupOpen = hit.groupId && !expandedGroups.has(hit.groupId)
      const needsRoomsOpen = (hit.kind === 'room' || hit.kind === 'roomGroup') && !expandedRooms.has(hit.deptId)
      if (needsGroupOpen || needsRoomsOpen) {
        if (needsGroupOpen) setExpandedGroups((cur) => new Set(cur).add(hit.groupId))
        if (needsRoomsOpen) setExpandedRooms((cur) => new Set(cur).add(hit.deptId))
        // Picked up by the layout effect below, the moment the reopened
        // catalog has a position for this again.
        pendingSearchRef.current = hit
      } else {
        focusHit(hit)
      }
    },
    [searchIndex, expandedGroups, expandedRooms, onToast, focusHit]
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
    // A search that had to open a shut group or a shut room list first: this is
    // the layout that opening produced, so it is the first one with a position
    // for what was found. See runSearch/focusHit above.
    if (pendingSearchRef.current) {
      const hit = pendingSearchRef.current
      pendingSearchRef.current = null
      focusHit(hit, computed.nodes)
    }
  }, [computed, setNodes, focusHit])

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
      // A DEPARTMENT CARD IS NOT A FIXED HEIGHT. It grows by the rooms listed on
      // it, so the shuffle has to measure each one — a constant pitch here made
      // every card a drag passed step aside by the wrong amount, and the gap
      // opened in the wrong place.
      size: (n) => n.height ?? NODE_HEIGHT,
      // Cards sit closer than boxes do — see CARD_GAP. The shuffle has to step
      // by the same gap the layout stacked them with, or every card a drag
      // passes moves aside by the wrong amount.
      gap: CARD_GAP,
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
    const { axis, size, items, gap = GAP } = childrenOf(node, containerId)
    if (items.length === 0) return []

    const origin = Math.min(...items.map((n) => n.position[axis]))
    const rest = items.filter((n) => n.id !== node.id)
    const order = index == null ? rest : [...rest.slice(0, index), node, ...rest.slice(index)]

    const out = []
    let at = origin
    order.forEach((n) => {
      if (n.id !== node.id) out.push({ id: n.id, axis, value: at })
      at += size(n) + gap
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
      // A COLLAPSED GROUP STILL TAKES A DROP, and opens to show what landed —
      // see openForDrop. Refusing one was the first cut at this and it made
      // every group in the catalog refuse departments, because shut is the
      // resting state: there was nothing to drop into anywhere.
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
      // The group it is landing in, so the card is visible where it lands.
      if (isDept) openForDrop(to)
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
      openForDrop,
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
      else {
        // Dropped from the carousel into a group that is probably shut — see
        // openForDrop.
        openForDrop(hit.id)
        editor.placeDept(hit.id, payload.id)
      }
    },
    [hitTestCarouselTarget, setDropTarget, openForDrop, editor.placeGroup, editor.placeDept]
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
        // Only while a group is opening or shutting — see COLLAPSE_MS.
        className={collapsing ? 'tree-collapsing' : undefined}
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

        <CanvasSearch onSearch={runSearch} />
      </div>

      {/* THE CATALOG IS SHARED, so this is not "your" card going away — it is
          the placement going away for everyone, and its rooms with it. The undo
          in the footer can put it back, which is what the last line says. */}
      {confirmRemove && (
        <ConfirmModal
          title={confirmRemove.kind === 'group' ? 'Remove group?' : 'Remove department?'}
          onConfirm={() => {
            if (confirmRemove.kind === 'group') editor.removeGroup(confirmRemove.id)
            else editor.removeDept(confirmRemove.id)
            setConfirmRemove(null)
          }}
          onCancel={() => setConfirmRemove(null)}
        >
          Remove "{confirmRemove.name}" from the catalog
          {confirmRemove.count > 0 ? (
            <>
              {' '}
              and the {confirmRemove.count}{' '}
              {confirmRemove.kind === 'group'
                ? `department${confirmRemove.count === 1 ? '' : 's'}`
                : `room${confirmRemove.count === 1 ? '' : 's'}`}{' '}
              in it
            </>
          ) : null}
          ? Everyone sees this change. You can undo it after.
        </ConfirmModal>
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
