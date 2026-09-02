import { addonFetch } from './addonFetch'

const STORAGE_KEY = 'stremio_streaming_server_settings'
export const DEFAULT_STREAMING_SERVER_BASE = 'http://127.0.0.1:11470'

export const DEFAULT_STREAMING_SETTINGS = {
  https: false,
  torrentProfile: 'default',
  transcodeProfile: 'disabled',
  streamingServerUrl: '',
  cacheSize: '2gb',
  proxyUrl: '',
  // MediaFlow / StremThru proxy for HLS/M3U8 routing
  stremThruProxyUrl: '',
}

export const CACHE_SIZE_OPTIONS = [
  { value: 'none', label: 'No Caching', bytes: 0, display: 'No Caching (0 bytes)' },
  { value: '2gb', label: '2GB', bytes: 2 * 1024 * 1024 * 1024, display: '2GB' },
  { value: '5gb', label: '5GB', bytes: 5 * 1024 * 1024 * 1024, display: '5GB' },
  { value: '10gb', label: '10GB', bytes: 10 * 1024 * 1024 * 1024, display: '10GB' },
  { value: 'infinite', label: 'INFINITE', bytes: 1024 * 1024 * 1024 * 1024, display: 'INFINITE (1 TB)' }, // very high threshold = infinite
]

const CACHE_SIZE_MAP = {
  none: 0,
  '0': 0,
  'No Caching': 0,
  '2gb': 2 * 1024 * 1024 * 1024,
  '5gb': 5 * 1024 * 1024 * 1024,
  '10gb': 10 * 1024 * 1024 * 1024,
  infinite: 1024 * 1024 * 1024 * 1024,
  INFINITE: 1024 * 1024 * 1024 * 1024,
}

function cacheBytesToLabel(bytes) {
  if (bytes === 0 || bytes === null) return 'none'
  if (bytes >= 1024 * 1024 * 1024 * 1024) return 'infinite'
  if (bytes >= 10 * 1024 * 1024 * 1024) return '10gb'
  if (bytes >= 5 * 1024 * 1024 * 1024) return '5gb'
  if (bytes >= 2 * 1024 * 1024 * 1024) return '2gb'
  return '2gb'
}

export function cacheLabelToBytes(label) {
  if (!label) return CACHE_SIZE_MAP['2gb']
  const key = String(label).toLowerCase()
  return CACHE_SIZE_MAP[key] ?? CACHE_SIZE_MAP[label] ?? CACHE_SIZE_MAP['2gb']
}

export function getCacheSizeDisplay(label) {
  const opt = CACHE_SIZE_OPTIONS.find((o) => o.value === String(label).toLowerCase())
  return opt ? opt.display : label
}

