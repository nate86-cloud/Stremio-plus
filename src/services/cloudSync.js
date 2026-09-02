import { supabase } from './supabaseClient'

// ── Store definitions ─────────────────────────────────────────────
// GLOBAL per-account: one jsonb blob per user_id (auth.uid())
// PER-PROFILE: data = { profileId: perProfileData } map inside one blob per user_id
export const STORES = {
  profiles: {
    table: 'profiles',
    scope: 'global',
    // Special: maps to two localStorage keys (stremio_profile_store + stremio_active_profile_id)
    localKey: 'stremio_profile_store',
    activeKey: 'stremio_active_profile_id',
    empty: { profiles: [], activeProfileId: null },
  },
  watchProgress: {
    table: 'watch_progress',
    scope: 'perProfile',
    // localKey is dynamic: stremio_watch_progress:{profileId} + legacy stremio_watch_progress
    prefix: 'stremio_watch_progress:',
    legacyKey: 'stremio_watch_progress',
    empty: {},
  },
  watched: {
    table: 'watched',
    scope: 'perProfile',
    prefix: 'stremio_watched:',
    legacyKey: 'stremio_watched',
    empty: {},
  },
  viewingLog: {
    table: 'viewing_log',
    scope: 'perProfile',
    prefix: 'stremio_viewing_log:',
    legacyKey: 'stremio_viewing_log',
    empty: {},
  },
  installedAddons: {
    table: 'installed_addons',
    scope: 'global',
    localKey: 'stremio_installed_addons',
    empty: [],
  },
  userSettings: {
    table: 'user_settings',
    scope: 'global',
    localKey: 'stremio_user_settings',
    empty: {},
  },
  playbackQueue: {
    table: 'playback_queue',
    scope: 'global',
    localKey: 'stremio_playback_queue',
    empty: [],
  },
}

const PENDING_QUEUE_KEY = 'stremio_cloud_pending_pushes'

// ── Low-level local helpers ──────────────────────────────────────
export function readLocal(storeName) {
  const store = STORES[storeName]
  if (!store) return null
  if (store.scope === 'perProfile') return readPerProfileMap(storeName)
  try {
    if (storeName === 'profiles') {
      const raw = localStorage.getItem(store.localKey)
      const profiles = raw ? JSON.parse(raw) : []
      const activeProfileId = localStorage.getItem(store.activeKey) || null
      return { profiles: Array.isArray(profiles) ? profiles : [], activeProfileId }
    }
    const raw = localStorage.getItem(store.localKey)
    return raw ? JSON.parse(raw) : store.empty
  } catch (err) {
    console.warn(`[cloudSync] Failed to read local store "${storeName}":`, err)
    return store.empty
  }
}

export function writeLocal(storeName, data) {
  const store = STORES[storeName]
  if (!store) return
  try {
    if (store.scope === 'perProfile') {
      writePerProfileMap(storeName, data)
      return
    }
    if (storeName === 'profiles') {
      const payload = data && typeof data === 'object' ? data : { profiles: [], activeProfileId: null }
      const profiles = Array.isArray(payload.profiles) ? payload.profiles : []
      localStorage.setItem(store.localKey, JSON.stringify(profiles))
      if (payload.activeProfileId) localStorage.setItem(store.activeKey, payload.activeProfileId)
      return
    }
    localStorage.setItem(store.localKey, JSON.stringify(data))
  } catch (err) {
    console.warn(`[cloudSync] Failed to write local store "${storeName}":`, err)
  }
}

// ── Per-profile aggregation ──────────────────────────────────────
function getAllProfileIds() {
  try {
    const raw = localStorage.getItem('stremio_profile_store')
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length > 0) return arr.map((p) => p.id).filter(Boolean)
    }
  } catch {}
  // Fallback: scan localStorage for known prefixes
  const ids = new Set()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      for (const storeName of ['watchProgress', 'viewingLog', 'watched']) {
        const prefix = STORES[storeName]?.prefix
        if (prefix && key.startsWith(prefix)) ids.add(key.slice(prefix.length))
      }
    }
  } catch {}
  if (ids.size > 0) return Array.from(ids)
  return ['guest-profile']
}

function readPerProfileMap(storeName) {
  const store = STORES[storeName]
  if (!store || store.scope !== 'perProfile') return {}
  const map = {}
  const profileIds = getAllProfileIds()
  for (const pid of profileIds) {
    try {
      const raw = localStorage.getItem(store.prefix + pid)
      if (raw) map[pid] = JSON.parse(raw)
    } catch {}
  }
  // Include legacy global key as guest-profile fallback if no per-profile keys exist
  if (Object.keys(map).length === 0) {
    try {
      const legacy = localStorage.getItem(store.legacyKey)
      if (legacy) {
        const parsed = JSON.parse(legacy)
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          map['guest-profile'] = parsed
        }
      }
    } catch {}
  }
  return map
}

