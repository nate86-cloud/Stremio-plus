import { useState, useEffect, useMemo } from 'react'
import { Compass, Filter, ArrowLeftRight } from 'lucide-react'
import { getEnabledAddons } from '../utils/addonConfig'
import { addonFetch } from '../utils/addonFetch'
import VirtualizedMovieGrid from './VirtualizedMovieGrid'
import { MovieGridSkeleton } from './MediaSkeletons'

function normalizeItem(item, type) {
  if (!item) return null
  return {
    imdbId: item.id,
    title: item.name,
    year: item.year || (item.releaseInfo ? String(item.releaseInfo).slice(0, 4) : ''),
    posterUrl: item.poster,
    backdropUrl: item.background || item.poster,
    description: item.description || '',
    genres: item.genres || item.genre || [],
    type: item.type || type,
    videoUrl: null,
  }
}

function catalogsFromAddons(addons) {
  const out = []
  for (const addon of addons) {
    const manifest = addon.manifest
    if (!manifest) continue
    const baseUrl = addon.transportUrl.replace(/\/manifest\.json$/, '')
    const catalogs = manifest.catalogs || []
    for (const c of catalogs) {
      const requiredExtra = (c.extra || []).find((e) => e.isRequired)
      if (requiredExtra) continue
      const resources = (manifest.resources || []).map((r) => (typeof r === 'string' ? r : r?.name))
      if (!resources.includes('catalog')) continue
      out.push({
        key: `${addon.transportUrl}::${c.type}::${c.id}`,
        addonName: manifest.name || addon.transportUrl,
        addonBaseUrl: baseUrl,
        type: c.type,
        catalogId: c.id,
        name: c.name || `${manifest.name || 'Addon'} — ${c.id}`,
        extra: c.extra || [],
      })
    }
  }
  return out
}

export default function DiscoverView({ onSelectMovie }) {
  const [selectedType, setSelectedType] = useState('movie') // movie | series
  const [selectedCatalogKey, setSelectedCatalogKey] = useState('')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const allCatalogs = useMemo(() => {
    const addons = getEnabledAddons()
    return catalogsFromAddons(addons)
  }, [])

  const filteredCatalogs = useMemo(() => {
    return allCatalogs.filter((c) => c.type === selectedType)
  }, [allCatalogs, selectedType])

  // Auto-select first catalog when type changes or on mount
  useEffect(() => {
    if (filteredCatalogs.length === 0) {
      setSelectedCatalogKey('')
      return
    }
    const stillValid = filteredCatalogs.some((c) => c.key === selectedCatalogKey)
    if (!stillValid) setSelectedCatalogKey(filteredCatalogs[0].key)
  }, [filteredCatalogs, selectedCatalogKey])

  const selectedCatalog = useMemo(() => {
    return filteredCatalogs.find((c) => c.key === selectedCatalogKey) || null
  }, [filteredCatalogs, selectedCatalogKey])

  // Fetch catalog items
  useEffect(() => {
    if (!selectedCatalog) {
      setItems([])
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError('')
    setSelectedGenre('All')
    const url = `${selectedCatalog.addonBaseUrl.replace(/\/$/, '')}/catalog/${selectedCatalog.type}/${selectedCatalog.catalogId}.json`
    addonFetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const metas = data.metas || []
        setItems(metas.map((m) => normalizeItem(m, selectedCatalog.type)).filter(Boolean))
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message || 'Failed to load catalog')
        setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedCatalog])

  const genres = useMemo(() => {
    const set = new Set()
    for (const m of items) for (const g of m.genres || []) set.add(g)
    return ['All', ...Array.from(set).sort()]
  }, [items])

  const filteredItems = useMemo(() => {
    if (selectedGenre === 'All') return items
    return items.filter((m) => (m.genres || []).includes(selectedGenre))
  }, [items, selectedGenre])

  return (
    <div className="animate-fadeIn">
      {/* Header like Stremio Discover */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
          <Compass className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Discover</h2>
        </div>
      </div>

      {/* Filters bar - compact */}
      <div className="glass-panel rounded-2xl p-2 flex flex-wrap gap-2 items-center mb-6 max-w-3xl">
        {/* Type */}
        <div className="flex items-center gap-1 glass-capsule px-1 py-0.5">
          {['movie', 'series'].map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${selectedType === t ? 'bg-accent text-white' : 'text-neutral-500 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10'}`}
            >
              {t === 'movie' ? 'Movies' : 'Series'}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-black/10 dark:bg-white/10 hidden sm:block" />

        {/* Catalog */}
        <div className="flex items-center gap-1.5">
          <ArrowLeftRight className="w-3.5 h-3.5 text-neutral-400 hidden sm:block" />
          <select
            value={selectedCatalogKey}
            onChange={(e) => setSelectedCatalogKey(e.target.value)}
            className="glass-capsule px-2.5 py-1 text-xs bg-transparent outline-none cursor-pointer max-w-[160px] truncate"
          >
            {filteredCatalogs.length === 0 && <option>No catalogs</option>}
            {filteredCatalogs.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name} • {c.addonName}
              </option>
            ))}
          </select>
        </div>

        <div className="w-px h-6 bg-black/10 dark:bg-white/10 hidden sm:block" />

        {/* Genre */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-neutral-400 hidden sm:block" />
          <select
            value={selectedGenre}
            onChange={(e) => setSelectedGenre(e.target.value)}
            className="glass-capsule px-2.5 py-1 text-xs bg-transparent outline-none cursor-pointer"
          >
            {genres.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>


      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {isLoading ? <MovieGridSkeleton count={12} /> : <VirtualizedMovieGrid movies={filteredItems} onSelectMovie={onSelectMovie} />}
    </div>
  )
}
