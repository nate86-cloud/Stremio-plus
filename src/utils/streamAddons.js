// Queries all of the user's enabled Stremio "stream" addons (Torrentio,
// Comet, TorrentsDB, etc. — configured in Settings) for available torrent
// streams for a given title, merging results from every addon into one
// combined, sorted list.
//
// Confirmed against the official Stremio addon protocol: a stream addon
// responds to GET {addonBaseUrl}/stream/{type}/{id}.json with
// { streams: [{ name, title, infoHash, fileIdx, behaviorHints }, ...] }.
// For series, id is "{imdbId}:{season}:{episode}".
//
// Scraper addons pack quality/size/seeder info into the free-text `title`
// field rather than separate fields, e.g.:
//   "Movie.Name.2024.1080p.WEBRip\n👤 100 💾 1.55 GB ⚙️ YTS"
// so we parse that text with a few regexes to surface it as real data.
// Different addons format this slightly differently, so parsing is
// defensive — missing fields just show as "Unknown"/omitted rather than
// breaking the row.


import { addonFetch } from './addonFetch'
import { getEnabledAddons } from './addonConfig'
import { normalizeImdbId } from '../services/stremioApi'


const ADDON_TIMEOUT_MS = 10000


function parseStreamTitle(title) {
  const lines = (title || '').split('\n')
  const filename = lines[0] || ''


  const seedersMatch = title.match(/👤\s*(\d+)/)
  const sizeMatch = title.match(/💾\s*([\d.]+\s*[GM]B)/)
  const sourceMatch = title.match(/⚙️\s*([^\s\n]+)/)


  const qualityMatch = filename.match(/\b(4K|2160p|1080p|720p|480p|CAM|TS)\b/i)
  const hdrMatch = filename.match(/\b(HDR10\+|HDR10|HDR|DV|DoVi)\b/i)
  const bitDepthMatch = filename.match(/\b(10bit|8bit)\b/i)


  return {
    filename,
    quality: qualityMatch ? qualityMatch[1] : 'Unknown',
    hdr: hdrMatch ? hdrMatch[1] : null,
    bitDepth: bitDepthMatch ? bitDepthMatch[1] : null,
    seeders: seedersMatch ? parseInt(seedersMatch[1], 10) : null,
    size: sizeMatch ? sizeMatch[1] : null,
    source: sourceMatch ? sourceMatch[1] : null,
  }
}


async function searchSingleAddon(addon, type, id) {
  // Extract base URL from transportUrl (manifest URL)
  // transportUrl is like "https://example.com/manifest.json"
  // baseUrl should be "https://example.com"
  const baseUrl = addon.transportUrl.replace(/\/manifest\.json$/, '')
  const url = `${baseUrl}/stream/${type}/${encodeURIComponent(id)}.json`
  
  console.log('Searching addon:', addon.manifest?.name, 'URL:', url)


  let timeoutId
  try {
    const responsePromise = addonFetch(url)
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Stream addon request timed out')), ADDON_TIMEOUT_MS)
    })
    const response = await Promise.race([responsePromise, timeoutPromise])
    if (!response.ok) {
      console.error('Stream addon request failed:', addon.manifest?.name, response.status)
      throw new Error(`Stream addon request failed (${response.status})`)
    }


    const data = await response.json()
    const rawStreams = data.streams || []
    console.log('Addon returned streams:', addon.manifest?.name, rawStreams.length)


    return rawStreams
      .filter((s) => s.infoHash || s.url)
      .map((s, index) => {
        const parsed = parseStreamTitle(s.title || s.name || '')
        // Support both torrent (infoHash) and direct http (RealDebrid) streams.
        // infoHash-based streams are resolved via the local/remote streaming server;
        // http streams (s.url) are playable directly.
        const isDirect = !s.infoHash && !!s.url
        return {
          id: `${addon.transportUrl}-${s.infoHash || s.url}-${s.fileIdx ?? 0}-${index}`,
          infoHash: s.infoHash || null,
          fileIdx: s.fileIdx ?? 0,
          url: s.url || null,
          isDirect,
          addonName: addon.manifest?.name || addon.transportUrl,
          ...parsed,
          name: s.name,
          title: s.title,
          behaviorHints: s.behaviorHints,
        }
      })
  } catch (err) {
    console.error('Error searching addon:', addon.manifest?.name, err)
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}


