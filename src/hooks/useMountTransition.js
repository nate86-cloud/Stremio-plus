import { useEffect, useState } from 'react'

/**
 * Keeps a component mounted long enough for enter/exit CSS transitions.
 *
 * While `isActive` is true the component renders; one painted frame later
 * `phase` flips to 'entered' so opacity/scale transitions animate in.
 * When `isActive` goes false the component stays mounted until
 * `durationMs` has elapsed — matching the CSS transition duration — so it
 * can animate out before unmounting.
 *
 * @param {boolean} isActive
 * @param {number} durationMs - must match the CSS transition duration
 * @returns {{ shouldRender: boolean, phase: ('exited'|'entering'|'entered'|'exiting') }}
 */
export function useMountTransition(isActive, durationMs = 300) {
  const [phase, setPhase] = useState(isActive ? 'entered' : 'exited')
  const [prevIsActive, setPrevIsActive] = useState(isActive)

  // Adjust-state-during-render (supported React pattern) to react to prop
  // changes without a synchronous setState inside an effect.
  if (prevIsActive !== isActive) {
    setPrevIsActive(isActive)
    setPhase(isActive ? 'entering' : 'exiting')
  }

  useEffect(() => {
    if (isActive) {
      // Double rAF: guarantees the browser paints the "hidden" state
      // first, so the transition to 'entered' actually animates instead
      // of snapping straight to the final styles.
      let innerRaf
      const outerRaf = requestAnimationFrame(() => {
        innerRaf = requestAnimationFrame(() => setPhase('entered'))
      })
      return () => {
        cancelAnimationFrame(outerRaf)
        if (innerRaf) cancelAnimationFrame(innerRaf)
      }
    }

    const unmountTimeout = setTimeout(() => setPhase('exited'), durationMs)
    return () => clearTimeout(unmountTimeout)
  }, [isActive, durationMs])

  return { shouldRender: phase !== 'exited', phase }
}
