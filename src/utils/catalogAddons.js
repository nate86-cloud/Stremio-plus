// Fetches catalogs from the user's configured catalog/metadata addons
// (Settings → Add-ons → Catalog Sources). Unlike Cinemeta (which we know
// offers exactly 'top' and 'year' for movies, 'top' for series — hardcoded
// in hooks/useCinemeta.js), arbitrary third-party addons can declare any
// number of catalogs with any ids/names/types, so we have to actually read
// each addon's manifest.json to discover what it offers before we can
// fetch anything.

import { addonFetch } from './addonFetch'
import { getEnabledAddons } from './addonConfig'

function normalizeCatalogItem(item) {
  if (!item) return null

  const trailerEntry = Array.isArray(item.trailers)
    ? item.trailers.find((t) => t.type === 'Trailer') || item.trailers[0]
    : null

  // Live/IPTV channels often carry EPG-ish fields in extra/manifest meta: schedule, genres, country
  // Preserve them so PlayerView/DetailModal can surface LIVE badge + Now/Next without fabricating data.
  return {
    imdbId: item.id,
    title: item.name,
    year: item.year || (item.releaseInfo ? String(item.releaseInfo).slice(0, 4) : ''),
    posterUrl: item.poster,
    backdropUrl: item.background || item.poster,
    trailerId: trailerEntry?.source || null,
    description: item.description || '',
    genres: item.genres || item.genre || [],
    type: item.type || 'tv',
    videoUrl: null,
    // preserve live-ish extras if addon supplies them (e.g. schedule, country, isLive)
    isLive: item.isLive ?? item.behaviorHints?.isLive ?? ['tv','channel','live'].includes(String(item.type).toLowerCase()),
    behaviorHints: item.behaviorHints || null,
  }
}

// Reads catalogs directly from the addon's already-stored manifest — no
// network call needed here. installAddon() (addonConfig.js) already
// fetched and saved the full manifest at install time, so re-fetching
// manifest.json again on every Home load was a redundant round-trip that
// could fail transiently on a cold app start (e.g. Electron's main
// process or network stack not fully warmed up yet), silently producing
// zero catalog rows until something forced a refetch (like toggling the
// addon off/on, which re-reads the already-good stored manifest data
// through a fresh call). Reading the stored manifest directly removes
// that failure point entirely.
function catalogsFromAddon(addon) {
  const manifest = addon.manifest
  if (!manifest) return []

  const baseUrl = addon.transportUrl.replace(/\/manifest\.json$/, '')
  const catalogs = manifest.catalogs || []

  return catalogs
    .filter((c) => {
      const requiredExtra = (c.extra || []).find((e) => e.isRequired)
      return !requiredExtra
    })
    .map((c) => ({
      addonId: addon.transportUrl,
      addonName: manifest.name || addon.transportUrl,
      addonBaseUrl: baseUrl,
      type: c.type,
      catalogId: c.id,
      name: c.name || `${manifest.name || 'Addon'} — ${c.id}`,
    }))
}

const CATALOG_FETCH_RETRIES = 1
const CATALOG_RETRY_DELAY_MS = 600

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchCatalogItems(catalog) {
  for (let attempt = 0; attempt <= CATALOG_FETCH_RETRIES; attempt += 1) {
    try {
      const url = `${catalog.addonBaseUrl.replace(/\/$/, '')}/catalog/${catalog.type}/${catalog.catalogId}.json`
      const response = await addonFetch(url)
      if (!response.ok) {
        if (attempt < CATALOG_FETCH_RETRIES) {
          await wait(CATALOG_RETRY_DELAY_MS)
          continue
        }
        return []
      }

      const data = await response.json()
      const items = data.metas || []
      return items.map(normalizeCatalogItem).filter(Boolean)
    } catch {
      if (attempt < CATALOG_FETCH_RETRIES) {
        await wait(CATALOG_RETRY_DELAY_MS)
        continue
      }
      return []
    }
  }
  return []
}

export async function fetchAllCatalogRows() {
  const allAddons = getEnabledAddons()
  
  // Filter addons to only those that declare 'catalog' resource
  const catalogAddons = allAddons.filter(addon => {
    if (!addon.manifest || !Array.isArray(addon.manifest.resources)) return false
    const resources = addon.manifest.resources.map(r => typeof r === 'string' ? r : r?.name)
    return resources.includes('catalog')
  })
  
  if (catalogAddons.length === 0) return []

  const allCatalogs = catalogAddons.flatMap(catalogsFromAddon)

  const rows = await Promise.all(
    allCatalogs.map(async (catalog) => {
      const movies = await fetchCatalogItems(catalog)
      const typeLabel = catalog.type === 'series' ? ' — Series' : catalog.type === 'tv' || catalog.type === 'channel' || catalog.type === 'live' ? ' — Live TV' : ''
      return {
        key: `${catalog.addonId}-${catalog.type}-${catalog.catalogId}`,
        title: `${catalog.name}${typeLabel}`,
        addonName: catalog.addonName,
        addonBaseUrl: catalog.addonBaseUrl,
        catalogType: catalog.type,
        catalogId: catalog.catalogId,
        movies,
      }
    })
  )

  return rows.filter((row) => row.movies.length > 0)
}