function writePerProfileMap(storeName, map) {
  const store = STORES[storeName]
  if (!store || store.scope !== 'perProfile' || !map || typeof map !== 'object') return
  for (const [profileId, data] of Object.entries(map)) {
    try {
      localStorage.setItem(store.prefix + profileId, JSON.stringify(data))
    } catch (err) {
      console.warn(`[cloudSync] Failed to write per-profile key ${store.prefix}${profileId}`, err)
    }
  }
  // Notify listeners that per-profile stores changed
  try {
    const eventMap = {
      watchProgress: 'stremio:watch-progress-changed',
      watched: 'stremio:watch-progress-changed',
      viewingLog: 'stremio:viewing-log-changed',
    }
    const eventName = eventMap[storeName]
    if (eventName) window.dispatchEvent(new CustomEvent(eventName))
  } catch {}
}

// ── Merge helpers (per-profile maps) ─────────────────────────────
function isFlatWatchProgress(data) {
  // Old shape was flat { movieKey: {title, currentTime} } without profileId keys
  // New shape is { profileId: {movieKey: obj} } where profileId starts with 'profile-' or 'guest-'
  if (!data || typeof data !== 'object') return false
  const keys = Object.keys(data)
  if (keys.length === 0) return false
  // If any top-level value looks like a progress entry (has currentTime), it's flat
  const firstVal = data[keys[0]]
  return firstVal && typeof firstVal === 'object' && ('currentTime' in firstVal || 'duration' in firstVal)
}

function mergeWatchProgressMaps(localMap, remoteMap) {
  // Normalize flat legacy remote
  let remote = remoteMap
  if (isFlatWatchProgress(remoteMap)) {
    const fallbackId = (() => { try { return localStorage.getItem('stremio_active_profile_id') || 'guest-profile' } catch { return 'guest-profile' } })()
    remote = { [fallbackId]: remoteMap }
  }
  const merged = { ...localMap }
  for (const [profileId, remoteProfileData] of Object.entries(remote || {})) {
    if (!remoteProfileData || typeof remoteProfileData !== 'object') continue
    const localProfileData = merged[profileId] || {}
    const mergedProfile = { ...localProfileData }
    for (const [movieKey, remoteEntry] of Object.entries(remoteProfileData)) {
      const localEntry = localProfileData[movieKey]
      if (!localEntry) {
        mergedProfile[movieKey] = remoteEntry
      } else {
        const remoteAt = remoteEntry?.updatedAt || 0
        const localAt = localEntry?.updatedAt || 0
        mergedProfile[movieKey] = remoteAt > localAt ? remoteEntry : localEntry
      }
    }
    merged[profileId] = mergedProfile
  }
  return merged
}

function mergeWatchedMaps(localMap, remoteMap) {
  const merged = { ...localMap }
  for (const [profileId, remoteProfileData] of Object.entries(remoteMap || {})) {
    if (!remoteProfileData || typeof remoteProfileData !== 'object') continue
    const localProfileData = merged[profileId] || {}
    const mergedProfile = { ...localProfileData }
    for (const [key, remoteEntry] of Object.entries(remoteProfileData)) {
      const localEntry = localProfileData[key]
      if (!localEntry) mergedProfile[key] = remoteEntry
      else mergedProfile[key] = (remoteEntry?.at || 0) > (localEntry?.at || 0) ? remoteEntry : localEntry
    }
    merged[profileId] = mergedProfile
  }
  return merged
}

function mergeViewingLogMaps(localMap, remoteMap) {
  const merged = { ...localMap }
  for (const [profileId, remoteProfileLog] of Object.entries(remoteMap || {})) {
    if (!remoteProfileLog || typeof remoteProfileLog !== 'object') continue
    const localProfileLog = merged[profileId] || {}
    const mergedProfileLog = { ...localProfileLog }
    for (const [dateKey, remoteDay] of Object.entries(remoteProfileLog)) {
      const localDay = localProfileLog[dateKey]
      if (!localDay) {
        mergedProfileLog[dateKey] = remoteDay
      } else {
        // Merge sessions deduplicated by timestamp+title, sum totalMinutes
        const seen = new Set((localDay.sessions || []).map((s) => `${s.timestamp}:${s.title}`))
        const mergedSessions = [...(localDay.sessions || [])]
        let addedMinutes = 0
        for (const s of remoteDay.sessions || []) {
          const key = `${s.timestamp}:${s.title}`
          if (!seen.has(key)) {
            mergedSessions.push(s)
            addedMinutes += s.minutes || 0
            seen.add(key)
          }
        }
        // Recompute totalMinutes as max of sum vs max to avoid double counting if already merged
        const localTotal = localDay.totalMinutes || 0
        const remoteTotal = remoteDay.totalMinutes || 0
        // If sessions were deduped, use localTotal + addedMinutes; else max
        const mergedTotal = mergedSessions.length === (localDay.sessions?.length || 0) ? Math.max(localTotal, remoteTotal) : localTotal + addedMinutes
        mergedProfileLog[dateKey] = { totalMinutes: mergedTotal, sessions: mergedSessions.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)) }
      }
    }
    // Cap to 365 days newest
    const sortedKeys = Object.keys(mergedProfileLog).sort()
    if (sortedKeys.length > 365) {
      const excess = sortedKeys.length - 365
      for (let i = 0; i < excess; i++) delete mergedProfileLog[sortedKeys[i]]
    }
    merged[profileId] = mergedProfileLog
  }
  return merged
}

