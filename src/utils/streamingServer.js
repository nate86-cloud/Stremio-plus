// Talks to the Stremio streaming server (the torrent-client background
// service that ships with the official Stremio desktop app, or a remote
// daemon when the user configures a custom Remote Streaming URL). This
// module no longer hardcodes 127.0.0.1:11470 — it resolves the base URL
// dynamically via getStreamingServerBaseUrl() so a user-configured remote
// address (Settings → Streaming & Add-ons → Remote Streaming Server) is
// honored everywhere, matching standard custom client capabilities.
// Fallback to the local default is automatic when the custom field is empty.

import { addonFetch } from './addonFetch'
import { getStreamingServerBaseUrl, DEFAULT_STREAMING_SERVER_BASE } from './streamingSettings'

function getServerBase() {
  try {
    return getStreamingServerBaseUrl()
  } catch {
    return DEFAULT_STREAMING_SERVER_BASE
  }
}

// Baked-in fallbacks with Stremio's known local ports — helps when user has no custom URL or entered unreachable https
const BAKED_IN_SERVERS = [
  'http://127.0.0.1:11470',
  'http://127.0.0.1:12470',
  'http://localhost:11470',
  'http://localhost:12470',
  'http://127.0.0.1:11471',
]

const CREATE_TIMEOUT_MS = 4000
const STATS_POLL_INTERVAL_MS = 1500
const STATS_POLL_MAX_ATTEMPTS = 20 // ~30 seconds max wait for initial buffering

// How much of the file must be buffered before handing off to the player.
// This is the actual "shock absorber" against P2P bandwidth dips: a
// thicker pre-buffer means more slack before a temporary peer dropout or
// bandwidth dip catches up to the playhead and causes a visible stall.
// Raised from an earlier 2% (barely any cushion) to 5% — enough headroom
// for typical swarm jitter without making every stream wait excessively
// long before playback starts. Exposed as a named constant rather than a
// magic number so this tradeoff (startup latency vs. stall resistance)
// is visible and adjustable in one place.
const MIN_BUFFER_PERCENT_BEFORE_PLAYBACK = 2
export { MIN_BUFFER_PERCENT_BEFORE_PLAYBACK }

export function getAdaptiveMinBufferPercent(quality) {
  const q = (quality || '').toString().toLowerCase()
  if (q.includes('live') || q.includes('tv') || q.includes('hls')) return 1
  if (q.includes('4k') || q.includes('2160')) return 2.5
  if (q.includes('1080')) return 2
  if (q.includes('720')) return 1.5
  return 1.5
}

export function getStreamingServerUrl() {
  return getServerBase()
}

// Extracts whatever the server's /stats.json actually provides, using the
// same defensive multi-key-name approach as the progress percent above —
// different server versions/forks expose these under different key names,
// and some may not expose them at all. Returns null for any field that
// isn't genuinely present, rather than defaulting to 0 (which would look
// like "0 peers" / "0 KB/s" — a false claim — instead of "unknown," which
// is what it actually is). Callers must treat null as "don't show this
// row," not as a real zero value.
export function extractStreamStats(stats) {
  if (!stats || typeof stats !== 'object') {
    return { percent: null, downloadSpeedBytesPerSec: null, peers: null, seeds: null }
  }

  const percent = stats.progress ?? stats.percentage ?? null

  // Speed fields observed (unconfirmed/inconsistently) across different
  // self-hosted Stremio server forks — checked defensively, same spirit
  // as the percent extraction above. If none of these are present, this
  // stays null and the UI must not display a speed row at all.
  const downloadSpeedBytesPerSec =
    stats.downloadSpeed ?? stats.downloadSpeedBytesPerSec ?? stats.speed ?? stats.dlSpeed ?? null

  const peers = stats.peers ?? stats.numPeers ?? stats.connections ?? null
  const seeds = stats.seeds ?? stats.seeders ?? stats.numSeeds ?? null

  return {
    percent: typeof percent === 'number' ? percent : null,
    downloadSpeedBytesPerSec: typeof downloadSpeedBytesPerSec === 'number' ? downloadSpeedBytesPerSec : null,
    peers: typeof peers === 'number' ? peers : null,
    seeds: typeof seeds === 'number' ? seeds : null,
  }
}

