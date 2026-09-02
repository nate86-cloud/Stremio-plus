// Base URLs for the official Stremio account API and the Cinemeta metadata addon
const STREMIO_API_BASE = 'https://api.strem.io/api'
const CINEMETA_BASE = 'https://v3-cinemeta.strem.io'
const ADDON_CACHE_KEY = 'stremio_addon_collection'
const REQUEST_RETRIES = 2
const RETRY_DELAY_MS = 350

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Cinemeta and stream addons expect the canonical IMDb identifier form.
export function normalizeImdbId(imdbId) {
  if (!imdbId) return ''
  const normalized = String(imdbId).trim()
  return /^tt\d+$/i.test(normalized)
    ? `tt${normalized.slice(2)}`
    : /^\d+$/.test(normalized)
      ? `tt${normalized}`
      : ''
}

// --- Local auth key storage ---
// Stremio's own apps store the logged-in user's authKey in localStorage
// under this same key, so we mirror that convention here.

function getStoredAuthKey() {
  return localStorage.getItem('stremio_auth_key')
}

function setStoredAuthKey(key) {
  if (key) {
    localStorage.setItem('stremio_auth_key', key)
  } else {
    localStorage.removeItem('stremio_auth_key')
  }
}

// --- Low-level request helper ---
// Every Stremio API call is a POST with a JSON body; successful responses
// come back as { result: {...} }, errors come back as { error: {...} }.

