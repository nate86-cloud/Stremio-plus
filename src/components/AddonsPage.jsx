import { useState } from 'react'
import { Loader2, Trash2, Puzzle, AlertCircle, Film, Play, Subtitles, Info, Settings, ExternalLink, ArrowLeft } from 'lucide-react'
import GlassToggle from './GlassToggle'
import {
  getInstalledAddons,
  installAddon,
  removeAddon,
  toggleAddon,
  addonHasResource,
} from '../utils/addonConfig'
import { useManifestPreview } from '../services/manifestPreview'


const RESOURCE_BADGES = [
  { resource: 'catalog', label: 'Catalogs', icon: Film },
  { resource: 'stream', label: 'Streams', icon: Play },
  { resource: 'subtitles', label: 'Subtitles', icon: Subtitles },
  { resource: 'meta', label: 'Metadata', icon: Info },
]


// Stremio protocol convention: a configurable addon serves its own config
// UI at {baseUrl}/configure (same base the manifest itself was fetched
// from). manifest.behaviorHints.configurable is the addon's own signal
// that this page exists — not every addon has one, so the button only
// renders when the addon actually declares it, rather than guessing.
function isConfigurable(manifest) {
  return Boolean(manifest?.behaviorHints?.configurable)
}


function getConfigureUrl(transportUrl) {
  return transportUrl.replace(/\/manifest\.json$/, '') + '/configure'
}


function ResourceBadges({ manifest }) {
  const present = RESOURCE_BADGES.filter((b) => addonHasResource({ manifest }, b.resource))
  if (present.length === 0) return null


  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map(({ resource, label, icon: Icon }) => (
        <span
          key={resource}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-accent/15 text-accent"
        >
          <Icon className="w-3 h-3" />
          {label}
        </span>
      ))}
    </div>
  )
}


function ManifestPreviewCard({ manifest, onInstall, isInstalling, alreadyInstalled }) {
  return (
    <div className="glass-panel rounded-2xl p-5 flex items-start gap-4 mb-6 border border-accent/20">
      <div className="w-14 h-14 rounded-2xl bg-accent/15 text-accent flex items-center justify-center shrink-0 overflow-hidden">
        {manifest.logo ? (
          <img src={manifest.logo} alt="" className="w-full h-full object-cover" />
        ) : (
          <Puzzle className="w-6 h-6" />
        )}
      </div>


      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-base font-semibold truncate">{manifest.name}</p>
          {manifest.version && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">v{manifest.version}</span>
          )}
        </div>
        {manifest.description && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">{manifest.description}</p>
        )}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <ResourceBadges manifest={manifest} />
          {isConfigurable(manifest) && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-500/15 text-neutral-500 dark:text-neutral-400">
              <Settings className="w-3 h-3" />
              Configurable
            </span>
          )}
        </div>
      </div>


      <button
        onClick={onInstall}
        disabled={isInstalling || alreadyInstalled}
        className="glass-capsule glass-interactive flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-accent! text-white hover:bg-accent/90! transition-colors duration-200 disabled:opacity-60 shrink-0"
      >
        {isInstalling && <Loader2 className="w-4 h-4 animate-spin" />}
        {alreadyInstalled ? 'Installed' : isInstalling ? 'Installing...' : 'Install'}
      </button>
    </div>
  )
}


function AddonsPage({ onBack }) {
  const [addons, setAddons] = useState(() => getInstalledAddons())
  const [manifestUrl, setManifestUrl] = useState('')
  const [isInstalling, setIsInstalling] = useState(false)
  const [installError, setInstallError] = useState(null)


  const { status: previewStatus, preview, error: previewError } = useManifestPreview(manifestUrl)


  const alreadyInstalled = preview
    ? addons.some((a) => a.transportUrl === preview.transportUrl)
    : false


  async function handleInstall() {
    if (!preview) return
    setIsInstalling(true)
    setInstallError(null)
    try {
      const { addons: updated, alreadyInstalled: wasAlready } = installAddon(
        preview.transportUrl,
        preview.manifest
      )
      setAddons(updated)
      if (!wasAlready) setManifestUrl('')
    } catch (err) {
      console.error('Addon installation failed:', err)
      // Handle specific errors
      if (err.message.includes('quota') || err.message.includes('storage')) {
        setInstallError('Storage full. Remove some add-ons first.')
      } else if (err.name === 'QuotaExceededError') {
        setInstallError('Storage quota exceeded. Try removing some add-ons.')
      } else {
        setInstallError(err.message || 'Could not install this add-on.')
      }
    } finally {
      setIsInstalling(false)
    }
  }


  function handleRemove(addon) {
    setAddons(removeAddon(addon.transportUrl))
  }


  function handleToggle(addon) {
    setAddons(toggleAddon(addon.transportUrl))
  }


  async function handleConfigure(addon) {
    const url = getConfigureUrl(addon.transportUrl)
    if (window.electronAPI?.openExternalUrl) {
      await window.electronAPI.openExternalUrl(url)
    } else {
      // Outside Electron (plain browser dev preview) — a new tab is the
      // closest equivalent; there's no OS-browser distinction to make.
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }


  return (
    <div className="max-w-3xl">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="glass-clear glass-interactive inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 mb-4 -ml-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}
      <h1 className="text-3xl font-semibold mb-1">Add-ons</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-8">
        Install any Stremio-compatible add-on from its manifest URL. Catalogs, streams, and subtitles are all handled automatically based on what the add-on supports.
      </p>


      <div className="glass-panel rounded-3xl p-3 mb-2">
        <input
          type="text"
          value={manifestUrl}
          onChange={(e) => setManifestUrl(e.target.value)}
          placeholder="Paste a manifest URL, e.g. https://torrentio.strem.fun/manifest.json"
          className="w-full rounded-2xl px-6 py-5 text-base bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 outline-none focus:ring-2 focus:ring-accent transition-all duration-200"
        />
      </div>


      {previewStatus === 'loading' && (
        <div className="flex items-center gap-2 px-2 py-3 text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Looking up manifest...
        </div>
      )}


      {previewStatus === 'error' && (
        <p className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {previewError}
        </p>
      )}


      {previewStatus === 'ready' && preview && (
        <ManifestPreviewCard
          manifest={preview.manifest}
          onInstall={handleInstall}
          isInstalling={isInstalling}
          alreadyInstalled={alreadyInstalled}
        />
      )}


      {installError && (
        <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2 mb-4">{installError}</p>
      )}


      {addons.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center mt-6">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No add-ons installed yet.</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl divide-y divide-black/5 dark:divide-white/10 overflow-hidden mt-6">
          {addons.map((addon) => (
            <div key={addon.transportUrl} className="flex items-center gap-4 px-5 py-4">
              <div className="shrink-0" title={addon.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}>
                <GlassToggle checked={addon.enabled} onChange={() => handleToggle(addon)} />
              </div>


              <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0 overflow-hidden">
                {addon.manifest?.logo ? (
                  <img src={addon.manifest.logo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Puzzle className="w-5 h-5" />
                )}
              </div>


              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {addon.manifest ? addon.manifest.name : addon.transportUrl}
                </p>
                <div className="mt-1">
                  <ResourceBadges manifest={addon.manifest} />
                </div>
              </div>


              {isConfigurable(addon.manifest) && (
                <button
                  onClick={() => handleConfigure(addon)}
                  className="glass-interactive flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-200 shrink-0"
                  title="Open this add-on's configuration page"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Configure
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </button>
              )}


              <button
                onClick={() => handleRemove(addon)}
                className="glass-interactive w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:bg-red-500/10 hover:text-red-500 transition-colors duration-200 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


export default AddonsPage