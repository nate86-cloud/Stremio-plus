// A movie is considered "finished" once watched past this fraction of its
// total duration, at which point it's dropped from Continue Watching
// (accounts for end credits rolling before the literal last second).
export const FINISHED_THRESHOLD = 0.9

// Cloud-synced per-profile stores — Continue Watching, watched set
// Data shape in cloud: { profileId: { movieKey: progressObj } } via cloudSync.js
// Local keys: stremio_watch_progress:{profileId} + stremio_watched:{profileId}
function getActiveProfileId() {
  try {
    return localStorage.getItem('stremio_active_profile_id') || 'guest-profile'
  } catch {
    return 'guest-profile'
  }
}

function getProfileWatchProgressKey() {
  return `stremio_watch_progress:${getActiveProfileId()}`
}

const LEGACY_GLOBAL_KEY = 'stremio_watch_progress'

function readAll() {
  try {
    const profileKey = getProfileWatchProgressKey()
    const raw = localStorage.getItem(profileKey)
    if (raw) return JSON.parse(raw)
    const legacyRaw = localStorage.getItem(LEGACY_GLOBAL_KEY)
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw)
      if (legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0) {
        localStorage.setItem(profileKey, JSON.stringify(legacy))
        return legacy
      }
    }
  } catch {}
  return {}
}

function writeAll(data) {
  try {
    const profileKey = getProfileWatchProgressKey()
    localStorage.setItem(profileKey, JSON.stringify(data))
    localStorage.setItem(LEGACY_GLOBAL_KEY, JSON.stringify(data))
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('stremio:watch-progress-changed', { detail: { profileId: getActiveProfileId() } }))
    // Separate event for cloud push (debounced in SupabaseContext, avoids double-trigger on pull)
    window.dispatchEvent(new CustomEvent('stremio:watch-progress-persisted', { detail: { profileId: getActiveProfileId() } }))
  } catch {}
}


function notifyWatchProgressChanged() {
  try {
    window.dispatchEvent(new CustomEvent('stremio:watch-progress-changed'))
    window.dispatchEvent(new CustomEvent('stremio:watch-progress-persisted'))
  } catch {}
}

// ── Per-profile map helpers for cloudSync ───────────────────────────
export function getAllProfilesProgressMap() {
  const map = {}
  try {
    const raw = localStorage.getItem('stremio_profile_store')
    const profiles = raw ? JSON.parse(raw) : null
    const ids = Array.isArray(profiles) && profiles.length > 0 ? profiles.map((p) => p.id) : [getActiveProfileId()]
    for (const pid of ids) {
      try {
        const pr = localStorage.getItem(`stremio_watch_progress:${pid}`)
        if (pr) map[pid] = JSON.parse(pr)
      } catch {}
    }
    if (Object.keys(map).length === 0) {
      const legacy = localStorage.getItem(LEGACY_GLOBAL_KEY)
      if (legacy) {
        const parsed = JSON.parse(legacy)
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) map[getActiveProfileId()] = parsed
      }
    }
  } catch {}
  return map
}

export function getAllProfilesWatchedMap() {
  const map = {}
  try {
    const raw = localStorage.getItem('stremio_profile_store')
    const profiles = raw ? JSON.parse(raw) : null
    const ids = Array.isArray(profiles) && profiles.length > 0 ? profiles.map((p) => p.id) : [getActiveProfileId()]
    for (const pid of ids) {
      try {
        const pr = localStorage.getItem(`stremio_watched:${pid}`)
        if (pr) map[pid] = JSON.parse(pr)
      } catch {}
    }
  } catch {}
  return map
}

export function writeAllProfilesProgressMap(map) {
  if (!map || typeof map !== 'object') return
  for (const [pid, data] of Object.entries(map)) {
    try { localStorage.setItem(`stremio_watch_progress:${pid}`, JSON.stringify(data)) } catch {}
  }
  try { window.dispatchEvent(new CustomEvent('stremio:watch-progress-changed')) } catch {}
}

export function writeAllProfilesWatchedMap(map) {
  if (!map || typeof map !== 'object') return
  for (const [pid, data] of Object.entries(map)) {
    try { localStorage.setItem(`stremio_watched:${pid}`, JSON.stringify(data)) } catch {}
  }
  try { window.dispatchEvent(new CustomEvent('stremio:watch-progress-changed')) } catch {}
}



// Returns a stable identifier for a movie. Prefers an explicit id if the
// data has one (e.g. an IMDb id from Cinemeta later), falls back to title
// for the current placeholder data.
// For series episodes, the key is per-episode (tt123:1:2) so each episode
// tracks its own progress independently rather than colliding on the series id.
function getMovieKey(movie) {
  if (!movie) return 'unknown'
  if (movie.episodeId) return movie.episodeId
  if (movie.type === 'series' && movie.season != null && movie.episode != null) {
    const base = movie.imdbId || movie.id || movie.title || 'series'
    return `${base}:${movie.season}:${movie.episode}`
  }
  return movie.id || movie.imdbId || movie.title
}


