import { getEnabledAddonsWithResource } from './addonConfig'
import { addonFetch } from './addonFetch'

const API_BASE = 'https://api.opensubtitles.com/api/v1'

export function getApiKey() {
  return localStorage.getItem('opensubtitles_api_key') || ''
}

export function setApiKey(key) {
  if (key && key.trim()) localStorage.setItem('opensubtitles_api_key', key.trim())
  else localStorage.removeItem('opensubtitles_api_key')
}

// ─── Addon-based subtitles (no API key required) ────────────────────────────
// Queries installed Stremio subtitle addons (e.g. opensubtitles-v3) via the
// Stremio addon protocol: GET {base}/subtitle/{type}/{id}.json. This works
// out-of-the-box with the default seeded addons, so subtitles are available
// without requiring the user to obtain an OpenSubtitles.com API key.
async function searchViaAddons(imdbId, type = 'movie', opts = {}) {
  const addons = getEnabledAddonsWithResource('subtitles')
  if (addons.length === 0) return { ok: false, error: 'No subtitle addons installed. Add one in Settings → Add-ons.' }
  if (!imdbId) return { ok: false, error: 'This title has no IMDb ID to search subtitles for yet.' }

  // Stremio series id format: tt123:1:2 (season:episode)
  const id = type === 'series' && opts.season != null && opts.episode != null
    ? `${imdbId}:${opts.season}:${opts.episode}`
    : imdbId

  const results = []
  const settled = await Promise.allSettled(addons.map(async (addon) => {
    const base = addon.transportUrl.replace(/\/manifest\.json$/, '')
    // Try both /subtitle and /subtitles endpoints (different addons use different pluralization)
    const urls = [
      `${base}/subtitle/${type}/${encodeURIComponent(id)}.json`,
      `${base}/subtitles/${type}/${encodeURIComponent(id)}.json`,
      // Fallback with .json query for videoHash-less requests
      `${base}/subtitle/${type}/${encodeURIComponent(imdbId)}.json`,
    ]
    for (const url of urls) {
      try {
        const res = await addonFetch(url)
        if (!res.ok) continue
        const data = await res.json()
        const subs = data.subtitles || data.subs || data.items || []
        for (let i = 0; i < subs.length; i++) {
          const s = subs[i]
          const subUrl = s.url || s.SubtitleUrl || s.downloadUrl
          if (!subUrl) continue
          results.push({
            id: s.id || `${addon.transportUrl}-${i}-${s.lang || 'en'}`,
            fileId: null,
            url: subUrl,
            fileName: s.filename || s.SubFileName || s.id || `subtitle-${i + 1}.srt`,
            language: s.lang || s.language || s.LanguageName || 'en',
            release: s.release || s.ReleaseName || s.title || '',
            downloadCount: s.downloadCount || 0,
            addonName: addon.manifest?.name || addon.transportUrl,
          })
        }
        if (results.length > 0) break // got results from this addon, no need to try alternate URL
      } catch {
        // try next URL
      }
    }
  }))

  // Even if some addons failed, return what we have
  if (results.length > 0) {
    return { ok: true, results, source: 'addon' }
  }
  // If any addon explicitly succeeded but returned 0 results, treat as no results, not error
  const anySucceeded = settled.some(r => r.status === 'fulfilled')
  if (anySucceeded) return { ok: true, results: [], source: 'addon' }
  return { ok: false, error: 'Could not reach subtitle addons.' }
}

