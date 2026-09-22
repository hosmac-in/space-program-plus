// PRESS AND HOLD TO KEEP GOING — the behaviour every − / + in this app has.
//
// One definition, because a stepper that repeats on one panel and not on
// another is two controls wearing one glyph. Anything with a step button imports
// this rather than writing a timer.
//
// TWO CALLBACKS, AND THE SPLIT IS THE WHOLE POINT:
//
//   step()    every tick, including the first, which is the click
//   settle()  ONCE, when the button is let go
//
// A held stepper is ONE edit, not forty. Every field here reports each keystroke
// so totals answer while you type and commits when you leave — and a caller that
// WRITES (the Tree tab: one jsonb write and one undo step per commit) hangs off
// the commit. Firing it per tick would be a database write per tick and forty
// undo steps for one press.
//
// ACCELERATING, because the range asked of these is wide: a room count is nudged
// by ones and an area by hundreds. It waits before repeating at all, so a plain
// click is still a plain click and nothing runs away under a slow finger.
import { useCallback, useEffect, useRef } from 'react'

// Before the repeat starts: long enough that a deliberate single press never
// trips it, short enough that holding does not feel broken.
const HOLD = 400
// The repeat, slowest first. Each rate lasts `after` ms from the start of the
// hold, and the last one runs until release.
const RATES = [
  { after: 1200, every: 120 },
  { after: 2600, every: 60 },
  { after: Infinity, every: 25 },
]

export default function useHoldRepeat(step, settle) {
  // Refs, so the timer always calls the LATEST handler: these are inline
  // closures over the current value, re-made every render, and a timer holding
  // the first one would step from the value the field had when it mounted.
  const stepRef = useRef(step)
  const settleRef = useRef(settle)
  stepRef.current = step
  settleRef.current = settle

  const timer = useRef(null)
  const held = useRef(false)

  const stop = useCallback((commit) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!held.current) return
    held.current = false
    // Only on a real release. An unmount mid-press must not write — the caller
    // may be gone, and a value nobody let go of is not an edit anybody made.
    if (commit) settleRef.current?.()
  }, [])

  // Unmount cancels without committing, and stop() is stable, so this subscribes
  // once rather than on every keystroke.
  useEffect(() => () => stop(false), [stop])

  const begin = useCallback(
    (e) => {
      // Left button only. A right-click is the remove gesture everywhere here
      // and must not also nudge the thing it is asking about.
      if (e.button !== 0) return
      // These sit inside clickable rows and selectable cards on both canvases.
      e.stopPropagation()
      // Capture, or a finger sliding 3px off a 16px button stops the repeat and
      // never sees the release that commits it.
      e.currentTarget.setPointerCapture?.(e.pointerId)

      held.current = true
      const from = Date.now()
      stepRef.current()

      const tick = () => {
        stepRef.current()
        const rate = RATES.find((r) => Date.now() - from < r.after) ?? RATES[RATES.length - 1]
        timer.current = setTimeout(tick, rate.every)
      }
      timer.current = setTimeout(tick, HOLD)
    },
    []
  )

  // Leaving the button is a release, not an abandon: with capture the pointer
  // rarely leaves, and when it does the edit made so far is still the edit.
  return {
    onPointerDown: begin,
    onPointerUp: () => stop(true),
    onPointerCancel: () => stop(true),
    onPointerLeave: () => stop(true),
    // The click has already happened on pointerdown. Without this a caller's own
    // onClick would run it a second time.
    onClick: (e) => e.stopPropagation(),
  }
}
