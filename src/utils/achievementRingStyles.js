// Maps an achievement tier (from utils/insights.js's getAchievementTier)
// to the visual configuration ProfileRing needs: gradient stops for the
// SVG stroke, and whether the ring should animate (only the top tier
// gets the glowing rotating treatment — applying that to every tier would
// make it feel cheap rather than earned).
//
// Colors chosen to read clearly against this app's OLED-black default
// background (see index.css --bg-base) and to be distinguishable from
// the app's own --color-accent (#0A84FF) so a ring never gets confused
// with an unrelated blue focus/selection state elsewhere in the UI.


const RING_STYLES = {
  bronze: {
    label: 'Bronze',
    gradientStops: ['#8C5A2B', '#B87333'],
    animated: false,
    glow: false,
  },
  silver: {
    label: 'Silver',
    gradientStops: ['#9CA3AF', '#E5E7EB', '#9CA3AF'],
    animated: false,
    glow: false,
  },
  gold: {
    label: 'Gold',
    gradientStops: ['#FFD60A', '#FF9F0A', '#FFD60A'],
    animated: false,
    glow: true,
  },
  diamond: {
    label: 'Diamond',
    // Multi-color, per the request's "animated glowing multi-color
    // gradient" spec for the top tier specifically.
    gradientStops: ['#64D2FF', '#BF5AF2', '#FF375F', '#FFD60A', '#64D2FF'],
    animated: true,
    glow: true,
  },
}


const DEFAULT_STYLE = RING_STYLES.bronze


// tier: one of ACHIEVEMENT_TIERS' id values ('bronze' | 'silver' | 'gold' | 'diamond')
export function mapAchievementsToRingStyle(tier) {
  return RING_STYLES[tier] || DEFAULT_STYLE
}


export function getAllRingStyles() {
  return RING_STYLES
}