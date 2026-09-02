import { useState, useEffect } from 'react'
import { getActiveCue } from '../utils/srtParser'

// Renders the currently active subtitle line over the video. Polls the
// video's currentTime via requestAnimationFrame for smooth, accurate
// sync (better than relying on the sparser 'timeupdate' event, which
// only fires a few times per second).
function SubtitleOverlay({
  videoRef,
  cues,
  offsetMs = 0,
  fontFamily = 'system-ui',
  fontSize = 'medium',
  shadow = true,
  backgroundOpacity = 0.35,
}) {
  const [activeCue, setActiveCue] = useState(null)

  useEffect(() => {
    if (!cues || cues.length === 0) {
      setActiveCue(null)
      return
    }

    let frameId
    function tick() {
      const video = videoRef.current
      if (video) {
        const cue = getActiveCue(cues, video.currentTime, offsetMs)
        setActiveCue((prev) => (prev === cue ? prev : cue))
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frameId)
  }, [cues, offsetMs, videoRef])

  if (!activeCue) return null

  const sizeClass = fontSize === 'small' ? 'text-sm' : fontSize === 'large' ? 'text-2xl' : 'text-lg'

  return (
    <div
      className="absolute bottom-24 left-0 right-0 flex justify-center px-8 pointer-events-none z-10"
      style={{ contain: 'layout paint', willChange: 'transform, opacity', transform: 'translateZ(0)' }}
    >
      <div
        className={`glass-panel rounded-xl px-4 py-2 text-white text-center font-medium ${sizeClass} will-change-transform`}
        style={{
          whiteSpace: 'pre-line',
          fontFamily,
          backgroundColor: `rgba(0, 0, 0, ${backgroundOpacity})`,
          textShadow: shadow ? '0 1px 3px rgba(0,0,0,0.8)' : 'none',
          contain: 'layout paint',
          willChange: 'transform, opacity',
        }}
      >
        {activeCue.text}
      </div>
    </div>
  )
}

export default SubtitleOverlay
