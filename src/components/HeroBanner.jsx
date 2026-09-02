import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { HeroBannerSkeleton } from './MediaSkeletons'

// Keep one slide in view so the three-item hero set remains genuinely
// navigable via autoplay, wheel, and touch gestures.
const MAX_VISIBLE = 1
const MIN_VISIBLE = 1
const NARROW_BREAKPOINT_PX = 900
const AUTO_PLAY_MS = 6500
const TRANSITION_MS = 700

function computeVisibleCount(containerWidth, itemCount) {
  const target = containerWidth < NARROW_BREAKPOINT_PX ? MIN_VISIBLE : MAX_VISIBLE
  return Math.max(1, Math.min(target, itemCount))
}

function HeroBanner({
  items = [],
  isLoading = false,
  loadingItemId = null,
  onMoreInfo,
  onPlay,
  onSlideFocus,
}) {
  const containerRef = useRef(null)
  const autoPlayRef = useRef(null)
  const wheelLockRef = useRef(false)
  const touchStartRef = useRef(null)
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE)
  const [isPaused, setIsPaused] = useState(false)
  const [isJumping, setIsJumping] = useState(false)

  const heroItems = useMemo(() => items.slice(0, 3), [items])
  const total = heroItems.length
  const clones = visibleCount
  const [currentIndex, setCurrentIndex] = useState(clones)

  const extended = total > 0
    ? [
        ...heroItems.slice(Math.max(0, total - clones), total),
        ...heroItems,
        ...heroItems.slice(0, clones),
      ]
    : []

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current

    const updateVisibleCount = () => {
      const next = computeVisibleCount(el.offsetWidth, total)
      setVisibleCount((prev) => (prev === next ? prev : next))
    }

    updateVisibleCount()
    const observer = new ResizeObserver(updateVisibleCount)
    observer.observe(el)
    return () => observer.disconnect()
  }, [total])

  useEffect(() => {
    setIsJumping(true)
    setCurrentIndex(visibleCount)
    const raf = requestAnimationFrame(() => setIsJumping(false))
    return () => cancelAnimationFrame(raf)
  }, [visibleCount])

  useEffect(() => {
    if (!onSlideFocus || total === 0) return
    const realIndex = ((currentIndex - clones) % total + total) % total
    onSlideFocus(heroItems[realIndex])
  }, [currentIndex, total, clones, heroItems, onSlideFocus])

  const goTo = useCallback((index) => {
    setIsJumping(false)
    setCurrentIndex(index)
  }, [])

  const next = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo])
  const prev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo])

  const handleWheel = useCallback((event) => {
    if (total <= visibleCount || wheelLockRef.current) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0
    if (Math.abs(delta) < 12) return
    event.preventDefault()
    wheelLockRef.current = true
    delta > 0 ? next() : prev()
    window.setTimeout(() => {
      wheelLockRef.current = false
    }, TRANSITION_MS)
  }, [next, prev, total, visibleCount])

  const handleTouchStart = (event) => {
    touchStartRef.current = event.touches[0].clientX
  }

  const handleTouchEnd = (event) => {
    if (touchStartRef.current == null) return
    const delta = touchStartRef.current - event.changedTouches[0].clientX
    touchStartRef.current = null
    if (Math.abs(delta) < 40) return
    delta > 0 ? next() : prev()
  }

  useEffect(() => {
    if (isPaused || total <= visibleCount) return
    autoPlayRef.current = setInterval(next, AUTO_PLAY_MS)
    return () => clearInterval(autoPlayRef.current)
  }, [isPaused, next, total, visibleCount])

  const handleTransitionEnd = () => {
    if (currentIndex >= total + clones) {
      setIsJumping(true)
      setCurrentIndex(currentIndex - total)
    } else if (currentIndex < clones) {
      setIsJumping(true)
      setCurrentIndex(currentIndex + total)
    }
  }

  useEffect(() => {
    if (!isJumping) return
    const raf = requestAnimationFrame(() => setIsJumping(false))
    return () => cancelAnimationFrame(raf)
  }, [isJumping])

  if (total === 0) return isLoading ? <HeroBannerSkeleton /> : null

  const shiftPercent = (currentIndex / extended.length) * 100
  const realActiveIndex = ((currentIndex - clones) % total + total) % total

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[380px] rounded-3xl overflow-hidden mb-6 shrink-0 group"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        onTransitionEnd={handleTransitionEnd}
        className="flex h-full will-change-transform"
        style={{
          width: `${(extended.length / visibleCount) * 100}%`,
          transform: `translateX(-${shiftPercent}%)`,
          transition: isJumping ? 'none' : `transform ${TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      >
        {extended.map((item, i) => (
          <Slide
            key={`${item.imdbId || item.title}-${i}`}
            item={item}
            widthPercent={100 / extended.length}
            isActive={i === currentIndex}
            isLoading={loadingItemId === (item.imdbId || item.title)}
            onMoreInfo={onMoreInfo}
            onPlay={onPlay}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/30 to-transparent z-20 rounded-l-3xl" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/30 to-transparent z-20 rounded-r-3xl" />

      {total > visibleCount && (
        <>
          <button
            onClick={prev}
            aria-label="Previous slide"
            className="glass-capsule absolute left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={next}
            aria-label="Next slide"
            className="glass-capsule absolute right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </>
      )}

      {total > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 px-3 py-2 shadow-lg shadow-black/20">
          {heroItems.map((item, i) => (
            <button
              key={item.imdbId || item.title}
              onClick={() => goTo(clones + i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === realActiveIndex ? 'true' : undefined}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ease-out ${
                i === realActiveIndex ? 'bg-white scale-110' : 'bg-white/35 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Slide({ item, widthPercent, isActive, isLoading, onMoreInfo, onPlay }) {
  const { title, description, backdropUrl } = item
  const handlePrimary = () => {
    // Always show Play — if no direct videoUrl, treat as "More Info" but with Play affordance
    if (item.videoUrl) onPlay?.(item)
    else onMoreInfo?.(item)
  }

  return (
    <div className="relative h-full shrink-0" style={{ width: `${widthPercent}%` }}>
      <div className="relative w-full h-full overflow-hidden">
        {/* Ken-Burns-style zoom: active slide slowly scales up, inactive
            slides rest at baseline scale. transform is the only animated
            property here (never width/height), so this stays on the GPU
            compositor rather than triggering layout/paint on every frame —
            hence will-change-transform, matching the row-level pattern
            already used for the horizontal slide transform above. */}
        <img
          src={backdropUrl}
          alt={title}
          className={`absolute inset-0 w-full h-full object-cover will-change-transform transition-transform ease-out ${
            isActive ? 'scale-110 duration-[6500ms]' : 'scale-105 duration-700'
          }`}
        />
        {/* Deepened, wider top-to-bottom fade (vs. the previous flatter
            gradient) so the poster art dissolves further into the dark
            app shell rather than showing a visible seam at the hero's
            lower edge. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/15 to-transparent" />
        {/* Soft vignette on the far edge too, so the fade reads as
            enclosing the art on all sides rather than only top/left. */}
        <div className="absolute inset-0 bg-gradient-to-l from-black/30 via-transparent to-transparent" />

        <div className="relative z-10 h-full flex flex-col justify-end p-8 max-w-xl">
          <h2 className="text-3xl font-semibold text-white mb-2 drop-shadow-sm line-clamp-1">{title}</h2>
          <p className="text-neutral-200 text-sm leading-relaxed mb-5 line-clamp-2">{description}</p>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrimary}
              disabled={isLoading}
              className="glass-capsule flex min-w-28 items-center justify-center gap-2 px-4 py-2 text-white font-medium text-sm bg-white/20! hover:bg-white/30! transition-all duration-300 disabled:cursor-wait disabled:opacity-80"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="animate-pulse">Loading...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Play
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HeroBanner