function mergeProfilesData(localData, remoteData) {
  const localProfiles = Array.isArray(localData?.profiles) ? localData.profiles : []
  const remoteProfiles = Array.isArray(remoteData?.profiles) ? remoteData.profiles : []
  const mergedById = new Map()
  for (const p of remoteProfiles) if (p?.id) mergedById.set(p.id, p)
  for (const p of localProfiles) if (p?.id) mergedById.set(p.id, p) // local wins on id collision (last write)
  const mergedProfiles = Array.from(mergedById.values()).slice(0, 4)
  // activeProfileId: prefer local if it exists in merged, else remote
  const localActive = localData?.activeProfileId
  const remoteActive = remoteData?.activeProfileId
  const activeProfileId = mergedProfiles.some((p) => p.id === localActive) ? localActive : (mergedProfiles.some((p) => p.id === remoteActive) ? remoteActive : (mergedProfiles[0]?.id || null))
  return { profiles: mergedProfiles, activeProfileId }
}

// ── Pending queue ────────────────────────────────────────────────
function readPendingQueue() {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.warn('[cloudSync] Failed to read pending push queue:', err)
    return []
  }
}

function writePendingQueue(queue) {
  try {
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue))
  } catch (err) {
    console.warn('[cloudSync] Failed to persist pending push queue:', err)
  }
}

function queuePendingPush(storeName) {
  const queue = readPendingQueue()
  if (!queue.includes(storeName)) writePendingQueue([...queue, storeName])
}

// ── Push / Pull ──────────────────────────────────────────────────
export async function pushStore(storeName, userId) {
  if (!supabase || !userId) return { ok: false, reason: 'not-configured' }
  const store = STORES[storeName]
  if (!store) {
    writePendingQueue(readPendingQueue().filter((name) => name !== storeName))
    return { ok: false, reason: 'unknown-store' }
  }

  try {
    const data = readLocal(storeName)
    const { error } = await supabase.from(store.table).upsert(
      { user_id: userId, data },
      { onConflict: 'user_id' }
    )
    if (error) throw error
    writePendingQueue(readPendingQueue().filter((name) => name !== storeName))
    localStorage.setItem(`${PENDING_QUEUE_KEY}_${storeName}_synced_at`, new Date().toISOString())
    return { ok: true }
  } catch (err) {
    console.warn(`[cloudSync] Push failed for "${storeName}", queued for retry:`, err.message || err)
    queuePendingPush(storeName)
    return { ok: false, reason: 'network', error: err }
  }
}

export async function pullStore(storeName, userId) {
  if (!supabase || !userId) return { ok: false, reason: 'not-configured' }
  const store = STORES[storeName]
  if (!store) return { ok: false, reason: 'unknown-store' }

  try {
    const { data: row, error } = await supabase.from(store.table)
      .select('data, updated_at').eq('user_id', userId).maybeSingle()
    if (error) throw error
    if (!row) return { ok: true, reason: 'no-cloud-data' }

    // Merge for per-profile stores, overwrite for global
    let mergedData = row.data
    if (store.scope === 'perProfile') {
      const localMap = readLocal(storeName) || {}
      if (storeName === 'watchProgress') mergedData = mergeWatchProgressMaps(localMap, row.data)
      else if (storeName === 'watched') mergedData = mergeWatchedMaps(localMap, row.data)
      else if (storeName === 'viewingLog') mergedData = mergeViewingLogMaps(localMap, row.data)
    } else if (storeName === 'profiles') {
      const localData = readLocal('profiles')
      mergedData = mergeProfilesData(localData, row.data)
    }

    writeLocal(storeName, mergedData)
    localStorage.setItem(`${PENDING_QUEUE_KEY}_${storeName}_synced_at`, row.updated_at)
    return { ok: true, data: mergedData }
  } catch (err) {
    console.warn(`[cloudSync] Pull failed for "${storeName}":`, err.message || err)
    return { ok: false, reason: 'network', error: err }
  }
}

export async function pushAllStores(userId) {
  const results = {}
  for (const storeName of Object.keys(STORES)) results[storeName] = await pushStore(storeName, userId)
  return results
}

export async function pullAllStores(userId) {
  const results = {}
  for (const storeName of Object.keys(STORES)) results[storeName] = await pullStore(storeName, userId)
  return results
}

export async function flushPendingPushes(userId) {
  if (!supabase || !userId) return
  for (const storeName of readPendingQueue()) await pushStore(storeName, userId)
}

// ── Helpers for SupabaseContext / watchProgress merge ─────────────
export function getLastSyncedAt(storeName) {
  try { return localStorage.getItem(`${PENDING_QUEUE_KEY}_${storeName}_synced_at`) } catch { return null }
}