async function stremioRequest(endpoint, body) {
  let lastError = null

  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
    try {
      const response = await fetch(`${STREMIO_API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error(`Stremio API request failed (${response.status})`)
      }

      const data = await response.json()
      if (data.error) {
        throw new Error(data.error.message || 'Stremio API request failed')
      }

      return data.result
    } catch (error) {
      lastError = error
      console.warn(`[stremioApi] ${endpoint} attempt ${attempt + 1}/${REQUEST_RETRIES + 1} failed:`, error.message)
      if (attempt < REQUEST_RETRIES) await wait(RETRY_DELAY_MS * (attempt + 1))
    }
  }

  throw lastError || new Error(`Stremio API request failed: ${endpoint}`)
}

// --- Authentication ---

export async function login(email, password) {
  const result = await stremioRequest('login', { email, password })
  setStoredAuthKey(result.authKey)
  const profile = await syncStremioProfile()
  return { ...result, profile }
}

export async function logout() {
  const authKey = getStoredAuthKey()
  if (authKey) {
    try {
      await stremioRequest('logout', { authKey })
    } catch (err) {
      // Even if the server call fails, we still clear the local key
      console.warn('Logout request failed, clearing local session anyway:', err.message)
    }
  }
  setStoredAuthKey(null)
}

export async function getUser() {
  const authKey = getStoredAuthKey()
  if (!authKey) return null
  return stremioRequest('getUser', { authKey })
}

export function isLoggedIn() {
  return !!getStoredAuthKey()
}

// --- Library sync ---
// Stremio's "datastore" is a generic key-value sync system; the library
// uses collection "libraryItem". We fetch all IDs, then fetch full items.

export async function getLibrary() {
  const authKey = getStoredAuthKey()
  if (!authKey) throw new Error('Not logged in')

  const meta = await stremioRequest('datastoreMeta', {
    authKey,
    collection: 'libraryItem',
  })

  const ids = meta.map((item) => item[0])
  if (ids.length === 0) return []

  const items = await stremioRequest('datastoreGet', {
    authKey,
    collection: 'libraryItem',
    ids,
    all: false,
  })

  return items
}

// Pull the authoritative profile data after authentication instead of
// depending on state left over in the renderer's local storage.
export async function syncStremioProfile() {
  const [addonsResult, libraryResult, settingsResult] = await Promise.allSettled([
    getAddonCollection(),
    getLibrary(),
    getProfileSettings(),
  ])

  const profile = {
    addons: addonsResult.status === 'fulfilled' ? addonsResult.value : null,
    library: libraryResult.status === 'fulfilled' ? libraryResult.value : null,
    settings: settingsResult.status === 'fulfilled' ? settingsResult.value : null,
  }

  if (addonsResult.status === 'rejected') {
    console.warn('Failed to pull installed Stremio add-ons:', addonsResult.reason)
  }
  if (libraryResult.status === 'rejected') {
    console.warn('Failed to pull Stremio library:', libraryResult.reason)
  }
  if (settingsResult.status === 'rejected') {
    console.warn('Failed to pull Stremio profile settings:', settingsResult.reason)
  }

  return profile
}

const PROFILE_STATE_ID = 'preferences'

export async function getProfileSettings() {
  const authKey = getStoredAuthKey()
  if (!authKey) throw new Error('Not logged in')
  const items = await stremioRequest('datastoreGet', {
    authKey,
    collection: 'profileState',
    ids: [PROFILE_STATE_ID],
    all: false,
  })
  return items.find((item) => item._id === PROFILE_STATE_ID)?.settings || {}
}

export async function saveProfileSettings(settings) {
  const authKey = getStoredAuthKey()
  if (!authKey) throw new Error('Not logged in')
  return stremioRequest('datastorePut', {
    authKey,
    collection: 'profileState',
    changes: [{
      _id: PROFILE_STATE_ID,
      settings,
      _mtime: new Date().toISOString(),
    }],
  })
}

export async function saveLibraryItem(item) {
  const authKey = getStoredAuthKey()
  if (!authKey) throw new Error('Not logged in')

  return stremioRequest('datastorePut', {
    authKey,
    collection: 'libraryItem',
    changes: [item],
  })
}

// --- Watchlist / Library item add-remove ---
// Builds a real Stremio library item from our normalized movie object and
// syncs it via datastorePut, matching the exact shape the real Stremio app
// uses (confirmed against real account data: _id, removed, temp, _ctime,
// _mtime, state, name, type, poster).

export async function addToWatchlist(movie) {
  const now = new Date().toISOString()
  const item = {
    _id: movie.imdbId,
    removed: false,
    temp: false,
    _ctime: now,
    _mtime: now,
    state: {
      lastWatched: null,
      timeWatched: 0,
      timeOffset: 0,
      overallTimeWatched: 0,
      timesWatched: 0,
      flaggedWatched: 0,
      duration: 0,
      video_id: movie.imdbId,
      watched: null,
      noNotif: false,
      season: 0,
      episode: 0,
    },
    name: movie.title,
    type: movie.type || 'movie',
    poster: movie.posterUrl,
  }

  return saveLibraryItem(item)
}

export async function removeFromWatchlist(movie) {
  const now = new Date().toISOString()
  // Stremio's datastore uses soft-deletes: marking removed: true and
  // syncing that change, rather than a separate delete endpoint.
  const item = {
    _id: movie.imdbId,
    removed: true,
    temp: false,
    _ctime: now,
    _mtime: now,
    state: {
      lastWatched: null,
      timeWatched: 0,
      timeOffset: 0,
      overallTimeWatched: 0,
      timesWatched: 0,
      flaggedWatched: 0,
      duration: 0,
      video_id: movie.imdbId,
      watched: null,
      noNotif: false,
      season: 0,
      episode: 0,
    },
    name: movie.title,
    type: movie.type || 'movie',
    poster: movie.posterUrl,
  }

  return saveLibraryItem(item)
}

// Checks whether a given IMDb id is currently in the user's library
// (and not soft-deleted). Used to show "Add" vs "Remove" state correctly.
export async function isInWatchlist(imdbId) {
  const authKey = getStoredAuthKey()
  if (!authKey || !imdbId) return false

  try {
    const items = await getLibrary()
    const match = items.find((item) => item._id === imdbId)
    return !!match && !match.removed
  } catch {
    return false
  }
}


// --- Addon collection (installed add-ons) ---

export async function getAddonCollection() {
  const authKey = getStoredAuthKey()
  if (!authKey) throw new Error('Not logged in')

  const result = await stremioRequest('addonCollectionGet', { authKey })
  const addons = Array.isArray(result) ? result : Array.isArray(result?.addons) ? result.addons : []
  localStorage.setItem(ADDON_CACHE_KEY, JSON.stringify(addons))
  return addons
}

export function getCachedAddonCollection() {
  try {
    const raw = localStorage.getItem(ADDON_CACHE_KEY)
    const addons = raw ? JSON.parse(raw) : []
    return Array.isArray(addons) ? addons : []
  } catch (err) {
    console.warn('Failed to read cached add-on collection:', err.message)
    return []
  }
}

export async function setAddonCollection(addons) {
  const authKey = getStoredAuthKey()
  if (!authKey) throw new Error('Not logged in')

  const result = await stremioRequest('addonCollectionSet', { authKey, addons })
  localStorage.setItem(ADDON_CACHE_KEY, JSON.stringify(addons))
  return result
}

// --- Addon catalog querying (public, no auth needed) ---
// Any Stremio addon (including Cinemeta) exposes a manifest.json describing
// what it offers, and /catalog/{type}/{id}.json endpoints for content.

export async function fetchAddonManifest(addonBaseUrl) {
  const url = addonBaseUrl.replace(/\/$/, '')
  const response = await fetch(`${url}/manifest.json`)
  if (!response.ok) throw new Error('Failed to fetch addon manifest')
  return response.json()
}

export async function fetchCatalog(type, catalogId, addonBaseUrl = CINEMETA_BASE) {
  const url = addonBaseUrl.replace(/\/$/, '')
  const response = await fetch(`${url}/catalog/${type}/${catalogId}.json`)
  if (!response.ok) throw new Error('Failed to fetch catalog')
  const data = await response.json()
  return data.metas || []
}

export async function fetchMeta(type, imdbId, addonBaseUrl = CINEMETA_BASE) {
  const url = addonBaseUrl.replace(/\/$/, '')
  const canonicalId = normalizeImdbId(imdbId)
  if (!canonicalId) throw new Error('Invalid IMDb ID')
  const response = await fetch(`${url}/meta/${type}/${encodeURIComponent(canonicalId)}.json`)
  if (!response.ok) throw new Error('Failed to fetch metadata')
  const data = await response.json()
  return data.meta
}

// Cinemeta (and most addons implementing the "search" extra) support
// querying its 'top' catalog with a search term via the URL segment
// /catalog/{type}/top/search={query}.json — this hits Cinemeta's full
// title index rather than whatever page of "top"/"year" we've already
// loaded into memory, so it can surface anything in its catalog.
export async function searchCatalog(type, query, addonBaseUrl = CINEMETA_BASE) {
  const url = addonBaseUrl.replace(/\/$/, '')
  const response = await fetch(`${url}/catalog/${type}/top/search=${encodeURIComponent(query)}.json`)
  if (!response.ok) throw new Error('Search request failed')
  const data = await response.json()
  return data.metas || []
}

export const CINEMETA_ADDON_URL = CINEMETA_BASE
