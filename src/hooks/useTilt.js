import { useRef, useCallback, useEffect } from 'react'

// Tracks cursor position and applies a physical leaning transform plus glare
// position without causing a React render for every mouse-move tick.
export function useTilt({ maxTilt = 10, scale = 1.03 } = {}) {
  const ref = useRef(null)
  const frameRef = useRef(null)

  const applyTransform = useCallback((rotateX, rotateY, glareX, glareY) => {
    const el = ref.current
    if (!el) return
    el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, ${scale})`
    el.style.setProperty('--glare-x', `${glareX}%`)
    el.style.setProperty('--glare-y', `${glareY}%`)
  }, [scale])

  const handleMouseMove = useCallback((e) => {
    const el = ref.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const rotateY = (px - 0.5) * (maxTilt * 2)
    const rotateX = (0.5 - py) * (maxTilt * 2)

    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      applyTransform(rotateX, rotateY, px * 100, py * 100)
    })
  }, [maxTilt, applyTransform])

  const handleMouseLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
      el.style.setProperty('--glare-x', '50%')
      el.style.setProperty('--glare-y', '50%')
    })
  }, [])

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return { ref, onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave }
}
