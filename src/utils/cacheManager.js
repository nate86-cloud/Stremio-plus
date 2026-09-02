import { getStreamingServerBaseUrl } from './streamingSettings'

const SERVER_TIMEOUT_MS = 1500

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// Fetch with a short timeout, since a non-running local server won't
// respond with a normal HTTP error — it'll just hang or refuse the
// connection, and we don't want the Settings page to freeze waiting on it.
async function fetchWithTimeout(url, options = {}, timeoutMs = SERVER_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

// Attempts to read cache info from the real local Stremio streaming server.
// Returns null if the server isn't running/reachable — that's an expected,
// normal outcome, not an error to alarm the user with.
export async function getServerCacheInfo() {
  const STREAMING_SERVER_BASE = getStreamingServerBaseUrl()
  try {
    const response = await fetchWithTimeout(`${STREAMING_SERVER_BASE}/settings`)
    if (!response.ok) return null
    const data = await response.json()

    // The real server reports cache size in different shapes depending on
    // version; we handle the common field name defensively.
    const cacheBytes = data.cacheSize ?? data.options?.cacheSize ?? null

    return {
      connected: true,
      cacheBytes,
      cacheLabel: cacheBytes != null ? formatBytes(cacheBytes) : 'Unknown',
      raw: data,
    }
  } catch {
    // Server not running, wrong port, CORS blocked, or timed out — all of
    // these just mean "not connected," which is a normal, expected state.
    return null
  }
}

// Attempts to purge the real server's cache. Returns true on success.
export async function purgeServerCache() {
  const STREAMING_SERVER_BASE = getStreamingServerBaseUrl()
  try {
    const response = await fetchWithTimeout(`${STREAMING_SERVER_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cacheSize: 0 }),
    })
    return response.ok
  } catch {
    return false
  }
}

// Reports how much this app itself has stored in localStorage (watch
// progress + auth key). Always works — no network, no dependency on any
// external server.
export function getLocalStorageInfo() {
  let totalBytes = 0
  const breakdown = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    const value = localStorage.getItem(key) || ''
    // Rough byte estimate: 2 bytes per UTF-16 character, which is how
    // browsers actually store strings internally.
    const bytes = value.length * 2
    totalBytes += bytes
    breakdown.push({ key, bytes })
  }

  return {
    connected: false,
    totalBytes,
    totalLabel: formatBytes(totalBytes),
    breakdown,
  }
}

// Clears only the app's own watch-history cache (not the auth key, so the
// user doesn't get silently logged out by a "purge cache" click).
export function purgeLocalStorageCache() {
  localStorage.removeItem('stremio_watch_progress')
}
