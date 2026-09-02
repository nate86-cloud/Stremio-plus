// An append-only log of viewing sessions, separate from watchProgress.js
// (which only tracks the *current* resume position per title, overwritten
// in place). This log records real historical entries — one per viewing
// session — so we can compute genuine insights like day streaks, a weekly
// activity heat map, and genre breakdowns, rather than approximating them
// from data that was never designed to answer those questions.


// Storage design: entries are grouped by local calendar date (YYYY-MM-DD)
// to keep the heat map/streak math simple and timezone-consistent with
// how the person actually experiences their own viewing days.


const STORAGE_KEY_PREFIX = 'stremio_viewing_log'
const LEGACY_GLOBAL_KEY = 'stremio_viewing_log' // pre-per-profile key, same as the old single global key
const MAX_LOG_DAYS = 365 // cap stored history to keep localStorage lean


function storageKeyFor(profileId) {
  if (!profileId) throw new Error('viewingLog: profileId is required — viewing history is now tracked per profile')
  return `${STORAGE_KEY_PREFIX}:${profileId}`
}


function getDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}


function readLog(profileId) {
  try {
    const raw = localStorage.getItem(storageKeyFor(profileId))
    return raw ? JSON.parse(raw) : {}
  } catch (err) {
    console.warn('Failed to read viewing log from storage:', err)
    return {}
  }
}


function writeLog(profileId, log) {
  try {
    const keys = Object.keys(log).sort()
    if (keys.length > MAX_LOG_DAYS) {
      const excess = keys.length - MAX_LOG_DAYS
      for (let i = 0; i < excess; i++) delete log[keys[i]]
    }
    localStorage.setItem(storageKeyFor(profileId), JSON.stringify(log))
  } catch (err) {
    console.warn('Failed to write viewing log to storage:', err)
  }
}


// One-time migration: before this change, all viewing history lived under
// one global key shared by every profile. On first read for a given
// profile, if that profile has no per-profile log yet AND the old global
// key still has data, adopt it as that profile's starting history rather
// than silently discarding real watch history the person already
// accumulated. This only ever runs once per profile — after migration,
// the profile has its own key and this check finds data already there,
// so it's skipped on every subsequent call.
function migrateLegacyGlobalLogIfNeeded(profileId) {
  const perProfileKey = storageKeyFor(profileId)
  try {
    if (localStorage.getItem(perProfileKey) !== null) return // already migrated for this profile


    const legacyRaw = localStorage.getItem(LEGACY_GLOBAL_KEY)
    if (!legacyRaw) return


    // Write the legacy data as this profile's starting log. Deliberately
    // does NOT delete the legacy key — if there are multiple existing
    // profiles, each one's first read adopts a copy of the same starting
    // history rather than the first profile to read "winning" it and
    // leaving the others with nothing.
    localStorage.setItem(perProfileKey, legacyRaw)
  } catch (err) {
    console.warn('Failed to migrate legacy global viewing log:', err)
  }
}


// Records a chunk of real viewing activity. Called periodically during
// playback, so a single long session accumulates as several small
// increments rather than one giant one — keeps totals accurate even if
// the app closes mid-watch.
//
// `minutesWatched` should be the incremental minutes since the last call,
// not the total elapsed. `profileId` scopes this to a specific profile's
// history — required, since achievement tiers/badges are now per-profile.
export function logViewingActivity(profileId, movie, minutesWatched) {
  if (!movie || !minutesWatched || minutesWatched <= 0) return
  migrateLegacyGlobalLogIfNeeded(profileId)


  const now = new Date()
  const dateKey = getDateKey(now)
  const log = readLog(profileId)


  if (!log[dateKey]) {
    log[dateKey] = { totalMinutes: 0, sessions: [] }
  }


  log[dateKey].totalMinutes += minutesWatched
  log[dateKey].sessions.push({
    title: movie.displayTitle || movie.title,
    genres: movie.genres || [],
    minutes: minutesWatched,
    hour: now.getHours(),
    timestamp: now.toISOString(),
  })


  writeLog(profileId, log)
  try { window.dispatchEvent(new CustomEvent('stremio:viewing-log-changed', { detail: { profileId } })) } catch {}
}

// ── Per-profile map helpers for cloudSync ───────────────────────────
export function getAllProfilesViewingLogMap() {
  const map = {}
  try {
    const raw = localStorage.getItem('stremio_profile_store')
    const profiles = raw ? JSON.parse(raw) : null
    const ids = Array.isArray(profiles) && profiles.length > 0 ? profiles.map((p) => p.id) : []
    if (ids.length === 0) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith(STORAGE_KEY_PREFIX + ':')) ids.push(k.slice(STORAGE_KEY_PREFIX.length + 1))
      }
    }
    for (const pid of ids) {
      try {
        const v = localStorage.getItem(storageKeyFor(pid))
        if (v) map[pid] = JSON.parse(v)
      } catch {}
    }
  } catch {}
  return map
}

export function writeAllProfilesViewingLogMap(map) {
  if (!map || typeof map !== 'object') return
  for (const [pid, data] of Object.entries(map)) {
    try { localStorage.setItem(storageKeyFor(pid), JSON.stringify(data)) } catch {}
  }
  try { window.dispatchEvent(new CustomEvent('stremio:viewing-log-changed')) } catch {}
}


// Returns the raw log object for a given profile: { 'YYYY-MM-DD': { totalMinutes, sessions } }
export function getViewingLog(profileId) {
  migrateLegacyGlobalLogIfNeeded(profileId)
  return readLog(profileId)
}


export function clearViewingLog(profileId) {
  try {
    localStorage.removeItem(storageKeyFor(profileId))
  } catch (err) {
    console.warn('Failed to clear viewing log:', err)
  }
}