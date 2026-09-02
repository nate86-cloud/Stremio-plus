const avatarPalettes = {
  aurora: ['#7dd3fc', '#a78bfa', '#f9a8d4', '#fef3c7'],
  ember: ['#f97316', '#fb7185', '#facc15', '#fdba74'],
  forest: ['#34d399', '#2dd4bf', '#a3e635', '#86efac'],
  twilight: ['#818cf8', '#c084fc', '#f472b6', '#fca5a5'],
  slate: ['#94a3b8', '#cbd5e1', '#e2e8f0', '#a5b4fc'],
  sunrise: ['#fb7185', '#fbbf24', '#f59e0b', '#f9a8d4'],
}

const initialsFromName = (name = '') => {
  const trimmed = String(name).trim()
  if (!trimmed) return 'S'

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

const hashString = (value = '') => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const getAvatarPalette = (seed = '') => {
  const paletteNames = Object.keys(avatarPalettes)
  const index = hashString(String(seed)) % paletteNames.length
  return avatarPalettes[paletteNames[index]]
}

const buildAvatarSvg = ({ name = 'Stremio', size = 96, seed = '' } = {}) => {
  const palette = getAvatarPalette(seed || name)
  const safeSize = Number(size) || 96
  const initials = initialsFromName(name)
  const [c1, c2, c3, c4] = palette

  const gradientId = `avatar-gradient-${hashString(String(seed || name))}`
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 96 96" role="img" aria-label="${initials} avatar">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${c1}" />
          <stop offset="50%" stop-color="${c2}" />
          <stop offset="100%" stop-color="${c3}" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="28" fill="url(#${gradientId})"/>
      <circle cx="72" cy="26" r="18" fill="${c4}" opacity="0.82"/>
      <circle cx="26" cy="68" r="22" fill="rgba(255,255,255,0.14)"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.96)" font-size="32" font-weight="700" font-family="Arial, sans-serif" letter-spacing="1">${initials}</text>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export const getFallbackAvatarGradient = (seed = '') => {
  const palette = getAvatarPalette(seed)
  return {
    background: `linear-gradient(135deg, ${palette[0]} 0%, ${palette[1]} 50%, ${palette[2]} 100%)`,
    accent: palette[3],
  }
}

export const getAvatarUrl = ({ name, size = 96, seed } = {}) => buildAvatarSvg({ name, size, seed })

export const getAvatarData = ({ name = 'Stremio', size = 96, seed = '' } = {}) => {
  const palette = getAvatarPalette(seed || name)
  const initials = initialsFromName(name)

  return {
    initials,
    palette,
    size: Number(size) || 96,
    url: buildAvatarSvg({ name, size, seed }),
  }
}

export default {
  getAvatarUrl,
  getAvatarData,
  getFallbackAvatarGradient,
  avatarPalettes,
}