export async function searchStreams(type, imdbId, options = {}) {
  const { season, episode } = options


  const isLiveType = type === 'tv' || type === 'channel' || type === 'live' || String(imdbId).includes(':live') || String(type).toLowerCase().includes('live')
  const canonicalImdbId = isLiveType ? String(imdbId) : normalizeImdbId(imdbId)
  if (!canonicalImdbId) {
    return { ok: false, error: 'This title has no ID to search streams for yet.' }
  }


  const allAddons = getEnabledAddons()
  console.log('All enabled addons:', allAddons)
  
  // Filter addons to only those that declare 'stream' resource
  const streamAddons = allAddons.filter(addon => {
    if (!addon.manifest || !Array.isArray(addon.manifest.resources)) {
      console.log('Addon missing manifest or resources:', addon)
      return false
    }
    const resources = addon.manifest.resources.map(r => typeof r === 'string' ? r : r?.name)
    const hasStream = resources.includes('stream')
    console.log('Addon resources:', addon.manifest?.name, resources, 'has stream:', hasStream)
    return hasStream
  })
  
  console.log('Filtered stream addons:', streamAddons)
  
  if (streamAddons.length === 0) {
    return { ok: false, error: 'No stream sources configured. Add one in Settings → Add-ons.' }
  }


  const id = type === 'series' && season != null && episode != null
    ? `${canonicalImdbId}:${season}:${episode}`
    : canonicalImdbId


  const settledResults = await Promise.allSettled(
    streamAddons.map((addon) => searchSingleAddon(addon, type, id))
  )


  const results = settledResults
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .sort((a, b) => (b.seeders || 0) - (a.seeders || 0))


  if (results.length === 0) {
    return { ok: false, error: 'No torrent streams found for this title across your configured sources.' }
  }


  return { ok: true, results }
}


// ─── Pre-playback stream health & bandwidth validation ───────────────
//
// Validates seed/peer health, bitrate, and resolution before committing
// to full playback. Protects users from dead/throttled streams.
//
// Signals used (all parsed defensively from addon free-text):
// - seeders (👤) — swarm health
// - quality (4K/1080p etc.) — bandwidth demand
// - size (💾) — file size → estimated bitrate (size / duration)
// - hdr/bitDepth — not used for blocking, just for display
//
// Bitrate estimation: if size is "1.5 GB" and we assume ~2h (7200s) for
// movie or ~45m (2700s) for episode, bitrate = sizeBytes / duration.
// For now we use a conservative 2h baseline and flag > 8 Mbps as
// high-bandwidth (needs more seeders). This is honest: we don't have
// real duration per stream, so we estimate and warn, not block.
//
// Thresholds are intentionally coarse — we block only truly dead streams
// (0 seeders + high demand), warn on weak, and allow healthy/unknown.
const SEEDER_THRESHOLDS = {
  dead: 0, // 0 seeders — very likely unplayable, no one to download from
  weak: 5, // 1-4 seeders — may work but expect slow starts/stalls (raised from 3 for 4K)
}

const QUALITY_BANDWIDTH = {
  '4K': 25, // Mbps — 4K needs ~25 Mbps sustained
  '2160p': 25,
  '1080p': 8,
  '720p': 5,
  '480p': 3,
  'CAM': 2,
}

function parseSizeToBytes(sizeStr) {
  if (!sizeStr) return null
  const m = sizeStr.match(/([\d.]+)\s*([GMK]B)/i)
  if (!m) return null
  const value = parseFloat(m[1])
  const unit = m[2].toUpperCase()
  const mult = unit === 'GB' ? 1024 * 1024 * 1024 : unit === 'MB' ? 1024 * 1024 : 1024
  return value * mult
}

function estimateBitrateMbps(sizeBytes, durationSec = 7200) {
  if (!sizeBytes || !durationSec) return null
  return (sizeBytes * 8) / (durationSec * 1_000_000)
}