// Save/update progress for a movie. Call this periodically during
// playback (e.g. every few seconds) and once more when the player closes.
export function saveProgress(movie, currentTime, duration) {
  if (!movie || !duration || duration <= 0) return
  // LIVE TV has no finite progress — never pollute Continue Watching
  if (['tv','channel','live'].includes(String(movie.type || '').toLowerCase()) || movie.isLive) return


  const key = getMovieKey(movie)
  const all = readAll()
  const fraction = currentTime / duration


  // If the movie is now finished, remove it from Continue Watching
  // entirely rather than storing a 90%+ entry that would just show a
  // maxed-out progress bar forever.
  if (fraction >= FINISHED_THRESHOLD) {
    delete all[key]
  } else {
    const isSeriesEpisode = movie.type === 'series' && movie.season != null && movie.episode != null
    all[key] = {
      title: movie.displayTitle || movie.title,
      year: movie.year,
      posterUrl: movie.episodeThumbnail || movie.posterUrl,
      backdropUrl: movie.backdropUrl,
      videoUrl: movie.videoUrl,
      trailerId: movie.trailerId,
      type: movie.type || 'movie',
      imdbId: movie.imdbId,
      season: isSeriesEpisode ? movie.season : undefined,
      episode: isSeriesEpisode ? movie.episode : undefined,
      episodeId: movie.episodeId || (isSeriesEpisode ? `${movie.imdbId}:${movie.season}:${movie.episode}` : undefined),
      episodeTitle: movie.episodeTitle || undefined,
      displayTitle: movie.displayTitle || undefined,
      currentTime,
      duration,
      updatedAt: Date.now(),
    }
  }


  writeAll(all)
  notifyWatchProgressChanged()
}
export function getProgress(movie) {
  const key = getMovieKey(movie)
  const all = readAll()
  return all[key] || null
}


// Returns all in-progress movies as an array, most recently watched first.
// Filters out any legacy LIVE entries that may have slipped in before isLive guard.
export function getContinueWatchingList() {
  const all = readAll()
  return Object.values(all)
    .filter((e) => !['tv','channel','live'].includes(String(e.type||'').toLowerCase()) && !e.isLive)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => ({
      ...entry,
      progressPercent: entry.duration ? (entry.currentTime / entry.duration) * 100 : 0,
    }))
}


// Manually remove a movie from Continue Watching (e.g. a "Remove" button).
export function removeProgress(movie) {
  const key = getMovieKey(movie)
  const all = readAll()
  delete all[key]
  writeAll(all)
  notifyWatchProgressChanged()
}

// ─── Watched set (per-episode) ───────────────────────────────────
function getWatchedKey() {
  try {
    return `stremio_watched:${getActiveProfileId()}`
  } catch {
    return 'stremio_watched:guest-profile'
  }
}

function readWatched() {
  try {
    const raw = localStorage.getItem(getWatchedKey())
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function writeWatched(data) {
  try {
    localStorage.setItem(getWatchedKey(), JSON.stringify(data))
    localStorage.setItem('stremio_watched', JSON.stringify(data))
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('stremio:watch-progress-changed', { detail: { profileId: getActiveProfileId() } }))
    window.dispatchEvent(new CustomEvent('stremio:watch-progress-persisted', { detail: { profileId: getActiveProfileId() } }))
  } catch {}
}

export function markAsWatched(movie) {
  if (!movie) return
  const key = getMovieKey(movie)
  const all = readAll()
  delete all[key]
  writeAll(all)
  const watched = readWatched()
  watched[key] = { at: Date.now(), title: movie.title, season: movie.season, episode: movie.episode, episodeId: movie.episodeId }
  writeWatched(watched)
  notifyWatchProgressChanged()
}

export function unmarkAsWatched(movie) {
  if (!movie) return
  const key = getMovieKey(movie)
  const watched = readWatched()
  delete watched[key]
  writeWatched(watched)
  notifyWatchProgressChanged()
}

export function isWatched(movie) {
  if (!movie) return false
  const key = getMovieKey(movie)
  const watched = readWatched()
  return !!watched[key]
}


// Returns the full watch progress data as a pretty-printed JSON string,
export function exportProgressAsJSON() {
  const all = readAll()
  return JSON.stringify(all, null, 2)
}


// Replaces all watch progress with the contents of a previously exported
export function importProgressFromJSON(jsonString) {
  const parsed = JSON.parse(jsonString)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid watch history file format')
  }
  writeAll(parsed)
  notifyWatchProgressChanged()


}