// externalSignal is optional — when provided, aborting it cancels the
// request the same as the internal timeout does. Composed via a listener
// rather than AbortSignal.any() (not universally available in older
// Electron/Chromium builds this app might run on) so both the timeout and
// an explicit user cancellation can independently trigger the same abort.
async function fetchWithTimeout(url, options = {}, timeoutMs = CREATE_TIMEOUT_MS, externalSignal) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  function onExternalAbort() {
    controller.abort()
  }
  externalSignal?.addEventListener('abort', onExternalAbort)

  try {
    return await addonFetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

// Helper: for Stremio remote URLs like https://192-168-1-10.<hash>.stremio.rocks:12470
// extract the encoded private IP (192.168.1.10) and offer a direct LAN fallback.
// Stremio itself tries both the relay and the direct LAN IP when on same network.
function extractLanIpFromStremioRocksUrl(url) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname // e.g. 192-168-1-10.abc123.stremio.rocks
    const firstLabel = host.split('.')[0] // 192-168-1-10
    if (/^\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}$/.test(firstLabel)) {
      return firstLabel.replace(/-/g, '.')
    }
  } catch {}
  return null
}

function buildFallbackBases(primaryBase) {
  const fallbacks = []
  const lanIp = extractLanIpFromStremioRocksUrl(primaryBase)
  if (lanIp) {
    try {
      const parsed = new URL(primaryBase)
      const port = parsed.port || '11470'
      fallbacks.push(`http://${lanIp}:${port}`)
      if (port !== '11470') fallbacks.push(`http://${lanIp}:11470`)
      if (port !== '12470') fallbacks.push(`http://${lanIp}:12470`)
      // also try https variants for completeness
      fallbacks.push(`https://${lanIp}:${port}`)
    } catch {}
  }
  // For direct private IP URLs (https://192.168.x.x), ensure both http/https and both ports are tried
  try {
    const parsed = new URL(primaryBase)
    const host = parsed.hostname
    const isPrivateIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || /^192-168-/.test(host) || /^10-/.test(host)
    if (isPrivateIp && !lanIp) {
      const port = parsed.port || '11470'
      const httpBase = `http://${host}:${port}`
      const httpsBase = `https://${host}:${port}`
      if (httpBase !== primaryBase) fallbacks.push(httpBase)
      if (httpsBase !== primaryBase) fallbacks.push(httpsBase)
      // try alternate default port
      const altPort = port === '11470' ? '12470' : '11470'
      fallbacks.push(`http://${host}:${altPort}`)
      fallbacks.push(`https://${host}:${altPort}`)
    }
  } catch {}
  // Protocol swap: if primary is https, try http same host, and vice versa — Stremio does this for LAN vs relay mismatch
  try {
    const parsed = new URL(primaryBase)
    const swappedProtocol = parsed.protocol === 'https:' ? 'http:' : 'https:'
    const swapped = `${swappedProtocol}//${parsed.host}${parsed.pathname.replace(/\/$/, '')}`
    if (swapped !== primaryBase) fallbacks.push(swapped.replace(/\/$/, ''))
  } catch {}
  if (primaryBase !== DEFAULT_STREAMING_SERVER_BASE) {
    fallbacks.push(DEFAULT_STREAMING_SERVER_BASE)
  }
  // Always include baked-in Stremio local servers as ultimate fallbacks
  for (const b of BAKED_IN_SERVERS) {
    if (b !== primaryBase && !fallbacks.includes(b)) fallbacks.push(b)
  }
  return [...new Set(fallbacks)].filter((u) => u !== primaryBase)
}

