import { useRef } from 'react'
import { mapAchievementsToRingStyle } from '../utils/achievementRingStyles'


// Unique per mount so multiple rings on screen at once (Navbar + Profile
// Menu + a profile switcher list, say) never collide on the same SVG
// gradient id — colliding ids would make every ring on the page render
// whichever gradient definition happened to be parsed last.
let ringInstanceCounter = 0


// size: pixel diameter of the avatar itself. The ring stroke sits just
// outside it, so the rendered footprint is slightly larger than `size` —
// callers should give the wrapping layout a little breathing room.
// tier: 'bronze' | 'silver' | 'gold' | 'diamond' | null/undefined.
// enabled: the Settings → Appearance → "Display Achievement Rings"
// toggle. When false, renders the avatar with no ring at all rather than
// a neutral placeholder ring — the feature should be fully invisible
// when off, not just "off but still taking up space."
function ProfileRing({ avatarUrl, alt = 'Profile', tier, enabled = true, size = 44 }) {
  // Computed once per mounted instance, not per render — a fresh id on
  // every render would make React treat the <linearGradient> as a new
  // element each time for no reason, and risks a one-frame mismatch
  // between the <circle>'s stroke url(#...) reference and the id the
  // <defs> block actually rendered with.
  const gradientIdRef = useRef(null)
  if (!gradientIdRef.current) {
    gradientIdRef.current = `profile-ring-gradient-${++ringInstanceCounter}`
  }
  const gradientId = gradientIdRef.current


  if (!enabled || !tier) {
    return (
      <img
        src={avatarUrl}
        alt={alt}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }


  const style = mapAchievementsToRingStyle(tier)
  const strokeWidth = Math.max(2, Math.round(size * 0.06))
  const svgSize = size + strokeWidth * 2
  const radius = (svgSize - strokeWidth) / 2
  const center = svgSize / 2


  return (
    <div
      className="relative shrink-0"
      style={{ width: svgSize, height: svgSize }}
      title={`${style.label} tier`}
    >
      <svg
        width={svgSize}
        height={svgSize}
        className={style.animated ? 'animate-[spin_6s_linear_infinite]' : ''}
        style={{
          position: 'absolute',
          inset: 0,
          filter: style.glow ? `drop-shadow(0 0 ${Math.max(3, size * 0.08)}px ${style.gradientStops[0]}99)` : undefined,
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {style.gradientStops.map((color, i) => (
              <stop
                key={i}
                offset={`${(i / (style.gradientStops.length - 1)) * 100}%`}
                stopColor={color}
              />
            ))}
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
        />
      </svg>


      <img
        src={avatarUrl}
        alt={alt}
        className="absolute rounded-full object-cover"
        style={{
          width: size,
          height: size,
          top: strokeWidth,
          left: strokeWidth,
        }}
      />
    </div>
  )
}


export default ProfileRing