// Single unified store for all installed Stremio-protocol add-ons,
// replacing the old 3-way split (stremio_addon_collection /
// stremio_catalog_addons / stremio_stream_addons). Mirrors official
// Stremio behavior: one manifest URL, one install action, and the
// manifest's own `resources` array determines what the addon feeds
// downstream (Home catalogs, stream search, future subtitle search) —
// there's no separate "type" the user has to pick.
//
// Each entry: { transportUrl, manifest, enabled }
// transportUrl is always the full .../manifest.json URL — the addon's
// canonical identity, same as official Stremio uses.


const STORAGE_KEY = 'stremio_installed_addons'
const SEEDED_FLAG_KEY = 'stremio_installed_addons_seeded'


// Official manifests, installed automatically the first time this app
// runs on a given profile so catalogs, streams and subtitles work out of the box.
// Includes Torrentio for VOD torrent streaming — without it, no stream sources
// would be configured and VOD would always show “No stream sources configured”.
// This is a one-time seed, not an ongoing sync — after first run, the
// user's installed list (including removing these) is authoritative.
const DEFAULT_ADDON_URLS = [
  'https://v3-cinemeta.strem.io/manifest.json',
  'https://opensubtitles-v3.strem.io/manifest.json',
  'https://torrentio.strem.fun/manifest.json',
]


function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Validate that we got an array
    if (!Array.isArray(parsed)) {
      console.warn('Invalid addons data in storage, resetting')
      localStorage.removeItem(STORAGE_KEY)
      return []
    }
    return parsed
  } catch (err) {
    console.error('Failed to read installed addons from storage:', err)
    // If storage is corrupted, clear it to prevent crashes
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.error('Failed to clear corrupted storage:', e)
    }
    return []
  }
}


function writeAll(addons) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addons))
    // Every mutating function (installAddon, removeAddon, toggleAddon,
    // seedDefaultAddonsIfNeeded) routes through here, so dispatching once
    // in this choke point covers all of them — matches the existing
    // stremio:watch-progress-changed / stremio:user-settings-changed
    // pattern SupabaseContext.jsx already listens for, so a Supabase push
    // fires automatically on any addon change rather than needing a
    // manual sync trigger.
    window.dispatchEvent(new CustomEvent('stremio:installed-addons-changed'))
  } catch (err) {
    console.error('Failed to write installed addons to storage:', err)
    // Re-throw storage quota errors so the UI can handle them gracefully
    if (err.name === 'QuotaExceededError' || err.code === 22 || err.message.includes('quota')) {
      throw new Error('Storage quota exceeded. Please remove some add-ons first.', { cause: err })
    }
    throw err
  }
}


function normalizeTransportUrl(url) {
  return url.trim().replace(/\/manifest\.json$/, '') + '/manifest.json'
}


// A manifest's `resources` field can be an array of plain strings
// (["catalog", "stream"]) or an array of objects ({ name: "stream", ... })
// per the Stremio addon protocol — different addons use either form.
function declaredResourceNames(manifest) {
  if (!manifest || !Array.isArray(manifest.resources)) return []
  return manifest.resources.map((r) => (typeof r === 'string' ? r : r?.name)).filter(Boolean)
}


export function addonHasResource(addon, resourceName) {
  return declaredResourceNames(addon.manifest).includes(resourceName)
}


export function getInstalledAddons() {
  return readAll()
}


export function getEnabledAddons() {
  return readAll().filter((a) => a.enabled)
}


// Enabled addons that declare a given resource (e.g. 'catalog', 'stream',
// 'subtitles') — this is the auto-routing: consumers ask for what they
// need by protocol resource, not by a user-picked "addon type".
export function getEnabledAddonsWithResource(resourceName) {
  return getEnabledAddons().filter((a) => addonHasResource(a, resourceName))
}


export function isAddonInstalled(transportUrl) {
  const normalized = normalizeTransportUrl(transportUrl)
  return readAll().some((a) => a.transportUrl === normalized)
}


// Installs an addon from an already-fetched manifest (the AddonsPage
// preview flow fetches the manifest for preview first, then reuses that
// same fetch here rather than fetching twice).
export function installAddon(transportUrl, manifest) {
  const normalized = normalizeTransportUrl(transportUrl)
  const addons = readAll()


  if (addons.some((a) => a.transportUrl === normalized)) {
    return { addons, alreadyInstalled: true }
  }


  const updated = [...addons, { transportUrl: normalized, manifest, enabled: true }]
  writeAll(updated)
  return { addons: updated, alreadyInstalled: false }
}


export function removeAddon(transportUrl) {
  const updated = readAll().filter((a) => a.transportUrl !== transportUrl)
  writeAll(updated)
  return updated
}


export function toggleAddon(transportUrl) {
  const updated = readAll().map((a) =>
    a.transportUrl === transportUrl ? { ...a, enabled: !a.enabled } : a
  )
  writeAll(updated)
  return updated
}


// Fetches and installs the built-in default addons exactly once per profile.
// Now includes Torrentio for VOD — existing users who seeded before Torrentio
// was added will be backfilled on next launch.
export async function seedDefaultAddonsIfNeeded(fetchManifestFn) {
  const isAlreadySeeded = !!localStorage.getItem(SEEDED_FLAG_KEY)
  // If already seeded, only continue if a default addon is missing (backfill for existing installs)
  if (isAlreadySeeded) {
    const installed = readAll().map((a) => a.transportUrl)
    const missing = DEFAULT_ADDON_URLS.some((url) => !installed.includes(normalizeTransportUrl(url)))
    if (!missing) return
  }


  const results = await Promise.allSettled(
    DEFAULT_ADDON_URLS.map(async (url) => {
      const manifest = await fetchManifestFn(url)
      return { url, manifest }
    })
  )


  let anyFailed = false
  const addons = readAll()


  for (const result of results) {
    if (result.status !== 'fulfilled') {
      anyFailed = true
      continue
    }
    const { url, manifest } = result.value
    const normalized = normalizeTransportUrl(url)
    if (!addons.some((a) => a.transportUrl === normalized)) {
      addons.push({ transportUrl: normalized, manifest, enabled: true })
    }
  }


  writeAll(addons)


  if (!anyFailed) {
    localStorage.setItem(SEEDED_FLAG_KEY, 'true')
  }
}