// Searches for available subtitle tracks for a given IMDb id (e.g. "tt1234567").
// For series episodes, pass { season, episode } so the API can return episode-specific subs.
// Tries OpenSubtitles API when key exists, otherwise (or on failure) falls back to
// installed Stremio subtitle addons (e.g. opensubtitles-v3) which require no key.
// Returns { ok: true, results: [...] } or { ok: false, error: 'message' }.
export async function searchSubtitles(imdbId, language = 'en', opts = {}) {
  if (!imdbId) {
    return { ok: false, error: 'This title has no IMDb ID to search subtitles for yet.' }
  }
  const apiKey = getApiKey()
  const type = opts.type || 'movie'

  // If we have an API key, try the direct OpenSubtitles API first
  if (apiKey) {
    const numericId = String(imdbId).replace(/^tt/, '')
    try {
      const params = new URLSearchParams({ imdb_id: numericId, languages: language })
      if (opts.season != null) params.set('season_number', String(opts.season))
      if (opts.episode != null) params.set('episode_number', String(opts.episode))
      const response = await fetch(
        `${API_BASE}/subtitles?${params.toString()}`,
        {
          headers: {
            'Api-Key': apiKey,
            'Content-Type': 'application/json',
          },
        }
      )
      if (response.status === 401) {
        // Invalid key — fall back to addons instead of hard failing
        const fallback = await searchViaAddons(imdbId, type, opts)
        if (fallback.ok && fallback.results.length > 0) return fallback
        return { ok: false, error: 'Invalid OpenSubtitles API key. Try updating it below or use addon subtitles.' }
      }
      if (response.ok) {
        const data = await response.json()
        const results = (data.data || []).map((item) => ({
          id: item.id,
          fileId: item.attributes?.files?.[0]?.file_id,
          url: null,
          fileName: item.attributes?.files?.[0]?.file_name || 'subtitle',
          language: item.attributes?.language,
          release: item.attributes?.release,
          downloadCount: item.attributes?.download_count,
          addonName: 'OpenSubtitles.com',
        })).filter((r) => r.fileId)
        // If API returned results, use them; otherwise try addons as fallback
        if (results.length > 0) return { ok: true, results, source: 'opensubtitles' }
        const fallback = await searchViaAddons(imdbId, type, opts)
        if (fallback.ok) return fallback
        return { ok: true, results: [], source: 'opensubtitles' }
      }
      // Non-401 API error — try addons before failing
      const fallback = await searchViaAddons(imdbId, type, opts)
      if (fallback.ok) return fallback
      return { ok: false, error: `Subtitle search failed (${response.status}).` }
    } catch {
      // Network error to OpenSubtitles — try addons
      const fallback = await searchViaAddons(imdbId, type, opts)
      if (fallback.ok) return fallback
      return { ok: false, error: 'Could not reach OpenSubtitles. Check your connection.' }
    }
  }

  // No API key — use subtitle addons directly (works out-of-the-box with default seeded addons)
  return searchViaAddons(imdbId, type, opts)
}

// Requests subtitle content. Supports both OpenSubtitles via fileId (requires API key)
// and direct addon subtitle URLs (no key, fetched directly). Accepts either a fileId
// string or a track object with { fileId, url }. Returns { ok: true, content: '...' }
// or { ok: false, error: 'message' }.
export async function downloadSubtitleContent(fileIdOrTrack) {
  // Direct URL case (addon subtitles) — no API key needed, fetch SRT directly
  const track = typeof fileIdOrTrack === 'object' && fileIdOrTrack !== null ? fileIdOrTrack : null
  const directUrl = track?.url
  if (directUrl) {
    try {
      const fileResponse = await addonFetch(directUrl)
      if (!fileResponse.ok) {
        // Fallback to regular fetch if addonFetch fails (CORS)
        const fallback = await fetch(directUrl)
        if (!fallback.ok) return { ok: false, error: 'Failed to download subtitle file.' }
        const content = await fallback.text()
        return { ok: true, content }
      }
      const content = await fileResponse.text()
      return { ok: true, content }
    } catch {
      try {
        const fallback = await fetch(directUrl)
        if (!fallback.ok) return { ok: false, error: 'Failed to download subtitle file.' }
        const content = await fallback.text()
        return { ok: true, content }
      } catch {
        return { ok: false, error: 'Could not download subtitle file.' }
      }
    }
  }

  const fileId = track ? track.fileId : fileIdOrTrack
  if (!fileId) {
    return { ok: false, error: 'No subtitle file to download.' }
  }
  const apiKey = getApiKey()
  if (!apiKey) {
    return { ok: false, error: 'No OpenSubtitles API key set.' }
  }

  try {
    const linkResponse = await fetch(`${API_BASE}/download`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: fileId }),
    })

    if (linkResponse.status === 406) {
      return { ok: false, error: 'Daily download quota reached for this API key.' }
    }
    if (!linkResponse.ok) {
      return { ok: false, error: `Could not get download link (${linkResponse.status}).` }
    }

    const linkData = await linkResponse.json()
    const fileUrl = linkData.link
    if (!fileUrl) {
      return { ok: false, error: 'No download link returned.' }
    }

    const fileResponse = await fetch(fileUrl)
    if (!fileResponse.ok) {
      return { ok: false, error: 'Failed to download subtitle file.' }
    }

    const content = await fileResponse.text()
    return { ok: true, content }
  } catch {
    return { ok: false, error: 'Could not reach OpenSubtitles. Check your connection.' }
  }
}