export function normalizeProxyUrl(url) {
  if (!url || typeof url !== 'string') return ''
  let trimmed = url.trim()
  if (!trimmed) return ''
  trimmed = trimmed.replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    if (!parsed.host) return ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

export function isValidProxyUrl(url) {
  if (!url || !url.trim()) return true // empty = no proxy, valid
  return normalizeProxyUrl(url) !== ''
}

export function getProxyUrl() {
  const local = readLocalSettings()
  if (local?.proxyUrl && typeof local.proxyUrl === 'string' && local.proxyUrl.trim()) {
    const normalized = normalizeProxyUrl(local.proxyUrl)
    if (normalized) return normalized
    return local.proxyUrl.trim().replace(/\/$/, '')
  }
  if (local?.stremThruProxyUrl && typeof local.stremThruProxyUrl === 'string' && local.stremThruProxyUrl.trim()) {
    const normalized = normalizeProxyUrl(local.stremThruProxyUrl)
    if (normalized) return normalized
    return local.stremThruProxyUrl.trim().replace(/\/$/, '')
  }
  try {
    const userSettingsRaw = localStorage.getItem('stremio_user_settings')
    if (userSettingsRaw) {
      const userSettings = JSON.parse(userSettingsRaw)
      const cloudProxy = userSettings?.streamingSettings?.proxyUrl ?? userSettings?.streamingSettings?.stremThruProxyUrl ?? userSettings?.proxyUrl ?? null
      if (cloudProxy && typeof cloudProxy === 'string' && cloudProxy.trim()) {
        const normalized = normalizeProxyUrl(cloudProxy)
        if (normalized) return normalized
        return cloudProxy.trim().replace(/\/$/, '')
      }
    }
  } catch {}
  return ''
}

export function getProxiedStreamUrl(originalUrl) {
  const proxy = getProxyUrl()
  if (!proxy || !originalUrl) return originalUrl
  // If proxy contains {url} placeholder, replace it (e.g. https://proxy.example.com/fetch?url={url})
  if (proxy.includes('{url}')) {
    return proxy.replace('{url}', encodeURIComponent(originalUrl))
  }
  // MediaFlow / StremThru common patterns:
  // - https://proxy.example.com?url=ENCODED
  // - https://proxy.example.com/proxy?url=ENCODED
  // Heuristic: if proxy already has ?, append &url=, else ?url=
  const separator = proxy.includes('?') ? '&' : '?'
  // For HLS/M3U8, MediaFlow often expects /hls?url= or /proxy?url=
  // We use the generic ?url= which works for most proxies; users can use {url} for custom templates
  return `${proxy}${separator}url=${encodeURIComponent(originalUrl)}`
}

export function normalizeStreamingServerUrl(url) {
  if (!url || typeof url !== 'string') return ''
  let trimmed = url.trim()
  if (!trimmed) return ''
  // Remove trailing slashes
  trimmed = trimmed.replace(/\/+$/, '')
  // Auto-prepend http:// if no protocol provided (e.g. "192.168.1.10:11470")
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`
  }
  try {
    const parsed = new URL(trimmed)
    // Only allow http/https — refuse file:, javascript:, etc.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    // Basic host validation — must have host
    if (!parsed.host) return ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

export function isValidStreamingServerUrl(url) {
  if (!url || !url.trim()) return true // empty = fallback to default, considered valid
  return normalizeStreamingServerUrl(url) !== ''
}

export function readLocalSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return { ...DEFAULT_STREAMING_SETTINGS, ...value }
  } catch (err) {
    console.warn('[streamingSettings] Failed to read local settings:', err.message)
    return { ...DEFAULT_STREAMING_SETTINGS }
  }
}

export function getStreamingServerBaseUrl() {
  const local = readLocalSettings()
  if (local?.streamingServerUrl && typeof local.streamingServerUrl === 'string' && local.streamingServerUrl.trim()) {
    const normalized = normalizeStreamingServerUrl(local.streamingServerUrl)
    if (normalized) return normalized
    // If stored value is malformed, fall back rather than using garbage
    return local.streamingServerUrl.trim().replace(/\/$/, '')
  }
  // Fallback to cloud-synced userSettings if local is empty — enables cross-device carryover
  try {
    const userSettingsRaw = localStorage.getItem('stremio_user_settings')
    if (userSettingsRaw) {
      const userSettings = JSON.parse(userSettingsRaw)
      const cloudUrl =
        userSettings?.streamingSettings?.streamingServerUrl ??
        userSettings?.streamingServerUrl ??
        null
      if (cloudUrl && typeof cloudUrl === 'string' && cloudUrl.trim()) {
        const normalized = normalizeStreamingServerUrl(cloudUrl)
        if (normalized) return normalized
        return cloudUrl.trim().replace(/\/$/, '')
      }
    }
  } catch {}
  return DEFAULT_STREAMING_SERVER_BASE
}

function persistLocalSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  // Hydrate userSettings so cloud sync picks it up even before explicit save
  try {
    const current = JSON.parse(localStorage.getItem('stremio_user_settings') || '{}')
    if (JSON.stringify(current.streamingSettings) !== JSON.stringify(settings)) {
      // Don't dispatch here — saveStreamingSettings handles the event;
      // this is just for readLocal fallback consistency.
    }
  } catch {}
}

export function hydrateStreamingSettingsFromCloud() {
  try {
    const local = readLocalSettings()
    // If local already has a value, respect it — don't overwrite user's local choice
    if (local?.streamingServerUrl && local.streamingServerUrl.trim()) return local
    const userSettingsRaw = localStorage.getItem('stremio_user_settings')
    if (!userSettingsRaw) return local
    const userSettings = JSON.parse(userSettingsRaw)
    const cloudSettings = userSettings?.streamingSettings
    if (cloudSettings && typeof cloudSettings.streamingServerUrl === 'string' && cloudSettings.streamingServerUrl.trim()) {
      const hydrated = { ...local, streamingServerUrl: cloudSettings.streamingServerUrl.trim() }
      persistLocalSettings(hydrated)
      return hydrated
    }
  } catch (err) {
    console.warn('[streamingSettings] Failed to hydrate from cloud:', err.message)
  }
  return readLocalSettings()
}

export async function getStreamingSettings() {
  // Attempt cloud hydration before server fetch so remote URL is available even offline
  hydrateStreamingSettingsFromCloud()
  const fallback = readLocalSettings()
  const serverBase = getStreamingServerBaseUrl()
  try {
    const response = await addonFetch(`${serverBase}/settings`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const serverSettings = await response.json()
    const serverCacheBytes = serverSettings.cacheSize ?? serverSettings.options?.cacheSize ?? null
    const settings = {
      ...fallback,
      ...serverSettings,
      streamingServerUrl: fallback.streamingServerUrl || '',
      proxyUrl: fallback.proxyUrl || fallback.stremThruProxyUrl || '',
      stremThruProxyUrl: fallback.stremThruProxyUrl || fallback.proxyUrl || '',
      https: serverSettings.https ?? serverSettings.httpsEnabled ?? fallback.https,
      torrentProfile: serverSettings.torrentProfile || fallback.torrentProfile,
      transcodeProfile: serverSettings.transcodeProfile || fallback.transcodeProfile,
      cacheSize: serverCacheBytes != null ? cacheBytesToLabel(serverCacheBytes) : fallback.cacheSize || '2gb',
    }
    persistLocalSettings(settings)
    return { settings, connected: true }
  } catch (err) {
    console.warn('[streamingSettings] Server unavailable, using local settings:', err.message)
    return { settings: fallback, connected: false }
  }
}

export async function saveStreamingSettings(patch) {
  // Normalize URLs on save so malformed input is caught early and stored cleanly
  const normalizedPatch = { ...patch }
  if ('streamingServerUrl' in normalizedPatch) {
    const raw = normalizedPatch.streamingServerUrl
    if (raw && typeof raw === 'string' && raw.trim()) {
      const normalized = normalizeStreamingServerUrl(raw)
      normalizedPatch.streamingServerUrl = normalized || raw.trim()
    } else {
      normalizedPatch.streamingServerUrl = ''
    }
  }
  if ('proxyUrl' in normalizedPatch) {
    const raw = normalizedPatch.proxyUrl
    if (raw && typeof raw === 'string' && raw.trim()) {
      const normalized = normalizeProxyUrl(raw)
      normalizedPatch.proxyUrl = normalized || raw.trim()
    } else {
      normalizedPatch.proxyUrl = ''
    }
    // Keep stremThruProxyUrl in sync for backward compat
    normalizedPatch.stremThruProxyUrl = normalizedPatch.proxyUrl
  }
  if ('stremThruProxyUrl' in normalizedPatch) {
    const raw = normalizedPatch.stremThruProxyUrl
    if (raw && typeof raw === 'string' && raw.trim()) {
      const normalized = normalizeProxyUrl(raw)
      normalizedPatch.stremThruProxyUrl = normalized || raw.trim()
    } else {
      normalizedPatch.stremThruProxyUrl = ''
    }
    if (!('proxyUrl' in normalizedPatch)) normalizedPatch.proxyUrl = normalizedPatch.stremThruProxyUrl
  }

  const settings = { ...readLocalSettings(), ...normalizedPatch }
  persistLocalSettings(settings)

  // Sync with Supabase profile settings table for cross-device carryover
  // via the stremio:user-settings-changed event that SupabaseContext listens for.
  if (typeof window !== 'undefined') {
    try {
      const current = JSON.parse(localStorage.getItem('stremio_user_settings') || '{}')
      const updated = { ...current, streamingSettings: settings }
      // Also keep flat key for backward compat
      updated.streamingServerUrl = settings.streamingServerUrl
      localStorage.setItem('stremio_user_settings', JSON.stringify(updated))
      window.dispatchEvent(new CustomEvent('stremio:user-settings-changed', { detail: updated }))
    } catch (e) {
      console.warn('[streamingSettings] Failed to dispatch user-settings event:', e)
    }
  }

  const serverBase = getStreamingServerBaseUrl()
  // Also try to update the local stremio-server/server-settings.json file via Electron
  // for persistence when the server is not running (so next launch uses the new cacheSize)
  if (typeof window !== 'undefined' && window.electronAPI?.updateServerSettings) {
    try {
      const filePatch = {}
      if ('cacheSize' in normalizedPatch) {
        filePatch.cacheSize = cacheLabelToBytes(normalizedPatch.cacheSize)
      }
      if (Object.keys(filePatch).length > 0) {
        window.electronAPI.updateServerSettings(filePatch).catch(() => {})
      }
    } catch {}
  }
  try {
    // Don't POST streamingServerUrl/proxyUrl to the server itself — they're client-side
    // routing preferences, not server settings. Only send server-relevant keys.
    const { streamingServerUrl: _ignored, proxyUrl: _proxyIgnored, stremThruProxyUrl: _stremThruIgnored, ...serverPatch } = normalizedPatch
    void _ignored; void _proxyIgnored; void _stremThruIgnored
    // Map cacheSize label to bytes for server (server expects bytes, not '2gb' string)
    const serverPatchWithBytes = { ...serverPatch }
    if ('cacheSize' in serverPatchWithBytes) {
      serverPatchWithBytes.cacheSize = cacheLabelToBytes(serverPatchWithBytes.cacheSize)
    }
    // If patch was only client-side URLs, no need to POST to server — they're local-only
    if (Object.keys(serverPatchWithBytes).length === 0) {
      return { settings, connected: true }
    }
    const response = await addonFetch(`${serverBase}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serverPatchWithBytes),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return { settings, connected: true }
  } catch (err) {
    console.warn('[streamingSettings] Failed to persist settings to server:', err.message)
    return { settings, connected: false }
  }
}