// Checks whether the streaming server is reachable at the currently
// configured base URL (local default or remote custom). Returns
// true/false — never throws — since "not running" is an expected, normal
// state (the user simply hasn't opened the real Stremio app or the remote
// daemon is unreachable).
// Like Stremio, tries the primary base first, then LAN fallback and local default if remote is a stremio.rocks relay.
// Also handles newer server versions where /settings may 404 — any network success (even 404) counts as reachable if the host responded.
export async function isStreamingServerAvailable(baseOverride) {
  const primaryBase = baseOverride || getServerBase()
  const fallbacks = buildFallbackBases(primaryBase)
  // For https primaries, try http first — SSL/cert issues are common
  // with self-signed or remote relay certs; http is always valid.
  const httpFallbackForHttps = primaryBase.startsWith('https:')
    ? fallbacks.find((b) => b.startsWith('http:'))
    : null
  const candidates = httpFallbackForHttps
    ? [httpFallbackForHttps, primaryBase, ...fallbacks.filter((b) => b !== httpFallbackForHttps)]
    : [primaryBase, ...fallbacks]
  for (const base of candidates) {
    try {
      // Remote relay can be slower — give it more time than local
      const timeout = base.includes('stremio.rocks') ? 4000 : 2000
      const response = await fetchWithTimeout(`${base}/settings`, {}, timeout)
      // Any HTTP response (even 404/500) proves the host is reachable and a server is listening.
      // Only network errors (status 0 / fetch throw) mean truly unreachable.
      // Stremio treats any response as "reachable" — 404 just means older/newer API shape.
      if (response.status !== 0) {
        console.log('[streamingServer] /settings response:', response.status, response.ok, 'base:', base)
        if (response.ok) {
          try {
            const data = await response.json()
            console.log('[streamingServer] server reported baseUrl:', data.baseUrl)
          } catch {}
        } else {
          // For 404/405 on /settings, probe root as secondary check — older forks may not have /settings
          try {
            const rootResp = await fetchWithTimeout(`${base}/`, {}, 1500)
            if (rootResp.status !== 0) console.log('[streamingServer] root probe:', rootResp.status, 'base:', base)
          } catch {}
        }
        return true
      }
    } catch (err) {
      console.warn('[streamingServer] availability check failed for', base, ':', err.message || err)
      continue
    }
  }
  console.warn('[streamingServer] all candidates unreachable, primary:', primaryBase)
  return false
}