// Returns { status, seeders, reason, warnings } where status is 'dead' | 'weak' | 'healthy' | 'unknown'.
export function evaluateStreamHealth(stream) {
  const warnings = []

  // Direct http (RealDebrid) streams bypass P2P — always healthy if URL present
  if (stream.isDirect && stream.url) {
    return { status: 'healthy', seeders: stream.seeders ?? null, reason: null, warnings, isDirect: true }
  }

  if (stream.seeders === null || stream.seeders === undefined) {
    return {
      status: 'unknown',
      seeders: null,
      reason: 'This source didn\u2019t report seeder health — quality is unverified.',
      warnings: ['No seeder count — cannot verify swarm health.'],
    }
  }

  const quality = (stream.quality || 'Unknown').toString()
  const sizeBytes = parseSizeToBytes(stream.size)
  const bitrate = estimateBitrateMbps(sizeBytes)
  const requiredMbps = QUALITY_BANDWIDTH[quality] ?? QUALITY_BANDWIDTH[quality.toUpperCase()] ?? 8
  const isHighBandwidth = bitrate !== null && bitrate > requiredMbps * 1.2
  const is4K = /4k|2160/i.test(quality)

  if (isHighBandwidth) warnings.push(`High bitrate ~${bitrate.toFixed(1)} Mbps — needs strong swarm.`)
  if (is4K && stream.seeders < 10) warnings.push('4K stream with modest seeders — 1080p may be smoother.')

  // Dead: 0 seeders, or 0-1 seeders with 4K/high-bitrate (almost certainly will stall)
  if (stream.seeders <= SEEDER_THRESHOLDS.dead) {
    return {
      status: 'dead',
      seeders: stream.seeders,
      reason: 'No seeders reported — this stream will likely fail to play.',
      warnings,
    }
  }
  if (is4K && stream.seeders <= 1) {
    return {
      status: 'dead',
      seeders: stream.seeders,
      reason: '4K stream with 0–1 seeder — very likely to stall or fail. Try 1080p.',
      warnings,
    }
  }

  // Weak: 1-4 seeders, or high-bitrate with <8 seeders
  if (stream.seeders < SEEDER_THRESHOLDS.weak || (isHighBandwidth && stream.seeders < 8) || (is4K && stream.seeders < 8)) {
    return {
      status: 'weak',
      seeders: stream.seeders,
      reason: `Only ${stream.seeders} seeder${stream.seeders === 1 ? '' : 's'}${isHighBandwidth ? ` for ~${bitrate.toFixed(0)} Mbps` : ''} — expect slow start or stalls.`,
      warnings,
    }
  }

  if (warnings.length > 0) {
    return { status: 'weak', seeders: stream.seeders, reason: warnings[0], warnings }
  }

  return { status: 'healthy', seeders: stream.seeders, reason: null, warnings }
}

export function validateStreamForPlayback(stream, options = {}) {
  const { strict = false } = options
  const health = evaluateStreamHealth(stream)
  const quality = (stream.quality || '').toString()
  const sizeBytes = parseSizeToBytes(stream.size)

  // Block dead streams in strict mode; otherwise allow with warning
  const canPlay = health.status !== 'dead'
  const shouldWarn = health.status === 'dead' || health.status === 'weak' || health.status === 'unknown'
  const blockReason = health.status === 'dead' ? health.reason : null

  // Additional pre-playback checks: CAM with 0 seeders, or >15GB with <3 seeders
  let extraReason = null
  if (/cam|ts/i.test(quality) && health.seeders !== null && health.seeders <= 1) {
    extraReason = 'CAM/TS source with minimal seeders — likely poor quality and unstable.'
  } else if (sizeBytes && sizeBytes > 15 * 1024 * 1024 * 1024 && health.seeders !== null && health.seeders < 3) {
    extraReason = 'Very large file (>15 GB) with few seeders — will likely buffer frequently.'
  }

  return {
    canPlay: strict ? canPlay : true, // in non-strict, even dead is technically playable but warns
    shouldWarn,
    shouldBlock: health.status === 'dead',
    health,
    extraReason,
    warnings: [...(health.warnings || []), ...(extraReason ? [extraReason] : [])],
    blockReason: blockReason || extraReason,
  }
}


// Convenience wrapper for a UI gate right before committing to playback
// (e.g. a confirmation step when the user picks a 'dead' stream). Doesn't
// block anything itself — returns the evaluation so the caller decides
// whether to warn, require confirmation, or just show a badge.
export function sortStreamsByHealth(streams) {
  return [...streams].sort((a, b) => {
    const aHealth = evaluateStreamHealth(a)
    const bHealth = evaluateStreamHealth(b)
    const rank = { healthy: 0, weak: 1, unknown: 2, dead: 3 }
    return rank[aHealth.status] - rank[bHealth.status] || (b.seeders || 0) - (a.seeders || 0)
  })
}


// Groups streams by the addon that found them (Torrentio, Comet,
// TorrentsDB, etc.) rather than by resolution tier — the left column of
// the new split-pane stream picker categorizes by source addon, since
// that's a real field every stream object already carries
// (streamAddons.js sets addonName from the addon's own manifest.name at
// search time), unlike "artist" which doesn't apply to torrent streams
// at all.
//
// Within each addon group, streams are sorted by seeder count descending
// (same ordering searchStreams already applies globally) so the best
// stream from that addon surfaces first once the user picks it.

const UNKNOWN_ADDON_LABEL = 'Other Sources'


export function groupStreamsByAddon(streams) {
  const groups = new Map()


  for (const stream of streams) {
    const key = stream.addonName || UNKNOWN_ADDON_LABEL
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push(stream)
  }


  return Array.from(groups.entries())
    .map(([addonName, groupStreams]) => ({
      id: addonName,
      label: addonName,
      streams: [...groupStreams].sort((a, b) => (b.seeders || 0) - (a.seeders || 0)),
    }))
    // Addons with more available streams (more choice for the user) surface
    // first — a small, reasonable default ordering rather than alphabetical,
    // which would be arbitrary here.
    .sort((a, b) => b.streams.length - a.streams.length)
}