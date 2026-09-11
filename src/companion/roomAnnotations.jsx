// WHAT THE COMPANION ADDS TO THE OPTION PANEL
//
// This fills the slots `ui/option/annotations.jsx` declares. Everything Rhino
// knows about a room or a department enters the shared panel here and nowhere
// else — the panel itself has no idea any of this exists.
//
// Both rings measure AREA against what the program asks for: a room's
// `areaSqft × count` (the count multiplies, see CLAUDE.md, Area), a department's
// grossed area. Counting links instead would demand the model be chopped the way
// the program is, and one merged solid over five ICU bays is a perfectly good
// model.

import { useMemo } from 'react'
import { formatArea } from '../ui/map/area.js'
import { ROOM_CONTROL } from '../ui/panel/panelLayout.js'
import LinkButton, { LINK_MET, LINK_OVER, linkState } from './LinkButton.jsx'
import LinkedCount from './LinkedCount.jsx'

const NOTHING = { count: 0, areaSqft: 0 }

// WHAT THE MODEL HOLDS FOR A DEPARTMENT IS ITS OWN MASSES PLUS ITS ROOMS'.
//
// An architect works down: the department goes in as one mass, and rooms are cut
// out of it as they are decided. Counting only department-tagged objects made
// the ring fall back towards empty as that work progressed — exactly backwards.
// Summed, a department half detailed and half still a lump reads as one figure
// however it was drawn.
//
// It still reaches the GROSSED target, because the two together are the
// department's real footprint: the rooms are the net, and whatever mass is left
// is the circulation and structure the grossing factors stand for. Rooms alone
// stop short by exactly that, and should.
//
// Rhino writes one tag per object, so nothing is double-counted — except by an
// architect who tags a mass AND the rooms inside it, which doubles the same
// floor area and correctly goes red.
function departmentHeld(census, dept) {
  return dept.rooms.reduce((total, room) => {
    const held = census.rooms[room.instanceId]
    return held ? { count: total.count + held.count, areaSqft: total.areaSqft + held.areaSqft } : total
  }, census.departments[dept.instanceId] ?? NOTHING)
}

// The ring's tooltip: the areas, then how many objects they came from. The
// object count is there because an object with no `.ffft2` is counted and adds
// nothing — a ring stuck at empty over three tagged objects means UNMEASURED,
// not unlinked, and nothing else would tell those two apart.
function title(name, linked, total, objects) {
  const has = `${formatArea(linked)} sqft`
  const asks = `${formatArea(total)} sqft`
  const from = objects > 0 ? ` (${objects} object${objects === 1 ? '' : 's'})` : ''
  if (!(total > 0) && linked <= 0) return `Tag the selected Rhino objects as ${name}`
  // Through linkState, never its own comparison: the tooltip must call a room
  // finished at exactly the moment the ring does. It carries the 5% band.
  const state = linkState(linked, total)
  if (state === LINK_OVER) return `${has} linked${from} — ${name} asks for ${asks}`
  if (state === LINK_MET) return `already assigned — ${has}${from} of ${asks}`
  if (linked <= 0) return `Nothing linked yet${from} — ${name} asks for ${asks}`
  return `${has} of ${asks} linked${from}`
}

// `link` and `census` come from the bridge; the result is handed straight to
// AnnotationsProvider. Memoised on both, so the panel re-renders when the
// document changes and not otherwise.
export function useRoomAnnotations(census, link) {
  return useMemo(
    () => ({
      department: (dept, areaSqft, path) => {
        const held = departmentHeld(census, dept)
        return (
          <LinkButton
            // A room's size, not a larger one: the two share a column, and a
            // department whose control were wider would sit off the line its
            // rooms hang from.
            size={ROOM_CONTROL}
            linked={held.areaSqft}
            total={areaSqft}
            title={title(dept.name, held.areaSqft, areaSqft, held.count)}
            onLink={() => link({ kind: 'department', instanceId: dept.instanceId, name: dept.name, path })}
          />
        )
      },

      // `name` is the RESOLVED name — a placement may be labelled, so the two
      // Toilets in a department tag and report as Male and Female. The room
      // object's own `name` is the definition's and is not what the model should
      // be told. Identity is still instanceId, as it always was.
      room: (room, path, name) => {
        const held = census.rooms[room.instanceId] ?? NOTHING
        const wants = (room.areaSqft ?? 0) * (room.count ?? 0)
        const shown = name || room.name
        return (
          <LinkButton
            size={ROOM_CONTROL}
            linked={held.areaSqft}
            total={wants}
            title={title(shown, held.areaSqft, wants, held.count)}
            onLink={() => link({ kind: 'room', instanceId: room.instanceId, name: shown, path })}
          />
        )
      },

      roomCount: (room, name) => (
        <LinkedCount
          name={name || room.name}
          linked={(census.rooms[room.instanceId] ?? NOTHING).count}
          count={room.count}
        />
      ),
    }),
    [census, link]
  )
}