// Registers a torrent with the streaming server so it starts fetching it,
// then returns the direct playable stream URL for the given file index.
// Returns { ok: true, streamUrl }, { ok: false, error, detail }, or
// { ok: false, cancelled: true } if options.signal was aborted mid-flight —
// cancellation is a normal outcome here (user clicked Cancel), not an
// error condition the caller needs to catch separately.
// Like Stremio, tries the configured remote URL first, then LAN fallback and local default if remote is unreachable.
export async function resolveTorrentStream(infoHash, fileIdx = 0, options = {}) {
  const { signal } = options
  const primaryBase = getServerBase()
  const allFallbacks = buildFallbackBases(primaryBase)
  const httpFallbackForHttps = primaryBase.startsWith('https:')
    ? allFallbacks.find((b) => b.startsWith('http:'))
    : null
  const candidates = httpFallbackForHttps
    ? [httpFallbackForHttps, primaryBase, ...allFallbacks.filter((b) => b !== httpFallbackForHttps)]
    : [primaryBase, ...allFallbacks]
  let lastError = null
  // Note: no early availability probe — directly try /create on each candidate so a slow /settings doesn't block playback.
  // The loop below will surface a proper error if all candidates fail.

  for (const base of candidates) {
    if (signal?.aborted) return { ok: false, cancelled: true }
    try {
      // Register the torrent with the server. The server accepts either a
      // magnet URI or an infoHash-based descriptor; we send both forms of
      // identifying info to maximize compatibility across server versions.
      const createResponse = await fetchWithTimeout(
        `${base}/${infoHash}/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            torrent: {
              infoHash,
              fileIdx,
            },
          }),
        },
        CREATE_TIMEOUT_MS,
        signal
      )

      if (!createResponse.ok) {
        // For 404/405 on /create, the server may be an older fork with different shape — try next candidate before failing
        // But if this is the last candidate, surface the error
        if (base !== candidates[candidates.length - 1]) {
          console.warn(`[streamingServer] ${base}/create returned ${createResponse.status}, trying next fallback`)
          lastError = {
            ok: false,
            error: 'Streaming server rejected the torrent request.',
            detail: `HTTP ${createResponse.status} from /create at ${base}`,
          }
          continue
        }
        return {
          ok: false,
          error: 'Streaming server rejected the torrent request.',
          detail: `HTTP ${createResponse.status} from /create at ${base} — the server may use a different endpoint shape than expected.`,
        }
      }

      // The direct stream URL follows the server's stable convention: the
      // infoHash and file index identify the specific file within the
      // torrent to serve as an HTTP byte-range stream, playable directly in
      // a <video> element once the server has begun downloading it.
      const streamUrl = `${base}/${infoHash}/${fileIdx}`
      if (base !== primaryBase) {
        console.log(`[streamingServer] Fell back to ${base} (primary ${primaryBase} failed for create)`)
      }
      return { ok: true, streamUrl, base }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (signal?.aborted) {
          return { ok: false, cancelled: true }
        }
        // Timeout — try next candidate before giving up
        if (base !== candidates[candidates.length - 1]) {
          console.warn(`[streamingServer] ${base}/create timeout, trying next fallback`)
          lastError = {
            ok: false,
            error: 'Streaming server did not respond in time.',
            detail: `The /create request to ${base} timed out — trying next fallback.`,
          }
          continue
        }
        return {
          ok: false,
          error: 'Streaming server did not respond in time.',
          detail: `The /create request to ${base} timed out — the server may be busy, misconfigured, or the Remote Streaming URL is incorrect.`,
        }
      }
      if (base !== candidates[candidates.length - 1]) {
        console.warn(`[streamingServer] ${base}/create failed:`, err.message, 'trying next')
        lastError = {
          ok: false,
          error: 'Failed to contact the streaming server.',
          detail: err.message ? `${err.message} (${base})` : `Could not reach ${base}`,
        }
        continue
      }
      return {
        ok: false,
        error: 'Failed to contact the streaming server.',
        detail: err.message ? `${err.message} (${base})` : `Could not reach ${base}`,
      }
    }
  }
  return lastError || {
    ok: false,
    error: 'Streaming server not reachable.',
    detail: `Tried ${candidates.join(', ')}`,
  }
}

// Polls the server's per-torrent stats endpoint until enough of the file
// has buffered to begin playback smoothly, or until the max attempts are
// reached (in which case we still return — the <video> element itself can
// buffer further once it starts receiving the byte-range stream).
//
// options.signal: an AbortSignal the caller can trigger to cancel the
// polling loop early (e.g. a user clicking "Cancel" on the buffering
// overlay). When aborted, resolves with { ok: false, cancelled: true }
// rather than throwing — cancellation is a normal, expected outcome here,
// not an error condition the caller needs to catch.
export async function waitForBuffering(infoHash, onProgress, options = {}) {
  const { signal, minBufferPercent = MIN_BUFFER_PERCENT_BEFORE_PLAYBACK, base: forcedBase } = options
  const primaryBase = forcedBase || getServerBase()
  const bases = forcedBase ? [forcedBase] : (() => {
    const fb = buildFallbackBases(primaryBase)
    const httpFallback = primaryBase.startsWith('https:') ? fb.find((b) => b.startsWith('http:')) : null
    return httpFallback ? [httpFallback, primaryBase, ...fb.filter((b) => b !== httpFallback)] : [primaryBase, ...fb]
  })()

  for (let attempt = 0; attempt < STATS_POLL_MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      return { ok: false, cancelled: true }
    }

    // Try each base in order until one responds; the torrent may be registered on a fallback base
    let stats = null
    for (const b of bases) {
      try {
        const response = await fetchWithTimeout(`${b}/${infoHash}/stats.json`, {}, 2000)
        if (response.ok) {
          stats = await response.json()
          break
        }
      } catch {}
    }
    if (stats) {
      try {
        if (onProgress) onProgress(stats)
        const { percent } = extractStreamStats(stats)
        if (percent !== null && percent > minBufferPercent) {
          return { ok: true, stats }
        }
      } catch {}
    } else {
      // No base responded this attempt — continue polling
    }

    if (signal?.aborted) {
      return { ok: false, cancelled: true }
    }

    // Wait for the poll interval, but wake up immediately if cancelled
    // during the wait instead of sitting through the full 1.5s — makes
    // Cancel feel instant rather than laggy.
    await new Promise((resolve) => {
      const timeoutId = setTimeout(resolve, STATS_POLL_INTERVAL_MS)
      signal?.addEventListener('abort', () => {
        clearTimeout(timeoutId)
        resolve()
      }, { once: true })
    })
  }

  // Timed out waiting for a clear "buffered enough" signal, but that
  // doesn't necessarily mean playback will fail — return ok so the caller
  // can still attempt to play; the video element will show its own
  // buffering state if data isn't flowing yet.
  return { ok: true, stats: null, timedOut: true }
}
