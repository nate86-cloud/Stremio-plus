import { useState, useRef, useEffect } from 'react'
import { useTilt } from '../hooks/useTilt'
import { resolveTrailer, getTrailerEmbedUrl } from '../utils/trailerResolver'


// How long the mouse needs to rest on a card before we start resolving
// and playing a trailer preview. Long enough that quickly scanning
// across a row of cards doesn't fire a search per card; short enough to
// still feel responsive to someone who actually pauses to look.
const HOVER_INTENT_DELAY_MS = 500


// Formats remaining time compactly ("42m left", "1h 12m left") for the
// scrubber's inline label — deliberately terse since this renders inside
// a small overlay strip, not a full text block.
function formatTimeRemaining(currentTime, duration) {
  const remainingSeconds = Math.max(duration - currentTime, 0)
  const totalMinutes = Math.round(remainingSeconds / 60)
  if (totalMinutes < 1) return 'Less than a minute left'
  if (totalMinutes < 60) return `${totalMinutes}m left`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`
}


function MovieCard({
  title,
  year,
  posterUrl,
  imdbId,
  trailerId,
  onClick,
  progressPercent,
  duration,
  currentTime,
  hoverAutoplayEnabled = false,
  type,
  isLive,
}) {
  const [glowPos, setGlowPos] = useState({ x: 50, y: 50 })
  const tilt = useTilt({ maxTilt: 8, scale: 1.04 })


  const [previewYoutubeId, setPreviewYoutubeId] = useState(null)
  const [isPreviewReady, setIsPreviewReady] = useState(false)


  const hoverTimeoutRef = useRef(null)
  const previewReadyTimeoutRef = useRef(null)
  // Bumped on every enter/leave so an async trailer resolve that finishes
  // after the mouse has already left doesn't pop a preview in late.
  const hoverTokenRef = useRef(0)


  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setGlowPos({ x, y })
    tilt.onMouseMove(e)
  }


  function handleMouseEnter() {
    if (!hoverAutoplayEnabled) return
    if (['tv','channel','live'].includes(String(type||'').toLowerCase()) || isLive) return // LIVE channels: no trailer hover


    const token = ++hoverTokenRef.current


    hoverTimeoutRef.current = setTimeout(async () => {
      const resolved = await resolveTrailer({ title, year, imdbId, trailerId })
      // If the mouse left (or re-entered again) since this search
      // started, hoverTokenRef will have moved on — bail out silently.
      if (hoverTokenRef.current !== token) return
      if (resolved?.youtubeId) {
        setPreviewYoutubeId(resolved.youtubeId)
      }
    }, HOVER_INTENT_DELAY_MS)
  }


  function handleMouseLeave(e) {
    hoverTokenRef.current++ // invalidates any in-flight resolve tied to this hover
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    if (previewReadyTimeoutRef.current) {
      clearTimeout(previewReadyTimeoutRef.current)
      previewReadyTimeoutRef.current = null
    }
    // Unmounting the iframe (by clearing its id) is what actually stops
    // playback and network activity — there's no separate "pause" step.
    setPreviewYoutubeId(null)
    setIsPreviewReady(false)
    tilt.onMouseLeave(e)
  }


  function handlePreviewError() {
    // Keep the poster underneath as the graceful fallback for unavailable
    // or restricted YouTube videos.
    setPreviewYoutubeId(null)
    setIsPreviewReady(false)
  }


  // Guard against a lingering timer if the card unmounts mid-delay (e.g.
  // the row re-renders while the mouse is still hovering).
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
      if (previewReadyTimeoutRef.current) clearTimeout(previewReadyTimeoutRef.current)
    }
  }, [])


  return (
    <div
      ref={tilt.ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className="tilt-element group relative rounded-2xl overflow-hidden cursor-pointer bg-neutral-200 dark:bg-neutral-800 aspect-[2/3] shadow-sm hover:shadow-2xl"
    >
      <img
        src={posterUrl}
        alt={title}
        loading="lazy"
        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
      />

      {(['tv','channel','live'].includes(String(type||'').toLowerCase()) || isLive) && (
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold tracking-widest shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE
        </div>
      )}


      {previewYoutubeId && (
        <iframe
          src={getTrailerEmbedUrl(previewYoutubeId, {
            autoplay: true,
            muted: true,
            loop: true,
            controls: false,
          })}
          title={`${title} trailer preview`}
          allow="autoplay; encrypted-media"
          frameBorder="0"
          onLoad={() => {
            // YouTube shows its large central pause/next overlay for ~1.5s
            // at the very start even with controls=0. Delaying the fade-in
            // until that overlay has auto-hidden shortens the visible
            // controls to a flash instead of a lingering bar.
            previewReadyTimeoutRef.current = setTimeout(() => setIsPreviewReady(true), 1200)
          }}
          onError={handlePreviewError}
          // pointer-events-none is important: without it, clicking the
          // card while a preview is playing would hit the YouTube iframe
          // instead of firing onClick and opening the detail modal.
          className={
            "absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-500 " +
            (isPreviewReady ? "opacity-100" : "opacity-0")
          }
        />
      )}


      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(circle 180px at ${glowPos.x}% ${glowPos.y}%, rgba(255,255,255,0.25), transparent 70%)`,
        }}
      />


      <div className="tilt-glare opacity-0 group-hover:opacity-100 transition-opacity duration-300" />


      <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/0 group-hover:ring-white/20 transition-all duration-300 pointer-events-none" />


      <div className="absolute bottom-0 left-0 right-0 p-3 pb-6 bg-white/40 dark:bg-black/40 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <p className="text-sm font-medium truncate text-neutral-900 dark:text-white">{title}</p>
        <p className="text-xs text-neutral-600 dark:text-neutral-300">{year}</p>
      </div>


      {typeof progressPercent === 'number' && !(['tv','channel','live'].includes(String(type||'').toLowerCase()) || isLive) && (
        <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2 pt-4 pointer-events-none z-10">
          {/* Time-remaining label sits directly above the track, shown
              whenever we have real duration/currentTime to compute it
              from — "if space permits" is satisfied by only rendering
              it when the data exists, rather than reserving layout
              space for it unconditionally. */}
          {typeof duration === 'number' && typeof currentTime === 'number' && duration > 0 && (
            <p className="text-[11px] font-medium text-white/90 mb-1 drop-shadow-sm leading-none">
              {formatTimeRemaining(currentTime, duration)}
            </p>
          )}
          <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-300"
              style={{
                width: `${Math.min(Math.max(progressPercent, 0), 100)}%`,
                boxShadow: '0 0 6px 1px rgba(255,255,255,0.6), 0 0 10px 2px var(--color-accent, transparent)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}


export default MovieCard