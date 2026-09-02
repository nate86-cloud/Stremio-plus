// Generates profile avatar options. Previously this logic lived inline in
// ProfileMenu.jsx and was hardcoded to a single DiceBear collection
// (avataaars — human-figure avatars only). This util supports any valid
// DiceBear style/collection, plus arbitrary custom image URLs, so a
// profile isn't restricted to human figures.
//
// DiceBear's public API takes the form:
//   https://api.dicebear.com/9.x/{style}/svg?seed={seed}
// Every style below is a real, current DiceBear 9.x collection — mixing
// human-figure, bot, abstract, and icon-style options.

export const AVATAR_STYLES = [
  { id: 'avataaars', label: 'Human' },
  { id: 'bottts', label: 'Bot' },
  { id: 'identicon', label: 'Identicon' },
  { id: 'shapes', label: 'Shapes' },
  { id: 'fun-emoji', label: 'Emoji' },
  { id: 'adventurer', label: 'Adventurer' },
  { id: 'pixel-art', label: 'Pixel Art' },
  { id: 'rings', label: 'Rings' },
]

const DEFAULT_STYLE = 'avataaars'

export function buildDicebearUrl(style, seed) {
  const safeStyle = AVATAR_STYLES.some((s) => s.id === style) ? style : DEFAULT_STYLE
  return `https://api.dicebear.com/9.x/${safeStyle}/svg?seed=${encodeURIComponent(seed)}` 
}

/**
 * Generates a batch of avatar options for a single DiceBear style — used
 * by the avatar picker's grid. Each option gets its own random seed so
 * the same style still produces visually distinct choices.
 */
export function generateAvatarOptions(style, count = 10) {
  const uniqueSeeds = new Set()
  while (uniqueSeeds.size < count) {
    uniqueSeeds.add(Math.random().toString(36).slice(2, 12))
  }

  return Array.from(uniqueSeeds).map((seed) => ({
    seed,
    style,
    url: buildDicebearUrl(style, seed),
  }))
}

/**
 * Validates a user-supplied custom avatar URL. Kept intentionally
 * permissive (any http/https URL) since we can't verify image content
 * client-side without fetching it — the picker shows a live <img> preview
 * so a broken URL is visually obvious before the user confirms it.
 */
export function isValidCustomAvatarUrl(url) {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
